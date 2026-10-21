/**
 * Message routing and connection handling for the P2P mesh.
 *
 * Extracted from P2PManager — the core message dispatcher and
 * connection lifecycle manager, parameterised via a context interface.
 */

import type { DataConnection } from 'peerjs';
import { decryptData } from '../crypto';
import {
  buildHandshakeTranscript,
  deriveSessionKey,
  SessionCipher,
  transcriptSigningInput,
} from '../crypto-pqc';
import { dbSync } from '../database-sync';
import type { P2PRole, PeerInfo } from '../types';
import { logger } from '../utils/logger';
import { decapsulate, encapsulate, fromHex, toHex } from './crypto-handshake';
import { isAuthorityMessage, isAuthorizedAuthoritySender, isLocalAuthorityPeer } from './permissions';
import type {
  ConnectionErrorInfo,
  CrdtEnvelope,
  HandshakeRequestPayload,
  HandshakeResponsePayload,
  SyncMessage,
} from './sync-types';
import type { YjsSyncContext } from './yjs-sync';
import { requestYjsSync, sendYjsDiff, verifyCrdtEnvelope } from './yjs-sync';

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

  /**
   * DSA public key (hex) pinned for a peer in the CRDT `linkedNodes` record.
   * Missing function or undefined result = NOT pinned (never trusted silently).
   */
  getPinnedDsaKey?: (peerId: string) => string | undefined;
}

// ─── Crypto v2 per-context state ────────────────────────────────────────────

/** Protocol version we advertise in PQC_HANDSHAKE. */
export const LOCAL_CRYPTO_VERSION = 2;

interface PendingV2 {
  transcript: Uint8Array;
  sharedSecret: Uint8Array;
  kemCiphertext: Uint8Array;
  initiatorKemPublicKey: Uint8Array;
  responderKemPublicKey: Uint8Array;
}

interface V2State {
  /** Peers we sent PQC_HANDSHAKE (cryptoV:2) to: a v1 reply is a downgrade. */
  advertised: Set<string>;
  pending: Map<string, PendingV2>;
  ciphers: Map<string, SessionCipher>;
}

const v2States = new WeakMap<object, V2State>();

function v2State(ctx: MessageHandlerContext): V2State {
  let st = v2States.get(ctx);
  if (!st) {
    st = { advertised: new Set(), pending: new Map(), ciphers: new Map() };
    v2States.set(ctx, st);
  }
  return st;
}

/** Session cipher established by a verified v2 handshake, if any. */
export function getSessionCipher(ctx: MessageHandlerContext, peerId: string): SessionCipher | undefined {
  return v2State(ctx).ciphers.get(peerId);
}

/** Seal an outgoing ENCRYPTED_PAYLOAD with the v2 session cipher (counter nonce + AAD). */
export async function sealSessionPayload(
  ctx: MessageHandlerContext,
  peerId: string,
  plaintext: string,
): Promise<string | null> {
  const cipher = getSessionCipher(ctx, peerId);
  return cipher ? cipher.seal(plaintext, 'ENCRYPTED_PAYLOAD') : null;
}

export function clearV2State(ctx: MessageHandlerContext, peerId: string): void {
  const st = v2State(ctx);
  st.advertised.delete(peerId);
  st.pending.delete(peerId);
  st.ciphers.delete(peerId);
}

/** v2 session keys are only ever bound to a DSA key pinned in linkedNodes. */
function isPinnedDsaKey(ctx: MessageHandlerContext, peerId: string, dsaHex: string | undefined): boolean {
  if (!dsaHex) return false;
  const pinned = ctx.getPinnedDsaKey?.(peerId);
  const ok = !!pinned && pinned.toLowerCase() === dsaHex.toLowerCase();
  if (!ok) {
    logger.warn(`[SECURITY] Peer ${peerId} DSA key not pinned in linkedNodes; invitation flow required`);
    ctx.emitConnectionError({
      peerId,
      type: 'UNPINNED_DSA_KEY',
      message: 'peer DSA key is not pinned; use the invitation flow',
      source: 'connection',
    });
  }
  return ok;
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
    await handlePQCHandshake(ctx, conn, message);
    return;
  }

  if (message.type === 'PQC_KEM_REPLY') {
    await handlePQCHandshakeResponse(ctx, conn, message as any);
    return;
  }

  if (message.type === 'PQC_KEM_REPLY_ACK') {
    await handlePQCHandshakeAck(ctx, conn, message as any);
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
    if (applyVerifiedYjsUpdate(ctx, message.payload, conn.peer)) {
      ctx.emitMessageCallbacks(message, conn.peer);
    }
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

  // SHELF-104: authority messages require a PQC-verified, ML-DSA-signed sender
  // on the plain wire path too (not just the encrypted path).
  if (!isAuthorizedAuthorityMessage(message, conn.peer)) {
    return;
  }

  for (const cb of ctx.onMessageCallbacks) {
    cb(message, conn.peer);
  }
}

