/**
 * Message routing and connection handling for the P2P mesh.
 *
 * Extracted from P2PManager — the core message dispatcher and
 * connection lifecycle manager, parameterised via a context interface.
 */

import type { DataConnection } from 'peerjs';
import { decryptData, encryptData, importPQCSharedSecret } from '../crypto';
import { dbSync } from '../database-sync';
import type { P2PRole, PeerInfo } from '../types';
import { logger } from '../utils/logger';
import { decapsulate, encapsulate, fromHex, toHex } from './crypto-handshake';
import { isAuthorityMessage, isAuthorizedAuthoritySender, isLocalAuthorityPeer } from './permissions';
import type { ConnectionErrorInfo, HandshakeRequestPayload, HandshakeResponsePayload, SyncMessage } from './sync-types';
import type { YjsSyncContext } from './yjs-sync';
import { requestYjsSync, sendYjsDiff } from './yjs-sync';

// ─── Handler context — everything the message router needs from P2PManager ──

export interface MessageHandlerContext extends YjsSyncContext {
  localPeerId: string | null;
  role: P2PRole;

  // Crypto state
  kemKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
  dsaKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
  sharedSecrets: Map<string, Uint8Array>;
  encryptionKeys: Map<string, CryptoKey>;
  peerDsaKeys: Map<string, string>;
  pendingChallenges: Map<string, Set<string>>;
  dualReadyEncryption: Set<string>;
  pendingEncryptionReady: Set<string>;
  connectingPeers: Set<string>;
  peers: PeerInfo[];
  lastMessageTime: Map<string, number>;
  peerBranches: Map<string, string>;
  pendingPings: Map<string, number>;

  // Peer health
  health: {
    markConnected(id: string): void;
    markOffline(id: string): void;
    markPing(id: string): void;
    markPong(id: string): void;
  };

  // Callbacks
  emitMessageCallbacks(message: SyncMessage, fromPeerId: string): void;
  emitConnectionError(issue: ConnectionErrorInfo): void;
  onMessageCallbacks: ((message: SyncMessage, fromPeerId: string) => void)[];
  onHandshakeRequestCallbacks: ((payload: HandshakeRequestPayload, fromPeerId: string) => void)[];
  onHandshakeResponseCallbacks: ((payload: HandshakeResponsePayload, fromPeerId: string) => void)[];
  onRecoveryRequestCallbacks: ((requestId: string, email: string, deviceName: string, fromPeerId: string) => void)[];
  onEdgeMeshEnvelopeCallbacks: ((envelope: any, fromPeerId: string) => void)[];

  // State mutators
  updatePeerList(id: string, role: P2PRole): void;
  broadcastPeerList(): void;
  notifyConnectionChange(): void;
  connect(peerId: string): void;
  clearPeerCrypto(peerId: string): void;

  // Sign / verify
  signFn: (message: Uint8Array) => Uint8Array;
  verifyFn: (signature: Uint8Array, message: Uint8Array, publicKeyHex: string) => boolean;
}

// ─── Message routing ────────────────────────────────────────────────────────

/**
 * Handle an incoming data message on a PeerJS DataConnection.
 * Routes to the appropriate handler based on message type.
 */
