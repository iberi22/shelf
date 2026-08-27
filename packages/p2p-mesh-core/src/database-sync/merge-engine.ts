import * as Y from 'yjs';
import { logger } from '../utils/logger';
import {
  checkRemotePermissions,
  getEffectivePeerConfig,
  isAuthorityPeer,
  isRemotePeerOrigin,
  isTrustedRemoteWriter,
  PRIVILEGE_COLLECTIONS,
  SECURED_COLLECTIONS,
  SECURITY_REVERT_ORIGIN,
} from './authority-checks';
import type { EntityRecord, SyncContext } from './types';

// ─── Snapshot & Revert ──────────────────────────────────────────────────────

/** Snapshot all secured collection maps before a remote apply. */
export function snapshotCollectionMaps(doc: Y.Doc): Map<string, Map<string, unknown>> {
  const snap = new Map<string, Map<string, unknown>>();
  for (const name of SECURED_COLLECTIONS) {
    const yMap = doc.getMap(name);
    const copy = new Map<string, unknown>();
    yMap.forEach((value: unknown, key: string) => {
      copy.set(key, value);
    });
    snap.set(name, copy);
  }
  return snap;
}

/**
 * After a remote applyUpdate, surgically restore any keys the peer was not
 * allowed to change. Uses SECURITY_REVERT_ORIGIN so observers can ignore it.
 */
export function revertUnauthorizedRemoteChanges(
  ctx: SyncContext,
  peerId: string,
  before: Map<string, Map<string, unknown>>,
): string[] {
  const revertedCollections: string[] = [];

  ctx.doc.transact(() => {
    for (const name of SECURED_COLLECTIONS) {
      const yMap = ctx.doc.getMap(name);
      const prev = before.get(name) ?? new Map<string, unknown>();
      let touched = false;

      // Keys currently in map
      for (const key of Array.from(yMap.keys())) {
        const current = yMap.get(key);
        const previous = prev.get(key);
        const changed = previous === undefined || JSON.stringify(previous) !== JSON.stringify(current);

        if (!changed) continue;

        const item = current && typeof current === 'object' ? (current as Partial<EntityRecord>) : undefined;

        if (!checkRemotePermissions(peerId, name, ctx, item)) {
          if (previous === undefined) {
            yMap.delete(key);
          } else {
            yMap.set(key, previous);
          }
          touched = true;
        }
      }

      // Keys deleted by remote
      for (const [key, previous] of prev) {
        if (!yMap.has(key)) {
          if (!checkRemotePermissions(peerId, name, ctx, previous as Partial<EntityRecord>)) {
            yMap.set(key, previous);
            touched = true;
          }
        }
      }

      if (touched) revertedCollections.push(name);
    }
  }, SECURITY_REVERT_ORIGIN);

  return revertedCollections;
}

/** Snapshot privilege collection maps before a remote apply. */
export function snapshotPrivilegeMaps(doc: Y.Doc): Map<string, Map<string, unknown>> {
  const snap = new Map<string, Map<string, unknown>>();
  for (const name of PRIVILEGE_COLLECTIONS) {
    const yMap = doc.getMap(name);
    const copy = new Map<string, unknown>();
    yMap.forEach((value: unknown, key: string) => {
      copy.set(key, value);
    });
    snap.set(name, copy);
  }
  return snap;
}

/**
 * Revert unauthorized privilege-map changes from a non-admin remote peer.
 */
export function revertUnauthorizedPrivilegeMaps(
  ctx: SyncContext,
  peerId: string,
  before: Map<string, Map<string, unknown>>,
): void {
  const effective = getEffectivePeerConfig(peerId, ctx);
  const isAdmin =
    isAuthorityPeer(peerId, ctx.metadata, ctx.linkedNodes) || effective.role === 'admin' || effective.isMaster;
  if (isAdmin) return;

  ctx.doc.transact(() => {
    for (const name of PRIVILEGE_COLLECTIONS) {
      const yMap = ctx.doc.getMap(name);
      const prev = before.get(name) ?? new Map<string, unknown>();

      for (const key of Array.from(yMap.keys())) {
        const current = yMap.get(key);
        const previous = prev.get(key);
        const changed = previous === undefined || JSON.stringify(previous) !== JSON.stringify(current);
        if (!changed) continue;

        if (name === 'auditLogs') {
          const action =
            current && typeof current === 'object' && typeof (current as { action?: unknown }).action === 'string'
              ? (current as { action: string }).action
              : '';
          if (!action.includes('PRIVILEGE')) continue;
        }

        if (previous === undefined) yMap.delete(key);
        else yMap.set(key, previous);
      }

      for (const [key, previous] of prev) {
        if (!yMap.has(key)) {
          // Deletions of privilege records by non-admins: restore
          if (name !== 'auditLogs') yMap.set(key, previous);
        }
      }
    }
  }, SECURITY_REVERT_ORIGIN);
}

// ─── Apply Update with Security ─────────────────────────────────────────────

/**
 * Apply a CRDT update with security gating.
 * Drops updates from untrusted peers; surgically reverts unauthorized changes.
 */
/**
 * Perform field-level Last-Write-Wins (LWW) merge for products when remote CRDT updates arrive.
 */
