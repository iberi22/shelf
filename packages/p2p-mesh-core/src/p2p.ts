import { type DataConnection, Peer } from 'peerjs';
import type { AppState, P2PRole, PeerInfo } from './types';
import { decryptData, deriveKey, encryptData } from './crypto';
import { decapsulate, encapsulate, fromHex, generateDSAKeyPair, generateKEMKeyPair, toHex } from './crypto-pqc';
import { dbSync } from './database-sync';
import { logger, setLoggerPeerId } from './utils/logger';

export type SyncMessage =
  | { type: 'ENCRYPTED_PAYLOAD'; payload: { ciphertext: string } }
  | { type: 'STATE_UPDATE'; payload: Partial<AppState> }
  | { type: 'REQUEST_FULL_STATE' }
  | { type: 'PROMOTE_ADMIN'; payload: { targetPeerId: string } }
  | { type: 'PEER_LIST_UPDATE'; payload: PeerInfo[] }
  | { type: 'PQC_HANDSHAKE'; payload: { kemPublicKey: string; dsaPublicKey: string } }
  | { type: 'PQC_KEM_REPLY'; payload: { ciphertext: string } }
  | { type: 'PQC_HANDSHAKE_REQUEST'; payload: { kemPubKey: string; dsaPubKey: string; deviceName: string } }
  | { type: 'PQC_HANDSHAKE_RESPONSE'; payload: { cipherText: string; signature: string; dsaPubKey: string } }
  | { type: 'YJS_UPDATE'; payload: { update: string } }
  | { type: 'UPDATE_PEER_PERMISSIONS'; payload: { targetPeerId: string; permissions: any } }
  | { type: 'PING' }
  | { type: 'PONG' }
  // Auth recovery messages
  | {
      type: 'REQUEST_ACCOUNT_RECOVERY';
      payload: { requestId: string; email: string; deviceName: string; deviceId: string };
    }
  | { type: 'RECOVERY_APPROVED'; payload: { requestId: string; encryptedSeed: string; tempKey: string } }
  | { type: 'RECOVERY_DENIED'; payload: { requestId: string; reason: string } }
  | { type: 'DEVICE_AUTHORIZED'; payload: { deviceId: string; deviceName: string; authorizedAt: string } };