export async function handleMessage(ctx: MessageHandlerContext, conn: DataConnection, data: unknown): Promise<void> {
  ctx.lastMessageTime.set(conn.peer, Date.now());
  const message = data as SyncMessage;

  // Handle Peer List Updates (Mesh Discovery)
  if (message.type === 'PEER_LIST_UPDATE') {
    message.payload.forEach((peerInfo) => {
      if (peerInfo.id !== ctx.localPeerId && !ctx.connections.has(peerInfo.id)) {
        logger.log(`Discovered new peer via mesh: ${peerInfo.id}`);
        ctx.connect(peerInfo.id);
      }
    });
    return;
  }

  // Handle PQC Handshake
  if (message.type === 'PQC_HANDSHAKE') {
    handlePQCHandshake(ctx, conn, message);
    return;
  }

  if (message.type === 'PQC_KEM_REPLY') {
    handlePQCHandshakeResponse(ctx, conn, message as any);
    return;
  }

  if (message.type === 'PQC_KEM_REPLY_ACK') {
    handlePQCHandshakeAck(ctx, conn, message as any);
    return;
  }

  // Handle PING / PONG Heartbeats
  if (message.type === 'PING') {
    conn.send({
      type: 'PONG',
      payload: {
        timestamp: Date.now(),
      },
    });
    return;
  }

  if (message.type === 'PONG') {
    // Clear pending ping tracking for this peer
    ctx.pendingPings.delete(conn.peer);
    ctx.health.markPong(conn.peer);
    return;
  }

  // Handle Encrypted Payload
  if (message.type === 'ENCRYPTED_PAYLOAD') {
    await handleEncryptedMessage(ctx, conn.peer, message.payload.ciphertext);
    return;
  }

  // Phase C: edge-mesh envelopes over the same PeerJS channel
  if (message.type === 'EDGE_MESH_ENVELOPE') {
    for (const cb of ctx.onEdgeMeshEnvelopeCallbacks) {
      cb(message.payload.envelope, conn.peer);
    }
    // Also surface to generic listeners (status / debug)
    ctx.emitMessageCallbacks(message, conn.peer);
    return;
  }

  // Handle Yjs Updates
  if (message.type === 'YJS_UPDATE') {
    const branchId = message.payload.branchId;
    // Only apply update if it matches our active branch, or is a global update
    if (!branchId || branchId === dbSync.activeBranchId) {
      dbSync.applyUpdate(fromHex(message.payload.update), conn.peer);
    }
    ctx.emitMessageCallbacks(message, conn.peer);
    return; // Already handled; prevent fallthrough to callbacks
  }

  if (message.type === 'YJS_SYNC_REQUEST') {
    const branchId = message.payload.branchId;
    // Serve any branch if admin/authority, or only active branch for collaborators
    if (!branchId || branchId === dbSync.activeBranchId || isLocalAuth(ctx)) {
      sendYjsDiff(ctx, conn.peer, message.payload.stateVector, branchId);
      if (message.payload.respondWithRequest) {
        ctx.sendTo(conn.peer, {
          type: 'YJS_SYNC_REQUEST',
          payload: {
            stateVector: toHex(dbSync.getStateVector()),
            branchId: dbSync.activeBranchId || undefined,
          },
        });
      }
    }
    return;
  }

  if (message.type === 'SET_ACTIVE_BRANCH') {
    ctx.peerBranches.set(conn.peer, message.payload.branchId);
    logger.log(`Peer ${conn.peer} joined branch: ${message.payload.branchId}`);
    requestYjsSync(ctx, conn.peer, message.payload.branchId);
    return;
  }

  if (message.type === 'PQC_HANDSHAKE_REQUEST') {
    for (const cb of ctx.onHandshakeRequestCallbacks) {
      cb(message.payload, conn.peer);
    }
    return;
  }

  if (message.type === 'PQC_HANDSHAKE_RESPONSE') {
    for (const cb of ctx.onHandshakeResponseCallbacks) {
      cb((message as any).payload, conn.peer);
    }
    return;
  }

  // Route recovery requests to dedicated callbacks
  if (message.type === 'REQUEST_ACCOUNT_RECOVERY') {
    for (const cb of ctx.onRecoveryRequestCallbacks) {
      cb(message.payload.requestId, message.payload.email, message.payload.deviceName, conn.peer);
    }
    return;
  }

  for (const cb of ctx.onMessageCallbacks) {
    cb(message, conn.peer);
  }
}

// ─── PQC handshake sub-handlers ─────────────────────────────────────────────

function handlePQCHandshake(
  ctx: MessageHandlerContext,
  conn: DataConnection,
  message: SyncMessage & { type: 'PQC_HANDSHAKE' },
): void {
  const { ciphertext, sharedSecret } = encapsulate(fromHex(message.payload.kemPublicKey));
  ctx.sharedSecrets.set(conn.peer, sharedSecret);
  ctx.peerDsaKeys.set(conn.peer, message.payload.dsaPublicKey);

  const signature = toHex(ctx.signFn(fromHex(message.payload.challenge)));
  const responderChallenge = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const peerChallenges = ctx.pendingChallenges.get(conn.peer) || new Set<string>();
  peerChallenges.add(responderChallenge);
  ctx.pendingChallenges.set(conn.peer, peerChallenges);

  conn.send({
    type: 'PQC_KEM_REPLY',
    payload: {
      ciphertext: toHex(ciphertext),
      dsaPublicKey: toHex(ctx.dsaKeyPair.publicKey),
      signature,
      responderChallenge,
    },
  });
}