// ─── Authority gate (SHELF-104) ─────────────────────────────────────────────

/** Extract the admin-claim proof fields from any authority message payload. */
function getAuthorityClaimProof(message: SyncMessage): { signature?: string; dsaPublicKey?: string } {
  const payload = (message as { payload?: { signature?: string; dsaPublicKey?: string } }).payload;
  return {
    signature: typeof payload?.signature === 'string' ? payload.signature : undefined,
    dsaPublicKey: typeof payload?.dsaPublicKey === 'string' ? payload.dsaPublicKey : undefined,
  };
}

/**
 * SHELF-104: authority messages are accepted ONLY from PQC-verified, signed
 * senders — on both the plain and encrypted wire paths. Drops the message and
 * records an audit entry otherwise.
 */
function isAuthorizedAuthorityMessage(message: SyncMessage, fromPeerId: string): boolean {
  if (!isAuthorityMessage(message)) return true;
  const { signature, dsaPublicKey } = getAuthorityClaimProof(message);
  if (!isAuthorizedAuthoritySender(fromPeerId, signature, dsaPublicKey)) {
    logger.warn(`[SECURITY] Ignored authority message ${message.type} from unauthorized peer ${fromPeerId}`);
    return false;
  }
  return true;
}

// ─── PQC handshake sub-handlers ─────────────────────────────────────────────