export function mergeProductFields(ctx: SyncContext, beforeProducts?: Map<string, unknown>): void {
  if (!beforeProducts || beforeProducts.size === 0) return;
  const productsMap = ctx.doc.getMap('products');
  if (!productsMap) return;

  ctx.doc.transact(() => {
    for (const [id, prevVal] of beforeProducts.entries()) {
      const currentVal = productsMap.get(id);
      if (!prevVal || !currentVal || typeof prevVal !== 'object' || typeof currentVal !== 'object') {
        continue;
      }

      const prev = prevVal as Record<string, any>;
      const curr = currentVal as Record<string, any>;

      const prevFieldTs = prev._fieldTimestamps || {};
      const currFieldTs = curr._fieldTimestamps || {};

      let needsUpdate = false;
      const merged = { ...curr };
      const mergedTimestamps = { ...(curr._fieldTimestamps || {}) };

      const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

      for (const key of allKeys) {
        if (['id', 'updatedAt', 'updatedBy', '__baseUpdatedAt', '_fieldTimestamps'].includes(key)) continue;

        const valPrev = prev[key];
        const valCurr = curr[key];

        if (valPrev === undefined && valCurr === undefined) continue;

        const tsPrev = prevFieldTs[key]
          ? new Date(prevFieldTs[key]).getTime()
          : prev.updatedAt
            ? new Date(prev.updatedAt).getTime()
            : 0;
        const tsCurr = currFieldTs[key]
          ? new Date(currFieldTs[key]).getTime()
          : curr.updatedAt
            ? new Date(curr.updatedAt).getTime()
            : 0;

        if (tsPrev > tsCurr) {
          merged[key] = valPrev;
          mergedTimestamps[key] = prevFieldTs[key] || prev.updatedAt;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        merged._fieldTimestamps = mergedTimestamps;
        const maxTs = Math.max(
          prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0,
          curr.updatedAt ? new Date(curr.updatedAt).getTime() : 0,
          Date.now(),
        );
        merged.updatedAt = new Date(maxTs).toISOString();
        productsMap.set(id, merged);
      }
    }
  }, 'local');
}

/**
 * Apply a CRDT update with security gating.
 * Drops updates from untrusted peers; surgically reverts unauthorized changes.
 */
export function applyUpdate(ctx: SyncContext, update: Uint8Array, origin?: unknown): void {
  if (update.length === 0) return;

  if (!isRemotePeerOrigin(origin, ctx.localPeerId)) {
    Y.applyUpdate(ctx.doc, update, origin);
    return;
  }

  const peerId = origin as string;
  // Hard gate: drop entire CRDT payload from completely unknown peers (inject attacks).
  // Known mesh members may merge; post-merge surgical revert enforces canEdit* + privilege maps.
  if (!isTrustedRemoteWriter(peerId, ctx)) {
    logger.warn(`[SECURITY] Dropped remote CRDT update from untrusted peer ${peerId}`);
    return;
  }

  const before = snapshotCollectionMaps(ctx.doc);
  Y.applyUpdate(ctx.doc, update, origin);
  const reverted = revertUnauthorizedRemoteChanges(ctx, peerId, before);
  if (reverted.length > 0) {
    logger.warn(`[SECURITY] Surgically reverted unauthorized remote changes from ${peerId} on: ${reverted.join(', ')}`);
  }
  mergeProductFields(ctx, before.get('products'));
}

// ─── State Vector Encoding ──────────────────────────────────────────────────

/** Generate a full state update for syncing with other peers. */
export function getLocalUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/** Generate a state vector for diff computation. */
export function getStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}

/** Generate a diff update relative to a remote state vector. */
export function getDiff(doc: Y.Doc, remoteStateVector: Uint8Array): Uint8Array {
  return Y.encodeStateAsUpdate(doc, remoteStateVector);
}

// ─── Observer Registration ──────────────────────────────────────────────────

/**
 * Register high-level observers on all collections for granular entity updates.
 * Returns an unsubscribe function.
 */
export function registerObservers(
  collections: Record<string, Y.Map<any>>,
  callback: (collection: string, items: EntityRecord[], deletedIds: string[]) => void,
): () => void {
  const collectionNames = [
    'products',
    'sales',
    'clients',
    'suppliers',
    'purchaseOrders',
    'auditLogs',
    'arqueoSessions',
    'ocrResults',
    'teamMembers',
    'branches',
    'pendingEdits',
    'productChangeHistory',
  ];

  const observers = collectionNames.map((col) => {
    const yMap = collections[col];
    if (!yMap) return null;

    const observer = (event: Y.YMapEvent<EntityRecord>) => {
      const items: EntityRecord[] = [];
      const deletedIds: string[] = [];

      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const item = yMap.get(key);
          if (item) items.push(item);
        } else if (change.action === 'delete') {
          deletedIds.push(key);
        }
      });

      if (items.length > 0 || deletedIds.length > 0) {
        callback(col, items, deletedIds);
      }
    };

    yMap.observe(observer);
    return { yMap, observer };
  });

  return () => {
    observers.forEach((obs) => {
      if (obs) obs.yMap.unobserve(obs.observer);
    });
  };
}