function handlePQCHandshakeResponse(ctx: MessageHandlerContext, conn: DataConnection, message: any): void {
  let sharedSecret = ctx.sharedSecrets.get(conn.peer);
  if (!sharedSecret && message.payload.ciphertext) {
    try {
      sharedSecret = decapsulate(fromHex(message.payload.ciphertext), ctx.kemKeyPair.secretKey);
      ctx.sharedSecrets.set(conn.peer, sharedSecret);
    } catch (err) {
      logger.error('KEM decapsulation failed:', err);
      conn.close();
      return;
    }
  }
  if (message.payload.dsaPublicKey) {
    ctx.peerDsaKeys.set(conn.peer, message.payload.dsaPublicKey);
  }

  if (message.payload.signature) {
    const peerDsaHex = ctx.peerDsaKeys.get(conn.peer);
    const peerChallenges = ctx.pendingChallenges.get(conn.peer);
    if (peerDsaHex && peerChallenges && peerChallenges.size > 0) {
      let verified = false;
      for (const challengeHex of peerChallenges) {
        if (ctx.verifyFn(fromHex(message.payload.signature), fromHex(challengeHex), peerDsaHex)) {
          verified = true;
          peerChallenges.delete(challengeHex);
          break;
        }
      }
      if (!verified) {
        logger.error('PQC signature verification failed!');
        conn.close();
        return;
      }
    }
  }

  if (message.payload.responderChallenge) {
    const ackSignature = toHex(ctx.signFn(fromHex(message.payload.responderChallenge)));
    conn.send({
      type: 'PQC_KEM_REPLY_ACK',
      payload: {
        signature: ackSignature,
      },
    });
  }
}

function handlePQCHandshakeAck(ctx: MessageHandlerContext, conn: DataConnection, message: any): void {
  const peerDsaHex = ctx.peerDsaKeys.get(conn.peer);
  const peerChallenges = ctx.pendingChallenges.get(conn.peer);
  if (peerDsaHex && peerChallenges && peerChallenges.size > 0) {
    let verified = false;
    for (const challengeHex of peerChallenges) {
      if (ctx.verifyFn(fromHex(message.payload.signature), fromHex(challengeHex), peerDsaHex)) {
        verified = true;
        peerChallenges.delete(challengeHex);
        break;
      }
    }
    if (!verified) {
      logger.error('PQC ACK signature verification failed!');
      conn.close();
      return;
    }
  }
}

// ─── Encrypted message handling ─────────────────────────────────────────────

export async function handleEncryptedMessage(
  ctx: MessageHandlerContext,
  fromPeerId: string,
  ciphertext: string,
): Promise<void> {
  const key = ctx.encryptionKeys.get(fromPeerId);
  if (!key) {
    logger.warn(`[SECURITY] Dropped ENCRYPTED_PAYLOAD from ${fromPeerId} (no local AES key yet)`);
    return;
  }

  try {
    const decrypted = await decryptData(ciphertext, key);
    const message = JSON.parse(decrypted) as SyncMessage;

    if (isAuthorityMessage(message) && !isAuthorizedAuthoritySender(fromPeerId)) {
      logger.warn(`[SECURITY] Ignored encrypted authority message ${message.type} from non-master peer ${fromPeerId}`);
      return;
    }

    // Dispatch the decrypted message
    if (message.type === 'YJS_UPDATE') {
      const branchId = message.payload.branchId;
      if (!branchId || branchId === dbSync.activeBranchId) {
        dbSync.applyUpdate(fromHex(message.payload.update), fromPeerId);
      }
      ctx.emitMessageCallbacks(message, fromPeerId);
      return; // Already applied; prevent double-handling via callbacks
    }

    if (message.type === 'YJS_SYNC_REQUEST') {
      const branchId = message.payload.branchId;
      if (!branchId || branchId === dbSync.activeBranchId || isLocalAuth(ctx)) {
        sendYjsDiff(ctx, fromPeerId, message.payload.stateVector, branchId);
        if (message.payload.respondWithRequest) {
          ctx.sendTo(fromPeerId, {
            type: 'YJS_SYNC_REQUEST',
            payload: {
              stateVector: toHex(dbSync.getStateVector()),
              branchId: dbSync.activeBranchId || undefined,
            },
          });
        }
      }
      return;
    }

    ctx.emitMessageCallbacks(message, fromPeerId);
  } catch (err) {
    logger.error('Failed to decrypt PQC message:', err);
  }
}