async function handlePQCHandshake(
  ctx: MessageHandlerContext,
  conn: DataConnection,
  message: SyncMessage & { type: 'PQC_HANDSHAKE' },
): Promise<void> {
  // v1 is accepted ONLY when the peer does not advertise v2 (version cutoff).
  if ((message.payload as { cryptoV?: number }).cryptoV === 2) {
    await handleV2Handshake(ctx, conn, message.payload);
    return;
  }
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

async function handleV2Handshake(
  ctx: MessageHandlerContext,
  conn: DataConnection,
  payload: { kemPublicKey: string; dsaPublicKey: string; challenge: string },
): Promise<void> {
  if (!ctx.localPeerId || !isPinnedDsaKey(ctx, conn.peer, payload.dsaPublicKey)) return;
  try {
    const initiatorKem = fromHex(payload.kemPublicKey);
    const { ciphertext, sharedSecret } = encapsulate(initiatorKem);
    const responderChallenge = crypto.getRandomValues(new Uint8Array(32));
    const transcript = await buildHandshakeTranscript({
      initiatorId: conn.peer,
      responderId: ctx.localPeerId,
      initiatorKemPublicKey: initiatorKem,
      responderKemPublicKey: ctx.kemKeyPair.publicKey,
      initiatorDsaPublicKey: fromHex(payload.dsaPublicKey),
      responderDsaPublicKey: ctx.dsaKeyPair.publicKey,
      kemCiphertext: ciphertext,
      challenge: fromHex(payload.challenge),
      responderChallenge,
    });
    ctx.peerDsaKeys.set(conn.peer, payload.dsaPublicKey);
    v2State(ctx).pending.set(conn.peer, {
      transcript,
      sharedSecret,
      kemCiphertext: ciphertext,
      initiatorKemPublicKey: initiatorKem,
      responderKemPublicKey: ctx.kemKeyPair.publicKey,
    });
    conn.send({
      type: 'PQC_KEM_REPLY',
      payload: {
        cryptoV: 2,
        ciphertext: toHex(ciphertext),
        kemPublicKey: toHex(ctx.kemKeyPair.publicKey),
        dsaPublicKey: toHex(ctx.dsaKeyPair.publicKey),
        signature: toHex(ctx.signFn(transcriptSigningInput(transcript, 'reply'))),
        responderChallenge: toHex(responderChallenge),
      },
    });
  } catch (err) {
    logger.error('v2 handshake failed:', err);
    conn.close();
  }
}

async function handleV2Reply(ctx: MessageHandlerContext, conn: DataConnection, p: any): Promise<void> {
  if (!ctx.localPeerId || !isPinnedDsaKey(ctx, conn.peer, p.dsaPublicKey)) return;
  try {
    const challenges = ctx.pendingChallenges.get(conn.peer);
    if (!challenges || challenges.size === 0) throw new Error('no pending challenge');
    const responderKem = fromHex(p.kemPublicKey);
    const ct = fromHex(p.ciphertext);
    const sharedSecret = decapsulate(ct, ctx.kemKeyPair.secretKey);
    let transcript: Uint8Array | null = null;
    for (const challengeHex of challenges) {
      const t = await buildHandshakeTranscript({
        initiatorId: ctx.localPeerId,
        responderId: conn.peer,
        initiatorKemPublicKey: ctx.kemKeyPair.publicKey,
        responderKemPublicKey: responderKem,
        initiatorDsaPublicKey: ctx.dsaKeyPair.publicKey,
        responderDsaPublicKey: fromHex(p.dsaPublicKey),
        kemCiphertext: ct,
        challenge: fromHex(challengeHex),
        responderChallenge: fromHex(p.responderChallenge),
      });
      if (ctx.verifyFn(fromHex(p.signature), transcriptSigningInput(t, 'reply'), p.dsaPublicKey)) {
        challenges.delete(challengeHex);
        transcript = t;
        break;
      }
    }
    if (!transcript) throw new Error('transcript signature verification failed');
    ctx.peerDsaKeys.set(conn.peer, p.dsaPublicKey);
    ctx.sharedSecrets.set(conn.peer, sharedSecret);
    await setupEncryption(ctx, conn.peer, sharedSecret, {
      kemCiphertext: ct,
      initiatorKemPublicKey: ctx.kemKeyPair.publicKey,
      responderKemPublicKey: responderKem,
    });
    conn.send({
      type: 'PQC_KEM_REPLY_ACK',
      payload: { cryptoV: 2, signature: toHex(ctx.signFn(transcriptSigningInput(transcript, 'ack'))) },
    });
  } catch (err) {
    logger.error('PQC v2 reply rejected:', err);
    conn.close();
  }
}

async function handlePQCHandshakeResponse(ctx: MessageHandlerContext, conn: DataConnection, message: any): Promise<void> {
  const st = v2State(ctx);
  if (message.payload?.cryptoV === 2) {
    await handleV2Reply(ctx, conn, message.payload);
    return;
  }
  if (st.advertised.has(conn.peer)) {
    // We advertised v2: a v1 reply is a downgrade attempt.
    logger.error(`[SECURITY] Rejected v1 PQC_KEM_REPLY from ${conn.peer} (v2 advertised)`);
    conn.close();
    return;
  }
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

async function handlePQCHandshakeAck(ctx: MessageHandlerContext, conn: DataConnection, message: any): Promise<void> {
  const pending = v2State(ctx).pending.get(conn.peer);
  if (pending) {
    const dsaHex = ctx.peerDsaKeys.get(conn.peer);
    let ok = false;
    try {
      ok =
        !!dsaHex &&
        !!ctx.localPeerId &&
        ctx.verifyFn(fromHex(message.payload.signature), transcriptSigningInput(pending.transcript, 'ack'), dsaHex);
    } catch {
      ok = false;
    }
    if (!ok || !ctx.localPeerId) {
      logger.error('PQC v2 ACK signature verification failed!');
      v2State(ctx).pending.delete(conn.peer);
      conn.close();
      return;
    }
    v2State(ctx).pending.delete(conn.peer);
    ctx.sharedSecrets.set(conn.peer, pending.sharedSecret);
    await setupEncryption(ctx, conn.peer, pending.sharedSecret, {
      kemCiphertext: pending.kemCiphertext,
      initiatorKemPublicKey: pending.initiatorKemPublicKey,
      responderKemPublicKey: pending.responderKemPublicKey,
    });
    return;
  }
  if (v2State(ctx).advertised.has(conn.peer)) {
    logger.error(`[SECURITY] Rejected v1 ACK from ${conn.peer} (v2 advertised)`);
    conn.close();
    return;
  }
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
    const cipher = getSessionCipher(ctx, fromPeerId);
    const decrypted = cipher
      ? await cipher.open(ciphertext, 'ENCRYPTED_PAYLOAD')
      : await decryptData(ciphertext, key);
    const message = JSON.parse(decrypted) as SyncMessage;

    if (!isAuthorizedAuthorityMessage(message, fromPeerId)) {
      return;
    }

    // Dispatch the decrypted message
    if (message.type === 'YJS_UPDATE') {
      if (applyVerifiedYjsUpdate(ctx, message.payload, fromPeerId)) {
        ctx.emitMessageCallbacks(message, fromPeerId);
      }
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

  // Deterministic master election (split-brain cure): both sides compute
  // the same winner (lowest peer ID), so the Yjs metadata merge never sees
  // two competing authorityPeerId claims. Self-master bootstrap above only
  // happens when no remote is known yet; this reconciles it on first contact.
  if (ctx.localPeerId) {
    const electedMaster = dbSync.electMasterWith(conn.peer);
    if (electedMaster && electedMaster !== ctx.localPeerId && ctx.role === 'admin') {
      ctx.role = 'collaborator';
    }
  }

  // Broadcast updated peer list to the mesh
  ctx.broadcastPeerList();

  // Trigger Yjs catch-up sync on connection open
  requestYjsSync(ctx, conn.peer);

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
    v2State(ctx).advertised.add(conn.peer);
    conn.send({
      type: 'PQC_HANDSHAKE',
      payload: {
        cryptoV: LOCAL_CRYPTO_VERSION,
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
  binding: {
    kemCiphertext: Uint8Array;
    initiatorKemPublicKey: Uint8Array;
    responderKemPublicKey: Uint8Array;
  },
): Promise<void> {
  if (!ctx.localPeerId) throw new Error('local peer id required for session key derivation');
  const key = await deriveSessionKey({
    sharedSecret,
    kemCiphertext: binding.kemCiphertext,
    initiatorKemPublicKey: binding.initiatorKemPublicKey,
    responderKemPublicKey: binding.responderKemPublicKey,
    peerIdA: ctx.localPeerId,
    peerIdB: peerId,
  });
  ctx.encryptionKeys.set(peerId, key);
  v2State(ctx).ciphers.set(peerId, new SessionCipher(key, ctx.localPeerId, peerId));
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

/**
 * SHELF-113: apply a remote Yjs update ONLY after its signed CRDT envelope
 * verifies against the peer's registered ML-DSA public key. Envelopes with
 * invalid or missing signatures, unregistered signers, stale/future
 * timestamps, or a signer ≠ connection mismatch are rejected (audit-logged,
 * never applied). Returns true when the update passed verification and was
 * applied (or matched for branch semantics as before).
 */
function applyVerifiedYjsUpdate(
  ctx: MessageHandlerContext,
  payload: { update: string; branchId?: string; signature?: string; signerPeerId?: string; timestamp?: number },
  fromPeerId: string,
): boolean {
  const envelope: CrdtEnvelope = {
    data: payload.update,
    signature: payload.signature || '',
    peerId: payload.signerPeerId || '',
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Number.NaN,
  };

  const verification = verifyCrdtEnvelope(envelope, fromPeerId);
  if (!verification.ok) {
    // The in-memory audit trail + console log already record the rejection;
    // surface it to connection-error listeners as well for observability.
    ctx.emitConnectionError({
      peerId: fromPeerId,
      type: 'CRDT_ENVELOPE_REJECTED',
      message: verification.reason || 'signed envelope rejected',
      source: 'connection',
    });
    return false;
  }

  const branchId = payload.branchId;
  // Only apply update if it matches our active branch, or is a global update
  if (!branchId || branchId === dbSync.activeBranchId) {
    dbSync.applyUpdate(fromHex(envelope.data), fromPeerId);
  }
  return true;
}

function isLocalAuth(ctx: MessageHandlerContext): boolean {
  // SHELF-105: a disconnected peer cannot claim authority — an empty
  // connection map means the local node is offline (deny, don't promote).
  const isConnected = ctx.connections.size > 0;
  return isLocalAuthorityPeer(ctx.localPeerId, ctx.role, isConnected);
}