class P2PManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private sharedSecrets: Map<string, Uint8Array> = new Map();
  private encryptionKeys: Map<string, CryptoKey> = new Map();

  private reconnectionAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30000;
  private readonly INITIAL_RECONNECT_DELAY = 1000;

  private onMessageCallbacks: ((message: SyncMessage, fromPeerId: string) => void)[] = [];
  private onConnectionChangeCallbacks: ((peers: PeerInfo[]) => void)[] = [];
  private onHandshakeRequestCallbacks: ((payload: any, fromPeerId: string) => void)[] = [];
  private onHandshakeResponseCallbacks: ((payload: any, fromPeerId: string) => void)[] = [];
  private onRecoveryRequestCallbacks: ((
    requestId: string,
    email: string,
    deviceName: string,
    fromPeerId: string,
  ) => void)[] = [];

  public localPeerId: string | null = null;
  public role: P2PRole = 'collaborator';
  private peers: PeerInfo[] = [];
  private lastMessageTime = new Map<string, number>();
  private heartbeatInterval: any;

  // PQC Keypairs
  private kemKeyPair = generateKEMKeyPair();
  private dsaKeyPair = generateDSAKeyPair();

  public init(peerId?: string) {
    if (this.peer) return;

    let finalPeerId = peerId;
    if (!finalPeerId && typeof localStorage !== 'undefined') {
      finalPeerId = localStorage.getItem('shelf_local_peer_id') || undefined;
    }

    // Check if we are in development mode (supports both Vite and generic bundlers)
    // @ts-ignore
    const isDev = typeof process !== 'undefined' ? process.env.NODE_ENV === 'development' : false;
    const peerOptions: any = isDev
      ? {
          host: 'localhost',
          port: 9000,
          path: '/',
          secure: false,
          pingInterval: 5000,
          debug: 1,
        }
      : {
          debug: 1,
          pingInterval: 5000,
        };

    this.peer = finalPeerId ? new Peer(finalPeerId, peerOptions) : new Peer(peerOptions);

    this.peer.on('open', (id) => {
      this.localPeerId = id;
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

      // Initialize Yjs Sync
      dbSync.onChange((update) => {
        this.broadcast({
          type: 'YJS_UPDATE',
          payload: { update: toHex(update) },
        });
      });

      // Start heartbeat/GC loop
      this.heartbeatInterval = setInterval(() => {
        this.runHeartbeat();
      }, 30000);
    });

    this.peer.on('connection', (conn) => {
      this.handleConnection(conn);
    });

    this.peer.on('disconnected', () => {
      const delay = Math.min(this.INITIAL_RECONNECT_DELAY * 2 ** this.reconnectionAttempts, this.MAX_RECONNECT_DELAY);
      logger.warn(`PeerJS disconnected. Retrying in ${delay}ms (attempt ${this.reconnectionAttempts + 1})...`);

      setTimeout(() => {
        if (!this.peer?.destroyed && this.peer?.disconnected) {
          this.reconnectionAttempts++;
          this.peer?.reconnect();
        }
      }, delay);
    });

    this.peer.on('error', (err: any) => {
      logger.error('PeerJS error:', err);
      if (err.type === 'unavailable-id') {
        const delay = Math.min(this.INITIAL_RECONNECT_DELAY * 2 ** this.reconnectionAttempts, this.MAX_RECONNECT_DELAY);
        logger.warn(`Peer ID taken. Retrying in ${delay}ms (attempt ${this.reconnectionAttempts + 1})...`);

        // Destroy old peer and re-init WITH the same ID after a short delay
        this.peer?.destroy();
        this.peer = null;
        setTimeout(() => {
          this.reconnectionAttempts++;
          this.init(finalPeerId);
        }, delay);
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.peer?.destroy();
      });
    }
  }

  private handleConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.updatePeerList(conn.peer, 'collaborator');

      // Broadcast updated peer list to the mesh
      this.broadcastPeerList();

      // Start PQC Handshake deterministically to avoid both sides sending it
      if (this.localPeerId && this.localPeerId > conn.peer) {
        conn.send({
          type: 'PQC_HANDSHAKE',
          payload: {
            kemPublicKey: toHex(this.kemKeyPair.publicKey),
            dsaPublicKey: toHex(this.dsaKeyPair.publicKey),
          },
        });
      }

      conn.on('data', (data) => {
        this.lastMessageTime.set(conn.peer, Date.now());
        const message = data as SyncMessage;

        // Handle Peer List Updates (Mesh Discovery)
        if (message.type === 'PEER_LIST_UPDATE') {
          message.payload.forEach((peerInfo) => {
            if (peerInfo.id !== this.localPeerId && !this.connections.has(peerInfo.id)) {
              logger.log(`Discovered new peer via mesh: ${peerInfo.id}`);
              this.connect(peerInfo.id);
            }
          });
          return;
        }

        // Handle PQC Handshake
        if (message.type === 'PQC_HANDSHAKE') {
          const { ciphertext, sharedSecret } = encapsulate(fromHex(message.payload.kemPublicKey));
          this.sharedSecrets.set(conn.peer, sharedSecret);
          this.setupEncryption(conn.peer, sharedSecret).then(() => {
            // Update status in linkedNodes map
            dbSync.updateLinkedNode(conn.peer, {
              status: 'verified',
              role: 'collaborator',
              isMaster: false,
              lastSeen: new Date().toISOString(),
            });
            // Update local peer list
            this.updatePeerList(conn.peer, 'collaborator');
            this.notifyConnectionChange();
          });

          conn.send({
            type: 'PQC_KEM_REPLY',
            payload: { ciphertext: toHex(ciphertext) },
          });
          logger.log(`PQC Handshake established with ${conn.peer}`);
          return;
        }

        if (message.type === 'PQC_KEM_REPLY') {
          const sharedSecret = decapsulate(fromHex(message.payload.ciphertext), this.kemKeyPair.secretKey);
          this.sharedSecrets.set(conn.peer, sharedSecret);
          this.setupEncryption(conn.peer, sharedSecret).then(() => {
            logger.log(`PQC Shared secret recovered from ${conn.peer}`);
            
            dbSync.updateLinkedNode(conn.peer, {
              status: 'verified',
              role: 'collaborator',
              lastSeen: new Date().toISOString(),
            });
            this.updatePeerList(conn.peer, 'collaborator');
            this.notifyConnectionChange();
          });
          return;
        }

        // Handle PING/PONG
        if (message.type === 'PING') {
          conn.send({ type: 'PONG' });
          return;
        }

        if (message.type === 'PONG') {
          // lastMessageTime already updated above
          return;
        }

        // Handle Encrypted Payload
        if (message.type === 'ENCRYPTED_PAYLOAD') {
          this.handleEncryptedMessage(conn.peer, message.payload.ciphertext);
          return;
        }

        // Handle Yjs Updates
        if (message.type === 'YJS_UPDATE') {
          dbSync.applyUpdate(fromHex(message.payload.update));
          return;
        }

        if (message.type === 'PQC_HANDSHAKE_REQUEST') {
          for (const cb of this.onHandshakeRequestCallbacks) {
            cb(message.payload, conn.peer);
          }
          return;
        }

        if (message.type === 'PQC_HANDSHAKE_RESPONSE') {
          for (const cb of this.onHandshakeResponseCallbacks) {
            cb(message.payload, conn.peer);
          }
          return;
        }

        // Route recovery requests to dedicated callbacks
        if (message.type === 'REQUEST_ACCOUNT_RECOVERY') {
          for (const cb of this.onRecoveryRequestCallbacks) {
            cb(message.payload.requestId, message.payload.email, message.payload.deviceName, conn.peer);
          }
          return;
        }
        for (const cb of this.onMessageCallbacks) {
          cb(message, conn.peer);
        }
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this.sharedSecrets.delete(conn.peer);
        this.lastMessageTime.delete(conn.peer);
        this.peers = this.peers.filter((p) => p.id !== conn.peer);
        this.notifyConnectionChange();
        
        // Mark offline in DB without deleting config
        dbSync.updateLinkedNode(conn.peer, {
          status: 'offline',
          lastSeen: new Date().toISOString()
        });
      });
    });
  }

  public connect(peerId: string) {
    if (!this.peer || this.connections.has(peerId)) return;
    const conn = this.peer.connect(peerId);
    this.handleConnection(conn);
  }

  private runHeartbeat() {
    const now = Date.now();
    for (const [peerId, conn] of this.connections.entries()) {
      if (!conn.open) {
        conn.close(); // Triggers the 'close' event handler which cleans up
        continue;
      }

      // Check for inactivity
      const lastSeen = this.lastMessageTime.get(peerId) || now;
      if (now - lastSeen > 60000) {
        // 1 minute timeout
        logger.warn(`[P2P] Peer ${peerId} heartbeat timeout. Closing connection.`);
        conn.close();
        continue;
      }

      // Send PING
      conn.send({ type: 'PING' });
    }
  }

  public isPeerConnected(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return conn ? conn.open : false;
  }

  public broadcast(message: SyncMessage) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        this.sendTo(conn.peer, message).catch(err => logger.error('Broadcast encrypt failed', err));
      }
    });
  }

  public async sendTo(peerId: string, message: SyncMessage) {
    const conn = this.connections.get(peerId);
    if (!conn?.open) return;

    // Encrypt sensitive messages if we have a shared key
    const key = this.encryptionKeys.get(peerId);
    if (key && this.isSensitive(message)) {
      const ciphertext = await encryptData(JSON.stringify(message), key);
      conn.send({
        type: 'ENCRYPTED_PAYLOAD',
        payload: { ciphertext },
      });
    } else {
      conn.send(message);
    }
  }

  private isSensitive(message: SyncMessage): boolean {
    return ['STATE_UPDATE', 'YJS_UPDATE', 'RECOVERY_APPROVED'].includes(message.type);
  }

  private async setupEncryption(peerId: string, sharedSecret: Uint8Array) {
    const { importPQCSharedSecret } = await import('./crypto');
    const key = await importPQCSharedSecret(toHex(sharedSecret));
    this.encryptionKeys.set(peerId, key);
  }

  private async handleEncryptedMessage(fromPeerId: string, ciphertext: string) {
    const key = this.encryptionKeys.get(fromPeerId);
    if (!key) return;

    try {
      const decrypted = await decryptData(ciphertext, key);
      const message = JSON.parse(decrypted) as SyncMessage;

      // Dispatch the decrypted message
      if (message.type === 'YJS_UPDATE') {
        dbSync.applyUpdate(fromHex(message.payload.update));
      } else {
        for (const cb of this.onMessageCallbacks) {
          cb(message, fromPeerId);
        }
      }
    } catch (err) {
      logger.error('Failed to decrypt PQC message:', err);
    }
  }

  private updatePeerList(id: string, role: P2PRole) {
    if (!this.peers.find((p) => p.id === id)) {
      this.peers.push({ id, role, lastSeen: new Date().toISOString() });
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

  public onMessage(cb: (message: SyncMessage, fromPeerId: string) => void) {
    this.onMessageCallbacks.push(cb);
  }

  public onConnectionChange(cb: (peers: PeerInfo[]) => void) {
    this.onConnectionChangeCallbacks.push(cb);
  }

  public onHandshakeRequest(cb: (payload: any, fromPeerId: string) => void) {
    this.onHandshakeRequestCallbacks.push(cb);
  }

  public onHandshakeResponse(cb: (payload: any, fromPeerId: string) => void) {
    this.onHandshakeResponseCallbacks.push(cb);
  }

  /**
   * Register a callback for incoming account recovery requests.
   * Called on the master device when another device wants to recover.
   */
  public onRecoveryRequest(cb: (requestId: string, email: string, deviceName: string, fromPeerId: string) => void) {
    this.onRecoveryRequestCallbacks.push(cb);
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
      this.sharedSecrets.delete(peerId);
      this.notifyConnectionChange();
    }
  }

  public disconnect() {
    for (const conn of Array.from(this.connections.values())) {
      conn.close();
    }
    this.connections.clear();
    this.sharedSecrets.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export const p2pManager = new P2PManager();
