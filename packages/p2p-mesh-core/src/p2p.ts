/**
 * P2P Mesh Core — Orchestrator
 *
 * This file is the public entry point for the P2P mesh. It re-exports all types
 * from sub-modules (preserving the public API) and defines the P2PManager class
 * which delegates to extracted modules:
 *
 *   - p2p/sync-types.ts      → SyncMessage, ConnectionErrorInfo, PeerHealthInfo
 *   - p2p/crypto-handshake.ts → PQC key generation, signing, verification
 *   - p2p/permissions.ts      → Authority checks, role validation
 *   - p2p/yjs-sync.ts         → Yjs CRDT state-vector exchange
 *   - p2p/message-handler.ts  → Message routing, connection lifecycle
 */
import { createPeerHealthMonitor, getReconnectDelay, type PeerHealthState } from 'edge-mesh';
import { type DataConnection, Peer } from 'peerjs';
import { encryptData as encryptDataHelper } from './crypto';
import { toHex as toHexHelper } from './crypto-pqc';
import { dbSync } from './database-sync';
import type { P2PRole, PeerInfo } from './types';
import { logger, setLoggerPeerId } from './utils/logger';

// ─── Re-export all types (preserves public API) ────────────────────────────
export type {
  ConnectionErrorInfo,
  HandshakeRequestPayload,
  HandshakeResponsePayload,
  PeerHealthInfo,
  SyncMessage,
} from './p2p/sync-types';

// ─── Import extracted modules ──────────────────────────────────────────────
import { loadOrGenerateKeys, sign as pqcSign, verify as pqcVerify } from './p2p/crypto-handshake';
import type { MessageHandlerContext } from './p2p/message-handler';
import { handleMessage, onConnectionOpen } from './p2p/message-handler';
import { isAuthorityMessage, isLocalAuthorityPeer, shouldEncryptMessage } from './p2p/permissions';
import type {
  ConnectionErrorInfo,
  HandshakeRequestPayload,
  HandshakeResponsePayload,
  PeerHealthInfo,
  SyncMessage,
} from './p2p/sync-types';
import type { YjsSyncContext } from './p2p/yjs-sync';
import { initYjsSync, requestYjsSync, sendYjsDiff } from './p2p/yjs-sync';

