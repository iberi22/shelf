import type { AppState } from 'p2p-mesh-core';
import type * as Y from 'yjs';

/**
 * Logical namespace label for status / authz (not a Y.Map name prefix).
 * Phase B: inventory maps live at the root of the shared dbSync Y.Doc
 * (`products`, `sales`, …) — same keys as p2p-mesh-core DatabaseSyncManager.
 */
export const SHELF_EDGE_NAMESPACE = 'shelf';
export const SHELF_EDGE_LOCAL_ORIGIN = 'shelf-edge-workflow';

/**
 * When true (default for production Shelf), Y.Map names are unprefixed and match dbSync.
 * Legacy prefixed mode (`shelf_products`) is only for optional migration/tests.
 */
export const SHELF_EDGE_UNIFIED_DOC = true;

export const SHELF_EDGE_GLOBAL_COLLECTIONS = [
  'clients',
  'suppliers',
  'auditLogs',
  'teamMembers',
  'branches',
] as const satisfies readonly (keyof AppState)[];

export const SHELF_EDGE_BRANCH_COLLECTIONS = [
  'products',
  'sales',
  'purchaseOrders',
  'arqueoSessions',
  'ocrResults',
  'productChangeHistory',
] as const satisfies readonly (keyof AppState)[];

export const SHELF_EDGE_COLLECTIONS = [
  ...SHELF_EDGE_GLOBAL_COLLECTIONS,
  ...SHELF_EDGE_BRANCH_COLLECTIONS,
] as const satisfies readonly (keyof AppState)[];

export type ShelfEdgeCollection = (typeof SHELF_EDGE_COLLECTIONS)[number];

export type ShelfEdgeCollectionStats = Record<ShelfEdgeCollection, number>;

export interface ShelfEdgeSyncResult {
  changedCollections: ShelfEdgeCollection[];
  stats: ShelfEdgeCollectionStats;
  totalItems: number;
}

const hasEntityId = (item: unknown): item is { id: string } => {
  return Boolean(item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string');
};

const isEqualEntity = (left: unknown, right: unknown) => {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
};

/**
 * Resolve the Y.Map key for a collection.
 * Unified mode: plain name (`products`).
 * Legacy prefix mode: `${prefix}_${collection}` (e.g. `shelf_products`).
 */
export const shelfEdgeMapKey = (
  collection: string,
  prefix = '',
  unified = SHELF_EDGE_UNIFIED_DOC,
): string => {
  if (unified || !prefix) return collection;
  return `${prefix}_${collection}`;
};

export const createEmptyShelfEdgeStats = (): ShelfEdgeCollectionStats => {
  return SHELF_EDGE_COLLECTIONS.reduce((stats, collection) => {
    stats[collection] = 0;
    return stats;
  }, {} as ShelfEdgeCollectionStats);
};

export const getShelfEdgeStats = (
  doc: Y.Doc,
  prefix = '',
  unified = SHELF_EDGE_UNIFIED_DOC,
): ShelfEdgeCollectionStats => {
  const stats = createEmptyShelfEdgeStats();
  for (const collection of SHELF_EDGE_COLLECTIONS) {
    const key = shelfEdgeMapKey(collection, prefix, unified);
    stats[collection] = doc.getMap(key).size;
  }
  return stats;
};

export const readShelfEdgeState = (
  doc: Y.Doc,
  prefix = '',
  unified = SHELF_EDGE_UNIFIED_DOC,
): Partial<AppState> => {
  const partial: Partial<AppState> = {};

  for (const collection of SHELF_EDGE_COLLECTIONS) {
    const key = shelfEdgeMapKey(collection, prefix, unified);
    const yMap = doc.getMap(key);
    (partial as Record<ShelfEdgeCollection, unknown[]>)[collection] = Array.from(yMap.values());
  }

  return partial;
};

/**
 * Mirror AppState arrays into Y maps.
 * **Deprecated in unified Phase B** when doc === dbSync.doc (dbSync already owns writes).
 * Kept for legacy dual-doc / migration tests only.
 */
export const syncAppStateToShelfEdgeDoc = (
  doc: Y.Doc,
  state: AppState,
  collections: ShelfEdgeCollection[] = SHELF_EDGE_COLLECTIONS as any,
  prefix = '',
  unified = SHELF_EDGE_UNIFIED_DOC,
): ShelfEdgeSyncResult => {
  const changedCollections: ShelfEdgeCollection[] = [];
  const stats = createEmptyShelfEdgeStats();

  doc.transact(() => {
    for (const collection of collections) {
      const key = shelfEdgeMapKey(collection, prefix, unified);
      const yMap = doc.getMap(key);
      const items = ((state[collection] as unknown[]) || []).filter(hasEntityId);
      const nextIds = new Set(items.map((item) => item.id));
      let changed = false;

      for (const id of Array.from(yMap.keys())) {
        if (!nextIds.has(id)) {
          yMap.delete(id);
          changed = true;
        }
      }

      for (const item of items) {
        if (!isEqualEntity(yMap.get(item.id), item)) {
          yMap.set(item.id, item);
          changed = true;
        }
      }

      stats[collection] = yMap.size;
      if (changed) {
        changedCollections.push(collection);
      }
    }
  }, SHELF_EDGE_LOCAL_ORIGIN);

  return {
    changedCollections,
    stats,
    totalItems: Object.values(stats).reduce((total, count) => total + count, 0),
  };
};

export const getDeletedIdsFromYMapEvent = (event: Y.YMapEvent<unknown>): string[] => {
  const deletedIds: string[] = [];

  event.changes.keys.forEach((change, key) => {
    if (change.action === 'delete') {
      deletedIds.push(key);
    }
  });

  return deletedIds;
};
