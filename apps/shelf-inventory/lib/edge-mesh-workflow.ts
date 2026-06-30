import type { AppState } from 'p2p-mesh-core';
import type * as Y from 'yjs';

export const SHELF_EDGE_NAMESPACE = 'shelf';
export const SHELF_EDGE_LOCAL_ORIGIN = 'shelf-edge-workflow';

export const SHELF_EDGE_COLLECTIONS = [
  'products',
  'sales',
  'clients',
  'suppliers',
  'purchaseOrders',
  'arqueoSessions',
  'ocrResults',
  'auditLogs',
  'teamMembers',
  'productChangeHistory',
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

export const createEmptyShelfEdgeStats = (): ShelfEdgeCollectionStats => {
  return SHELF_EDGE_COLLECTIONS.reduce((stats, collection) => {
    stats[collection] = 0;
    return stats;
  }, {} as ShelfEdgeCollectionStats);
};

export const getShelfEdgeStats = (doc: Y.Doc): ShelfEdgeCollectionStats => {
  const stats = createEmptyShelfEdgeStats();
  for (const collection of SHELF_EDGE_COLLECTIONS) {
    stats[collection] = doc.getMap(collection).size;
  }
  return stats;
};

export const readShelfEdgeState = (doc: Y.Doc): Partial<AppState> => {
  const partial: Partial<AppState> = {};

  for (const collection of SHELF_EDGE_COLLECTIONS) {
    const yMap = doc.getMap(collection);
    (partial as Record<ShelfEdgeCollection, unknown[]>)[collection] = Array.from(yMap.values());
  }

  return partial;
};

export const syncAppStateToShelfEdgeDoc = (
  doc: Y.Doc,
  state: AppState,
  canMutate?: (collection: ShelfEdgeCollection, items: unknown[]) => boolean,
): ShelfEdgeSyncResult => {
  const changedCollections: ShelfEdgeCollection[] = [];
  const stats = createEmptyShelfEdgeStats();

  doc.transact(() => {
    for (const collection of SHELF_EDGE_COLLECTIONS) {
      const yMap = doc.getMap(collection);
      const items = ((state[collection] as unknown[]) || []).filter(hasEntityId);
      const nextIds = new Set(items.map((item) => item.id));
      let changed = false;

      for (const id of Array.from(yMap.keys())) {
        if (!nextIds.has(id)) {
          if (canMutate && !canMutate(collection, [])) {
            continue;
          }
          yMap.delete(id);
          changed = true;
        }
      }

      for (const item of items) {
        if (!isEqualEntity(yMap.get(item.id), item)) {
          if (canMutate && !canMutate(collection, [item])) {
            continue;
          }
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