class P2PManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private connectingPeers: Set<string> = new Set();
  private sharedSecrets: Map<string, Uint8Array> = new Map();
  private encryptionKeys: Map<string, CryptoKey> = new Map();
  /** Peers for which we hold AES key AND received ENCRYPTION_READY (mutual). */
  private dualReadyEncryption: Set<string> = new Set();
  /** ENCRYPTION_READY arrived before our setupEncryption finished. */
  private pendingEncryptionReady: Set<string> = new Set();
  /**
   * When true (default), YJS_* is app-layer encrypted only after dual-ready.
   * Before dual-ready, YJS falls back to WebRTC DTLS (plain SyncMessage).
   * Set false to force DTLS-only for YJS (debug / regression).
   */
  public encryptYjsWhenDualReady = true;
  /**
   * Phase E wire path for local CRDT patches:
   * - `legacy`: always YJS_UPDATE (encrypted when dual-ready)
   * - `envelope-when-ready`: when all connected peers are dual-ready and an
   *   edgeYjsRelay is registered, broadcast via EDGE_MESH_ENVELOPE SYNC only
   *   (collapses dual protocol to a single type for that mesh).
   */
  public yjsWireMode: 'legacy' | 'envelope-when-ready' = 'envelope-when-ready';
  /** Set by EdgeMeshTransportBinder to publish CRDT via edge-mesh envelopes. */
  private edgeYjsRelay: ((update: Uint8Array, branchId?: string) => Promise<void>) | null = null;
  private peerBranches: Map<string, string> = new Map();
  private health = createPeerHealthMonitor({
    staleAfterMs: 30000,
    offlineAfterMs: 60000,
  });

  private reconnectionAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30000;
  private readonly INITIAL_RECONNECT_DELAY = 1000;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;

  // Per-peer pong tracking: peerId -> timestamp of last PING sent
  private pendingPings: Map<string, number> = new Map();
  private readonly PING_INTERVAL = 30000;
  private readonly PONG_TIMEOUT = 10000;

  private onMessageCallbacks: ((message: SyncMessage, fromPeerId: string) => void)[] = [];
  private onConnectionChangeCallbacks: ((peers: PeerInfo[]) => void)[] = [];
  private onHandshakeRequestCallbacks: ((payload: HandshakeRequestPayload, fromPeerId: string) => void)[] = [];
  private onHandshakeResponseCallbacks: ((payload: HandshakeResponsePayload, fromPeerId: string) => void)[] = [];
  private onRecoveryRequestCallbacks: ((
    requestId: string,
    email: string,
    deviceName: string,
    fromPeerId: string,
  ) => void)[] = [];
  private onConnectionErrorCallbacks: ((issue: ConnectionErrorInfo) => void)[] = [];
  private onPeerHealthChangeCallbacks: ((state: PeerHealthInfo) => void)[] = [];
  private onEdgeMeshEnvelopeCallbacks: ((
    envelope: import('./p2p-transport-adapter').EdgeMeshEnvelopeWire,
    fromPeerId: string,
  ) => void)[] = [];
  private healthEventsBound = false;

  public localPeerId: string | null = null;
  public role: P2PRole = 'collaborator';
  private peers: PeerInfo[] = [];
  private lastMessageTime = new Map<string, number>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pendingConnectionRequests = new Set<string>();
  private pendingChallenges: Map<string, Set<string>> = new Map();
  private peerDsaKeys: Map<string, string> = new Map();

  // PQC Keypairs
  private kemKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array } = loadOrGenerateKeys('kem');
  private dsaKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array } = loadOrGenerateKeys('dsa');

  public sign(message: Uint8Array): Uint8Array {
    return pqcSign(message, this.dsaKeyPair.secretKey);
  }

  public verify(signature: Uint8Array, message: Uint8Array, publicKeyHex: string): boolean {
    return pqcVerify(signature, message, publicKeyHex);
  }

  private yjsSyncInitialized = false;
  private readonly yjsRetryDelays = [750, 2500];

  /**
   * Phase E: host app registers EdgeMesh.broadcastYjsUpdate as the envelope path.
   * Pass null to detach (falls back to legacy YJS_UPDATE).
   */
  public setEdgeYjsRelay(relay: ((update: Uint8Array, branchId?: string) => Promise<void>) | null): void {
    this.edgeYjsRelay = relay;
  }

  /** True when every open connection is dual-ready for app-layer crypto. */
  public areAllConnectedPeersDualReady(): boolean {
    const peers = this.getConnectedPeerIds();
    if (peers.length === 0) return false;
    return peers.every((id) => this.dualReadyEncryption.has(id));
  }

  /** Observability: which wire path local CRDT patches will use. */
  public getActiveYjsWirePath(): 'legacy-yjs' | 'edge-envelope' | 'idle' {
    if (this.getConnectedPeerIds().length === 0) return 'idle';
    if (this.yjsWireMode === 'envelope-when-ready' && this.edgeYjsRelay && this.areAllConnectedPeersDualReady()) {
      return 'edge-envelope';
    }
    return 'legacy-yjs';
  }

  private initYjsSyncBridge() {
    if (this.yjsSyncInitialized) return;
    this.yjsSyncInitialized = true;

    const ctx: YjsSyncContext = this.buildYjsSyncContext();

    // The initYjsSync function has its own `initialized` guard,
    // but we use our own flag to avoid rebuilding the context.
    initYjsSync(ctx, this.yjsRetryDelays, {
      get value() {
        return true;
      },
      set value(_v: boolean) {
        // no-op — already initialized
      },
    });
  }

  private emitMessageCallbacks(message: SyncMessage, fromPeerId: string) {
    for (const cb of this.onMessageCallbacks) {
      cb(message, fromPeerId);
    }
  }

  private emitConnectionError(issue: ConnectionErrorInfo) {
    for (const cb of this.onConnectionErrorCallbacks) {
      cb(issue);
    }
  }

  private bindPeerHealthEvents() {
    if (this.healthEventsBound) return;
    this.healthEventsBound = true;

    const emit = (state: PeerHealthState) => {
      for (const cb of this.onPeerHealthChangeCallbacks) {
        cb(state);
      }
      const status = state.status === 'offline' ? 'offline' : state.status === 'stale' ? 'connected' : 'verified';
      dbSync.updateEphemeralNode(state.peerId, { status });
      this.notifyConnectionChange();
    };

    this.health.on('peer:healthy', emit);
    this.health.on('peer:stale', emit);
    this.health.on('peer:offline', emit);
  }

  private buildYjsSyncContext(): YjsSyncContext {
    return {
      sendTo: (peerId, message) => this.sendTo(peerId, message),
      broadcast: (message) => this.broadcast(message),
      yjsWireMode: this.yjsWireMode,
      edgeYjsRelay: this.edgeYjsRelay,
      areAllConnectedPeersDualReady: () => this.areAllConnectedPeersDualReady(),
      connections: this.connections as any,
    };
  }

  private buildMessageHandlerContext(): MessageHandlerContext {
    return {
      ...this.buildYjsSyncContext(),
      localPeerId: this.localPeerId,
      role: this.role,
      kemKeyPair: this.kemKeyPair,
      dsaKeyPair: this.dsaKeyPair,
      sharedSecrets: this.sharedSecrets,
      encryptionKeys: this.encryptionKeys,
      peerDsaKeys: this.peerDsaKeys,
      pendingChallenges: this.pendingChallenges,
      dualReadyEncryption: this.dualReadyEncryption,
      pendingEncryptionReady: this.pendingEncryptionReady,
      connectingPeers: this.connectingPeers,
      peers: this.peers,
      lastMessageTime: this.lastMessageTime,
      peerBranches: this.peerBranches,
      pendingPings: this.pendingPings,
      health: {
        markConnected: (id) => this.health.markConnected(id),
        markOffline: (id) => this.health.markOffline(id),
        markPing: (id) => this.health.markPing(id),
        markPong: (id) => this.health.markPong(id),
      },
      emitMessageCallbacks: (msg, from) => this.emitMessageCallbacks(msg, from),
      emitConnectionError: (issue) => this.emitConnectionError(issue),
      onMessageCallbacks: this.onMessageCallbacks,
      onHandshakeRequestCallbacks: this.onHandshakeRequestCallbacks,
      onHandshakeResponseCallbacks: this.onHandshakeResponseCallbacks,
      onRecoveryRequestCallbacks: this.onRecoveryRequestCallbacks,
      onEdgeMeshEnvelopeCallbacks: this.onEdgeMeshEnvelopeCallbacks,
      updatePeerList: (id, role) => this.updatePeerList(id, role),
      broadcastPeerList: () => this.broadcastPeerList(),
      notifyConnectionChange: () => this.notifyConnectionChange(),
      connect: (peerId) => this.connect(peerId),
      clearPeerCrypto: (peerId) => this.clearPeerCrypto(peerId),
      signFn: (msg) => this.sign(msg),
      verifyFn: (sig, msg, key) => this.verify(sig, msg, key),
    };
  }

  public init(peerId?: string) {
    if (this.peer && !this.peer.destroyed) return;
    this.initYjsSyncBridge();
    this.bindPeerHealthEvents();

    let finalPeerId = peerId;
    if (!finalPeerId && typeof localStorage !== 'undefined') {
      finalPeerId = localStorage.getItem('shelf_local_peer_id') || undefined;
    }

    // Check if we are in development mode without depending on Node globals.
    const isLocalBrowser =
      typeof globalThis !== 'undefined' &&
      'location' in globalThis &&
      ['localhost', '127.0.0.1', '::1'].includes(
        (globalThis as { location?: { hostname?: string } }).location?.hostname || '',
      );
    const isDev =
      isLocalBrowser ||
      (typeof globalThis !== 'undefined' &&
        'process' in globalThis &&
        !!(globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env &&
        (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'development');
    const peerOptions = isDev
      ? {
          host: '127.0.0.1',
          port: 9000,
          path: '/',
          secure: false,
          pingInterval: 5000,
          debug: 1,
          config: {
            iceServers: [],
          },
        }
      : {
          debug: 1,
          pingInterval: 5000,
        };

    this.peer = finalPeerId ? new Peer(finalPeerId, peerOptions) : new Peer(peerOptions);

    this.peer.on('open', (id) => {
      this.localPeerId = id;
      dbSync.localPeerId = id; // Sync local peer ID to dbSync for permissions and role resolution
      setLoggerPeerId(id);
      this.reconnectionAttempts = 0;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('shelf_local_peer_id', id);
      }
      logger.log(`My peer ID is: ${id}`);
      // Master node is admin by default
      if (finalPeerId === 'shelf-master') {
        this.role = 'admin';
      }

      // Sync role to dbSync for GC coordination
      dbSync.masterRole = this.role;

      const currentMaster = dbSync.getMasterPeerId();
      if (!currentMaster) {
        dbSync.setMasterPeerId(id);
        dbSync.updateLinkedNode(
          id,
          {
            role: 'admin',
            isMaster: true,
            status: 'verified',
            dsaPublicKey: toHexHelper(this.dsaKeyPair.publicKey),
          },
          id,
        );
        // Force local role to admin as well to repair state
        this.role = 'admin';
        this.updatePeerList(id, 'admin');
        this.notifyConnectionChange();
      } else if (currentMaster === id) {
        const existingNode = dbSync.getLinkedNodes().find((n) => n.id === id);
        const dsaPubKey = toHexHelper(this.dsaKeyPair.publicKey);

        if (!existingNode || existingNode.dsaPublicKey === dsaPubKey) {
          this.role = 'admin';
          dbSync.updateLinkedNode(
            id,
            {
              role: 'admin',
              isMaster: true,
              status: 'verified',
              dsaPublicKey: dsaPubKey,
            },
            id,
          );
          this.updatePeerList(id, 'admin');
          this.notifyConnectionChange();
        } else {
          logger.error('[SECURITY] Local DSA key does not match master key in CRDT. Fallback to collaborator.');
          this.role = 'collaborator';
        }
      }

      this.flushPendingConnections();

      // Start heartbeat/GC loop
      this.heartbeatInterval = setInterval(() => {
        this.runHeartbeat();
      }, 30000);
    });

    this.peer.on('connection', (conn) => {
      this.handleConnection(conn);
    });

    this.peer.on('disconnected', () => {
      if (this.reconnectionAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        logger.error(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
        return;
      }
      const delay = getReconnectDelay(this.reconnectionAttempts, {
        initialDelayMs: this.INITIAL_RECONNECT_DELAY,
        maxDelayMs: this.MAX_RECONNECT_DELAY,
      });
      logger.warn(`PeerJS disconnected. Retrying in ${delay}ms (attempt ${this.reconnectionAttempts + 1})...`);

      setTimeout(() => {
        if (!this.peer?.destroyed && this.peer?.disconnected) {
          this.reconnectionAttempts++;
          this.peer?.reconnect();
        }
      }, delay);
    });

    this.peer.on('error', (err: unknown) => {
      logger.error('PeerJS error:', err);
      const typedErr = err as { type?: string };
      if (typedErr.type === 'unavailable-id') {
        if (this.reconnectionAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
          logger.error(
            `Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for unavailable-id. Giving up.`,
          );
          return;
        }
        const delay = getReconnectDelay(this.reconnectionAttempts, {
          initialDelayMs: this.INITIAL_RECONNECT_DELAY,
          maxDelayMs: this.MAX_RECONNECT_DELAY,
        });
        logger.warn(`Peer ID taken. Retrying in ${delay}ms (attempt ${this.reconnectionAttempts + 1})...`);

        // Destroy old peer and re-init with a fresh ID after a short delay
        this.peer?.destroy();
        this.peer = null;
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('shelf_local_peer_id');
        }
        setTimeout(() => {
          this.reconnectionAttempts++;
          this.init(undefined);
        }, delay);
        return;
      }

      if (
        typedErr.type === 'network' ||
        typedErr.type === 'server-error' ||
        typedErr.type === 'socket-error' ||
        typedErr.type === 'socket-closed' ||
        (err instanceof Error && err.message.includes('Lost connection to server'))
      ) {
        if (this.reconnectionAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
          logger.error('Max reconnection attempts reached for network error. Giving up.');
          return;
        }
        const delay = getReconnectDelay(this.reconnectionAttempts, {
          initialDelayMs: this.INITIAL_RECONNECT_DELAY,
          maxDelayMs: this.MAX_RECONNECT_DELAY,
        });
        logger.warn(`Network error (${typedErr.type || 'disconnected'}). Retrying in ${delay}ms...`);
        setTimeout(() => {
          if (!this.peer?.destroyed) {
            this.reconnectionAttempts++;
            if (this.peer?.disconnected) {
              this.peer.reconnect();
            } else {
              this.init(this.localPeerId);
            }
          }
        }, delay);
        return;
      }

      this.emitConnectionError({
        source: 'peerjs',
        type: typedErr.type,
        message: err instanceof Error ? err.message : 'No se pudo inicializar la conexión P2P.',
      });
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.peer?.destroy();
      });
    }
  }

  private handleConnection(conn: DataConnection) {
    const ctx = this.buildMessageHandlerContext();

    conn.on('data', async (data) => {
      await handleMessage(ctx, conn, data);
    });

    conn.on('close', () => {
      this.connectingPeers.delete(conn.peer);
      const currentConn = this.connections.get(conn.peer);
      if (currentConn && currentConn !== conn) {
        // Superseded duplicate connection closing; do not tear down active connection
        return;
      }
      this.clearPeerCrypto(conn.peer);
      this.connections.delete(conn.peer);
      this.sharedSecrets.delete(conn.peer);
      this.lastMessageTime.delete(conn.peer);
      this.peers = this.peers.filter((p) => p.id !== conn.peer);
      this.notifyConnectionChange();
      this.health.markOffline(conn.peer);

      // Mark offline in ephemeral state
      dbSync.updateEphemeralNode(conn.peer, {
        status: 'offline',
      });
    });

    conn.on('error', (err: unknown) => {
      this.connectingPeers.delete(conn.peer);
      logger.error(`Connection error with peer ${conn.peer}:`, err);
      this.emitConnectionError({
        peerId: conn.peer,
        source: 'connection',
        type: (err as { type?: string } | undefined)?.type,
        message: err instanceof Error ? err.message : `No se pudo conectar al peer ${conn.peer}.`,
      });

      // Force cleanup so the UI and presence state can recover immediately.
      if (conn.open) {
        conn.close();
      }
    });

    const onOpen = () => {
      onConnectionOpen(ctx, conn);
    };
    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }
  }

  public connect(peerId: string) {
    if (this.connections.has(peerId) || this.connectingPeers.has(peerId)) return;
    if (!this.peer || !this.localPeerId || this.peer.destroyed || !this.peer.open) {
      this.pendingConnectionRequests.add(peerId);
      return;
    }
    this.connectingPeers.add(peerId);
    const conn = this.peer.connect(peerId);
    this.handleConnection(conn);
  }

  private flushPendingConnections() {
    if (!this.peer || !this.localPeerId || this.peer.destroyed || !this.peer.open) return;

    for (const peerId of Array.from(this.pendingConnectionRequests)) {
      this.pendingConnectionRequests.delete(peerId);
      if (!this.connections.has(peerId) && !this.connectingPeers.has(peerId)) {
        this.connectingPeers.add(peerId);
        const conn = this.peer.connect(peerId);
        this.handleConnection(conn);
      }
    }
  }

  private runHeartbeat() {
    const now = Date.now();
    for (const [peerId, conn] of this.connections.entries()) {
      if (!conn.open) {
        this.health.markOffline(peerId);
        conn.close(); // Triggers the 'close' event handler which cleans up
        continue;
      }

      // Check if we are waiting for a PONG response from a previous PING
      const pingSentAt = this.pendingPings.get(peerId);
      if (pingSentAt !== undefined) {
        if (now - pingSentAt > this.PONG_TIMEOUT) {
          // No pong received within 10s — consider peer disconnected
          logger.warn(`Pong timeout for peer ${peerId} (${now - pingSentAt}ms). Closing connection.`);
          this.pendingPings.delete(peerId);
          this.health.markOffline(peerId);
          conn.close();
          continue;
        }
        // Still waiting, skip sending another PING
        continue;
      }

      // Check for inactivity (no message of any kind received)
      const lastSeen = this.lastMessageTime.get(peerId) || now;
      if (now - lastSeen > 60000) {
        // 1 minute timeout
        logger.warn(`Peer ${peerId} heartbeat inactivity timeout (${now - lastSeen}ms). Closing connection.`);
        this.health.markOffline(peerId);
        conn.close();
        continue;
      }

      // Send PING and track it
      this.pendingPings.set(peerId, now);
      this.health.markPing(peerId);
      conn.send({ type: 'PING', peerId: this.localPeerId, timestamp: now });
    }
    this.health.sweep();
  }

  public isPeerConnected(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return conn ? conn.open : false;
  }

  public broadcast(message: SyncMessage) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        // Branch filtering for YJS_UPDATE
        if (message.type === 'YJS_UPDATE' && message.payload.branchId) {
          const peerBranch = this.peerBranches.get(conn.peer);
          if (peerBranch !== message.payload.branchId) {
            return; // Skip peers not in the same branch
          }
        }

        this.sendTo(conn.peer, message).catch((err) => logger.error('Broadcast encrypt failed', err));
      }
    });
  }

  public async sendTo(peerId: string, message: SyncMessage) {
    const conn = this.connections.get(peerId);
    if (!conn?.open) return;

    if (isAuthorityMessage(message) && !isLocalAuthorityPeer(this.localPeerId, this.role)) {
      logger.warn(
        `[SECURITY] Blocked outgoing authority message ${message.type} from non-master peer ${this.localPeerId || 'unknown'}`,
      );
      return;
    }

    // Encrypt sensitive messages if we have a shared key (YJS only when dual-ready)
    const key = this.encryptionKeys.get(peerId);
    if (key && shouldEncryptMessage(peerId, message, this.dualReadyEncryption, this.encryptYjsWhenDualReady)) {
      const ciphertext = await encryptDataHelper(JSON.stringify(message), key);
      conn.send({
        type: 'ENCRYPTED_PAYLOAD',
        payload: { ciphertext },
      });
    } else {
      conn.send(message);
    }
  }

  /** Test/observability: true when YJS would be app-encrypted for this peer. */
  public isYjsAppEncryptedForPeer(peerId: string): boolean {
    return this.encryptYjsWhenDualReady && this.dualReadyEncryption.has(peerId) && this.encryptionKeys.has(peerId);
  }

  /** Helper to check if EDGE_MESH_ENVELOPE is encrypted for peer. */
  public isEdgeMeshEnvelopeEncryptedForPeer(peerId: string): boolean {
    return this.isYjsAppEncryptedForPeer(peerId);
  }

  /** Authority/recovery always; YJS only after mutual ENCRYPTION_READY. */
  private shouldEncryptMessage(peerId: string, message: SyncMessage): boolean {
    return shouldEncryptMessage(peerId, message, this.dualReadyEncryption, this.encryptYjsWhenDualReady);
  }

  private onEncryptionReady(peerId: string) {
    if (this.encryptionKeys.has(peerId)) {
      const wasReady = this.dualReadyEncryption.has(peerId);
      this.dualReadyEncryption.add(peerId);
      this.pendingEncryptionReady.delete(peerId);
      if (!wasReady) {
        logger.log(`[PQC] Dual-ready encryption with ${peerId} (YJS app encrypt ON)`);
        this.requestYjsSyncBridge(peerId);
      }
    } else {
      this.pendingEncryptionReady.add(peerId);
    }
  }

  private updatePeerList(id: string, role: P2PRole) {
    if (!this.peers.find((p) => p.id === id)) {
      this.peers.push({
        id,
        role,
        isMaster: dbSync.getMasterPeerId() === id,
        lastSeen: new Date().toISOString(),
      });
      this.notifyConnectionChange();
    }
  }

  private broadcastPeerList() {
    this.broadcast({
      type: 'PEER_LIST_UPDATE',
      payload: this.peers,
    });
  }

  private notifyConnectionChange() {
    for (const cb of this.onConnectionChangeCallbacks) {
      cb([...this.peers]);
    }
  }

  private clearPeerCrypto(peerId: string) {
    this.encryptionKeys.delete(peerId);
    this.sharedSecrets.delete(peerId);
    this.dualReadyEncryption.delete(peerId);
    this.pendingEncryptionReady.delete(peerId);
  }

  public onMessage(cb: (message: SyncMessage, fromPeerId: string) => void) {
    this.onMessageCallbacks.push(cb);
  }

  public onConnectionChange(cb: (peers: PeerInfo[]) => void) {
    this.onConnectionChangeCallbacks.push(cb);
  }

  // ─── Phase C: EdgeMesh transport host API ─────────────────────────────

  public getConnectedPeerIds(): string[] {
    return Array.from(this.connections.keys()).filter((id) => this.isPeerConnected(id));
  }

  public onEdgeMeshEnvelope(
    cb: (envelope: import('./p2p-transport-adapter').EdgeMeshEnvelopeWire, fromPeerId: string) => void,
  ): () => void {
    this.onEdgeMeshEnvelopeCallbacks.push(cb);
    return () => {
      this.onEdgeMeshEnvelopeCallbacks = this.onEdgeMeshEnvelopeCallbacks.filter((entry) => entry !== cb);
    };
  }

  public async sendEdgeMeshEnvelope(
    peerId: string,
    envelope: import('./p2p-transport-adapter').EdgeMeshEnvelopeWire,
  ): Promise<void> {
    await this.sendTo(peerId, {
      type: 'EDGE_MESH_ENVELOPE',
      payload: { envelope },
    });
  }

  public async broadcastEdgeMeshEnvelope(
    envelope: import('./p2p-transport-adapter').EdgeMeshEnvelopeWire,
  ): Promise<void> {
    await this.broadcast({
      type: 'EDGE_MESH_ENVELOPE',
      payload: { envelope },
    });
  }

  public onHandshakeRequest(cb: (payload: HandshakeRequestPayload, fromPeerId: string) => void) {
    this.onHandshakeRequestCallbacks.push(cb);
  }

  public onHandshakeResponse(cb: (payload: HandshakeResponsePayload, fromPeerId: string) => void) {
    this.onHandshakeResponseCallbacks.push(cb);
  }

  public setActiveBranch(branchId: string) {
    dbSync.activeBranchId = branchId;
    this.broadcast({
      type: 'SET_ACTIVE_BRANCH',
      payload: { branchId },
    });

    // Also re-request sync for the new branch from all connected peers
    this.connections.forEach((_conn, peerId) => {
      this.requestYjsSyncBridge(peerId, branchId);
    });
  }

  private requestYjsSyncBridge(peerId: string, branchId?: string) {
    requestYjsSync(this.buildYjsSyncContext(), peerId, branchId);
  }

  /**
   * Register a callback for incoming account recovery requests.
   * Called on the master device when another device wants to recover.
   */
  public onRecoveryRequest(cb: (requestId: string, email: string, deviceName: string, fromPeerId: string) => void) {
    this.onRecoveryRequestCallbacks.push(cb);
  }

  public onConnectionError(cb: (issue: ConnectionErrorInfo) => void) {
    this.onConnectionErrorCallbacks.push(cb);
  }

  public onPeerHealthChange(cb: (state: PeerHealthInfo) => void) {
    this.onPeerHealthChangeCallbacks.push(cb);
    return () => {
      this.onPeerHealthChangeCallbacks = this.onPeerHealthChangeCallbacks.filter((entry) => entry !== cb);
    };
  }

  public getPeerHealth(peerId: string): PeerHealthInfo | undefined {
    return this.health.get(peerId);
  }

  public getPeerHealthList(): PeerHealthInfo[] {
    return this.health.list();
  }

  /**
   * Force a bidirectional CRDT catch-up using state vectors and diffs.
   * This intentionally avoids AppState snapshots and full STATE_UPDATE payloads.
   */
  public requestFullSync(peerId?: string): number {
    if (!dbSync.isReady) return 0;

    if (peerId) {
      if (!this.isPeerConnected(peerId)) return 0;
      this.requestYjsSyncBridge(peerId);
      return 1;
    }

    let requested = 0;
    for (const targetPeerId of this.connections.keys()) {
      if (this.isPeerConnected(targetPeerId)) {
        this.requestYjsSyncBridge(targetPeerId);
        requested++;
      }
    }
    return requested;
  }

  /**
   * Send an account recovery request to a peer (master device).
   */
  public sendRecoveryRequest(toPeerId: string, requestId: string, email: string, deviceName: string, deviceId: string) {
    this.sendTo(toPeerId, {
      type: 'REQUEST_ACCOUNT_RECOVERY',
      payload: { requestId, email, deviceName, deviceId },
    });
  }

  /**
   * Approve a recovery request — sends the encrypted seed to the requesting device.
   */
  public approveRecovery(toPeerId: string, requestId: string, encryptedSeed: string, tempKey: string) {
    this.sendTo(toPeerId, {
      type: 'RECOVERY_APPROVED',
      payload: { requestId, encryptedSeed, tempKey },
    });
  }

  /**
   * Deny a recovery request.
   */
  public denyRecovery(toPeerId: string, requestId: string, reason = 'Request denied by user') {
    this.sendTo(toPeerId, {
      type: 'RECOVERY_DENIED',
      payload: { requestId, reason },
    });
  }

  public disconnectPeer(peerId: string) {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
      this.clearPeerCrypto(peerId);
      this.health.markOffline(peerId);
      this.notifyConnectionChange();
    }
  }

  public disconnect() {
    for (const peerId of Array.from(this.connections.keys())) {
      this.clearPeerCrypto(peerId);
    }
    for (const conn of Array.from(this.connections.values())) {
      conn.close();
    }
    this.connections.clear();
    this.pendingConnectionRequests.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export const p2pManager = new P2PManager();
