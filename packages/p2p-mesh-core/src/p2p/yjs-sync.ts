/**
 * Yjs CRDT sync helpers for the P2P mesh.
 *
 * Extracted from P2PManager — these functions encapsulate the Yjs
 * state-vector exchange and branch management logic.
 */

import { fromHex, verify as mlDsaVerify, toHex } from '../crypto-pqc';
import { dbSync } from '../database-sync';
import { logger } from '../utils/logger';
import type { CrdtEnvelope, SyncMessage } from './sync-types';

// ─── Yjs sync context (what the functions need from P2PManager) ────────────

export interface YjsSyncContext {
  /** Send a message to a specific peer. */
  sendTo: (peerId: string, message: SyncMessage) => Promise<void>;
  /** Broadcast a message to all connected peers. */
  broadcast: (message: SyncMessage) => void;
  /** Current YJS wire mode. */
  yjsWireMode: 'legacy' | 'envelope-when-ready';
  /** Edge-mesh envelope relay (null when not registered). */
  edgeYjsRelay: ((update: Uint8Array, branchId?: string) => Promise<void>) | null;
  /** Check if all connected peers are dual-ready for app-layer crypto. */
  areAllConnectedPeersDualReady: () => boolean;
  /** Active connections map (peerId → DataConnection). */
  connections: Map<string, { open: boolean }>;
  /** Cache of last sent state vectors per peer to make sync idempotent. */
  lastSentStateVectors?: Map<string, string>;
  /** Set of peers with dual ready encryption setup. */
  dualReadyEncryption?: Set<string>;
  /** Local peer ID — used as the signer identity in CRDT envelopes. */
  localPeerId?: string | null;
  /** Sign a message with the local ML-DSA secret key (SHELF-113). */
  signFn?: (message: Uint8Array) => Uint8Array;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// ═══ SHELF-113: Signed CRDT envelope validation ═════════════════════════════
// Every YJS_UPDATE on the mesh MUST be an ML-DSA-65 signed envelope:
//   { data: YjsUpdate (hex), signature: ML-DSA (hex), peerId, timestamp }
// The signature is verified against the peer's REGISTERED public key from the
// CRDT metadata document (`linkedNodes[peerId].dsaPublicKey`). Envelopes with
// invalid or missing signatures are rejected and never applied.

/** Maximum age of an envelope before it is considered stale (5 min). */
export const CRDT_ENVELOPE_MAX_AGE_MS = 5 * 60 * 1000;
/** Maximum allowed clock skew for envelope timestamps (30 s). */
export const CRDT_ENVELOPE_MAX_CLOCK_SKEW_MS = 30 * 1000;

export type CrdtEnvelopeRejectionReason =
  | 'missing-data'
  | 'missing-signature'
  | 'missing-peer-id'
  | 'missing-timestamp'
  | 'signer-mismatch'
  | 'expired-timestamp'
  | 'future-timestamp'
  | 'unregistered-peer-key'
  | 'invalid-signature';

export interface CrdtEnvelopeAuditEntry {
  at: number;
  /** Connection peer id that delivered the envelope. */
  peerId: string;
  /** Peer id claimed by the envelope signer. */
  envelopePeerId?: string;
  reason: CrdtEnvelopeRejectionReason;
  /** Bytes of the Yjs payload (helps spot oversized/duplicated floods). */
  dataLength: number;
  /** Public key used for verification (first 16 hex chars), when available. */
  publicKeyPrefix?: string;
}

export interface CrdtEnvelopeVerificationResult {
  ok: boolean;
  reason?: CrdtEnvelopeRejectionReason;
  /** Registered public key (hex) the signature was checked against. */
  publicKeyUsed?: string;
}

/**
 * In-memory audit trail of rejected CRDT envelopes (SHELF-113).
 * Utilities/observers can subscribe or tests can assert on it.
 */
export const crdtEnvelopeAuditLog: CrdtEnvelopeAuditEntry[] = [];

export const clearCrdtEnvelopeAuditLog = (): void => {
  crdtEnvelopeAuditLog.length = 0;
};

const truncateHex = (hex: string, max = 16): string => (hex.length > max ? hex.slice(0, max) : hex);

function recordEnvelopeRejection(
  envelope: CrdtEnvelope,
  fromPeerId: string,
  reason: CrdtEnvelopeRejectionReason,
  publicKeyUsed?: string,
): void {
  const entry: CrdtEnvelopeAuditEntry = {
    at: Date.now(),
    peerId: fromPeerId,
    envelopePeerId: envelope.peerId || undefined,
    reason,
    dataLength: envelope.data.length,
    publicKeyPrefix: publicKeyUsed ? truncateHex(publicKeyUsed) : undefined,
  };
  crdtEnvelopeAuditLog.push(entry);

  // Audit logging: always surface verification failures on the wire too.
  logger.warn(
    `[CRDT-SIGNATURE] Rejected ${reason} envelope from ${fromPeerId}` +
      (envelope.peerId && envelope.peerId !== fromPeerId ? ` (claimed signer ${envelope.peerId})` : '') +
      (publicKeyUsed ? ` pub=${truncateHex(publicKeyUsed)}` : '') +
      ` dataLen=${envelope.data.length}`,
  );
}

/**
 * Look up the REGISTERED ML-DSA public key for a peer from the CRDT
 * metadata document (`linkedNodes`). Returns null when the peer is not
 * registered or has no key recorded — such envelopes MUST be rejected.
 */
export function getRegisteredPeerPublicKey(peerId: string): string | null {
  const node = dbSync.getLinkedNodes().find((n) => n.id === peerId);
  return node?.dsaPublicKey || null;
}

/**
 * Verify a signed CRDT envelope (SHELF-113).
 *
 * Requirements for acceptance:
 *   1. All envelope fields present (data, signature, peerId, timestamp).
 *   2. `envelope.peerId` matches the connection peer delivering it.
 *   3. `timestamp` is not expired and not in the future (clock skew guard).
 *   4. The peer has a registered ML-DSA public key in the CRDT metadata.
 *   5. The ML-DSA-65 signature over `data` verifies against that key.
 *
 * Any failure writes an audit-log entry and returns `{ ok: false, reason }`.
 */
export function verifyCrdtEnvelope(
  envelope: CrdtEnvelope,
  fromPeerId: string,
  opts: { maxAgeMs?: number; maxClockSkewMs?: number; now?: number } = {},
): CrdtEnvelopeVerificationResult {
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? CRDT_ENVELOPE_MAX_AGE_MS;
  const maxClockSkewMs = opts.maxClockSkewMs ?? CRDT_ENVELOPE_MAX_CLOCK_SKEW_MS;

  // 1. Presence checks — missing signature/signer/timestamp ⇒ reject.
  if (!envelope.data) {
    recordEnvelopeRejection(envelope, fromPeerId, 'missing-data');
    return { ok: false, reason: 'missing-data' };
  }
  if (!envelope.signature) {
    recordEnvelopeRejection(envelope, fromPeerId, 'missing-signature');
    return { ok: false, reason: 'missing-signature' };
  }
  if (!envelope.peerId) {
    recordEnvelopeRejection(envelope, fromPeerId, 'missing-peer-id');
    return { ok: false, reason: 'missing-peer-id' };
  }
  if (!Number.isFinite(envelope.timestamp)) {
    recordEnvelopeRejection(envelope, fromPeerId, 'missing-timestamp');
    return { ok: false, reason: 'missing-timestamp' };
  }

  // 2. Identity binding — the envelope must be signed by the connection peer.
  if (envelope.peerId !== fromPeerId) {
    recordEnvelopeRejection(envelope, fromPeerId, 'signer-mismatch');
    return { ok: false, reason: 'signer-mismatch' };
  }

  // 3. Freshness — replay protection.
  if (now - envelope.timestamp > maxAgeMs) {
    recordEnvelopeRejection(envelope, fromPeerId, 'expired-timestamp');
    return { ok: false, reason: 'expired-timestamp' };
  }
  if (envelope.timestamp - now > maxClockSkewMs) {
    recordEnvelopeRejection(envelope, fromPeerId, 'future-timestamp');
    return { ok: false, reason: 'future-timestamp' };
  }

  // 4. Registered public key (CRDT metadata document).
  const registeredKey = getRegisteredPeerPublicKey(envelope.peerId);
  if (!registeredKey) {
    recordEnvelopeRejection(envelope, fromPeerId, 'unregistered-peer-key');
    return { ok: false, reason: 'unregistered-peer-key' };
  }

  // 5. ML-DSA-65 signature verification over the raw update bytes.
  try {
    const signatureOk = mlDsaVerify(fromHex(envelope.signature), fromHex(envelope.data), fromHex(registeredKey));
    if (!signatureOk) {
      recordEnvelopeRejection(envelope, fromPeerId, 'invalid-signature', registeredKey);
      return { ok: false, reason: 'invalid-signature', publicKeyUsed: registeredKey };
    }
  } catch {
    recordEnvelopeRejection(envelope, fromPeerId, 'invalid-signature', registeredKey);
    return { ok: false, reason: 'invalid-signature', publicKeyUsed: registeredKey };
  }

  return { ok: true, publicKeyUsed: registeredKey };
}

/**
 * Build a signed CRDT envelope for a Yjs update (SHELF-113).
 * The ML-DSA signature covers the raw update bytes; identity and freshness
 * are enforced by the receiver via `verifyCrdtEnvelope`.
 */
export function createCrdtEnvelope(
  ctx: Pick<YjsSyncContext, 'signFn'>,
  update: Uint8Array,
  peerId: string,
  now: number = Date.now(),
): CrdtEnvelope {
  const signature = ctx.signFn ? toHex(ctx.signFn(update)) : '';
  return {
    data: toHex(update),
    signature,
    peerId,
    timestamp: now,
  };
}

/** Build the wire payload for a `YJS_UPDATE` message carrying a signed envelope. */
export function toSignedYjsUpdatePayload(
  ctx: Pick<YjsSyncContext, 'signFn' | 'localPeerId'>,
  update: Uint8Array,
  branchId?: string,
): { update: string; branchId?: string; signature: string; signerPeerId: string; timestamp: number } {
  const envelope = createCrdtEnvelope(ctx, update, ctx.localPeerId ?? '');
  return {
    update: envelope.data,
    branchId,
    signature: envelope.signature,
    signerPeerId: envelope.peerId,
    timestamp: envelope.timestamp,
  };
}

/**
 * Request a Yjs state-vector sync from a specific peer.
 * Sends the local state vector so the remote can compute a diff.
 */
export function requestYjsSync(ctx: YjsSyncContext, peerId: string, branchId?: string): void {
  if (!dbSync.isReady) return;
  const targetBranchId = branchId || dbSync.activeBranchId || undefined;
  const stateVectorHex = toHex(dbSync.getStateVector());
  const isDualReady = ctx.dualReadyEncryption?.has(peerId) ?? false;
  const cacheKey = `${targetBranchId || ''}:${stateVectorHex}:${isDualReady ? 'enc' : 'clear'}`;

  if (ctx.lastSentStateVectors) {
    if (ctx.lastSentStateVectors.get(peerId) === cacheKey) {
      // Already sent the exact same state vector request to this peer
      return;
    }
    ctx.lastSentStateVectors.set(peerId, cacheKey);
  }

  ctx.sendTo(peerId, {
    type: 'YJS_SYNC_REQUEST',
    payload: {
      stateVector: stateVectorHex,
      branchId: targetBranchId,
      respondWithRequest: true,
    },
  });
}

/**
 * Send a Yjs diff to a peer, computed from the peer's state vector.
 * The diff is sent as a signed CRDT envelope (SHELF-113).
 */
export function sendYjsDiff(ctx: YjsSyncContext, peerId: string, stateVectorHex: string, branchId?: string): void {
  if (!dbSync.isReady) return;
  const targetBranchId = branchId || dbSync.activeBranchId || undefined;
  const update = dbSync.getDiff(fromHex(stateVectorHex));
  const payload = toSignedYjsUpdatePayload(ctx, update, targetBranchId);
  ctx.sendTo(peerId, {
    type: 'YJS_UPDATE',
    payload,
  });
}

/**
 * Initialise the Yjs <-> dbSync bridge.
 * Listens for local CRDT changes and broadcasts them to the mesh,
 * with retries for transient data-channel drops.
 *
 * This is idempotent — safe to call multiple times (guarded by `initialized` flag).
 */
export function initYjsSync(ctx: YjsSyncContext, yjsRetryDelays: number[], initialized: { value: boolean }): void {
  if (initialized.value) return;
  initialized.value = true;

  dbSync.onChange((update, origin) => {
    if (!dbSync.isReady) return;
    // Only broadcast if the update originated locally to prevent infinite loops
    const isLocal =
      typeof origin === 'object' && origin !== null
        ? (origin as { origin?: string }).origin === 'local'
        : origin === 'local';
    if (!isLocal) return;

    const branchId =
      typeof origin === 'object' && origin !== null ? (origin as { branchId?: string }).branchId : undefined;

    // Phase E: single wire type when envelope relay is ready for full mesh
    if (ctx.yjsWireMode === 'envelope-when-ready' && ctx.edgeYjsRelay && ctx.areAllConnectedPeersDualReady()) {
      void ctx.edgeYjsRelay(update, branchId).catch((err) => logger.error('[P2P] edge YJS envelope relay failed', err));
      return;
    }

    const message: SyncMessage = {
      type: 'YJS_UPDATE',
      // SHELF-113: local broadcasts are signed so remote peers can verify.
      payload: toSignedYjsUpdatePayload(ctx, update, branchId),
    };

    ctx.broadcast(message);

    // Retry the same patch a couple of times to recover from transient
    // data-channel drops. Yjs updates are idempotent, so this is safe.
    for (const delay of yjsRetryDelays) {
      setTimeout(() => {
        if (!ctx.connections.size) return;
        // If mesh became fully dual-ready mid-retry, stop legacy retries
        if (ctx.yjsWireMode === 'envelope-when-ready' && ctx.edgeYjsRelay && ctx.areAllConnectedPeersDualReady()) {
          return;
        }
        ctx.broadcast(message);
      }, delay);
    }
  });

  dbSync.onReady(() => {
    for (const peerId of ctx.connections.keys()) {
      requestYjsSync(ctx, peerId);
    }
  });
}