// ─── Connection open handler ────────────────────────────────────────────────

export function onConnectionOpen(ctx: MessageHandlerContext, conn: DataConnection): void {
  const existing = ctx.connections.get(conn.peer);
  if (existing && (existing as any).open && existing !== conn) {
    if (ctx.localPeerId && ctx.localPeerId > conn.peer) {
      logger.warn(`[P2P] Closing incoming duplicate connection from lower peer ID ${conn.peer}`);
      conn.close();
      return;
    } else {
      logger.warn(`[P2P] Replacing existing connection with connection from higher peer ID ${conn.peer}`);
      (existing as DataConnection).close();
    }
  }
  ctx.connectingPeers.delete(conn.peer);
  ctx.connections.set(conn.peer, conn as any);
  ctx.health.markConnected(conn.peer);
  ctx.updatePeerList(conn.peer, 'collaborator');

  // Broadcast updated peer list to the mesh
  ctx.broadcastPeerList();

  // Inform peer of our active branch if we have one
  if (dbSync.activeBranchId) {
    conn.send({
      type: 'SET_ACTIVE_BRANCH',
      payload: { branchId: dbSync.activeBranchId },
    });
  }

  // Start PQC Handshake deterministically to avoid both sides sending it
  if (ctx.localPeerId && ctx.localPeerId > conn.peer) {
    const challenge = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const peerChallenges = ctx.pendingChallenges.get(conn.peer) || new Set<string>();
    peerChallenges.add(challenge);
    ctx.pendingChallenges.set(conn.peer, peerChallenges);
    conn.send({
      type: 'PQC_HANDSHAKE',
      payload: {
        kemPublicKey: toHex(ctx.kemKeyPair.publicKey),
        dsaPublicKey: toHex(ctx.dsaKeyPair.publicKey),
        challenge,
      },
    });
  }
}

// ─── Encryption helpers ─────────────────────────────────────────────────────

export async function setupEncryption(
  ctx: MessageHandlerContext,
  peerId: string,
  sharedSecret: Uint8Array,
): Promise<void> {
  const key = await importPQCSharedSecret(toHex(sharedSecret));
  ctx.encryptionKeys.set(peerId, key);
  // Announce we can decrypt ENCRYPTED_PAYLOAD from this peer
  const conn = ctx.connections.get(peerId);
  if ((conn as any)?.open) {
    try {
      (conn as DataConnection).send({
        type: 'ENCRYPTION_READY',
        payload: { v: 1 },
      });
    } catch (e) {
      logger.warn(`[PQC] Failed to send ENCRYPTION_READY to ${peerId}`, e);
    }
  }
  // If peer already announced ready, promote to dual-ready
  if (ctx.pendingEncryptionReady.has(peerId)) {
    onEncryptionReady(ctx, peerId);
  }
}

export function onEncryptionReady(ctx: MessageHandlerContext, peerId: string): void {
  if (ctx.encryptionKeys.has(peerId)) {
    const wasReady = ctx.dualReadyEncryption.has(peerId);
    ctx.dualReadyEncryption.add(peerId);
    ctx.pendingEncryptionReady.delete(peerId);
    if (!wasReady) {
      logger.log(`[PQC] Dual-ready encryption with ${peerId} (YJS app encrypt ON)`);
      // Re-sync CRDT so subsequent deltas can go encrypted
      requestYjsSync(ctx, peerId);
    }
  } else {
    // Peer is ready before we finished setupEncryption
    ctx.pendingEncryptionReady.add(peerId);
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function isLocalAuth(ctx: MessageHandlerContext): boolean {
  return isLocalAuthorityPeer(ctx.localPeerId, ctx.role);
}
