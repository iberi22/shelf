/**
 * Yjs CRDT sync helpers for the P2P mesh.
 *
 * Extracted from P2PManager — these functions encapsulate the Yjs
 * state-vector exchange and branch management logic.
 */

import { fromHex, toHex } from '../crypto-pqc';
import { dbSync } from '../database-sync';
import { logger } from '../utils/logger';
import type { SyncMessage } from './sync-types';

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
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
 */
export function sendYjsDiff(ctx: YjsSyncContext, peerId: string, stateVectorHex: string, branchId?: string): void {
  if (!dbSync.isReady) return;
  const targetBranchId = branchId || dbSync.activeBranchId || undefined;
  ctx.sendTo(peerId, {
    type: 'YJS_UPDATE',
    payload: {
      update: toHex(dbSync.getDiff(fromHex(stateVectorHex))),
      branchId: targetBranchId,
    },
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
      payload: { update: toHex(update), branchId },
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
