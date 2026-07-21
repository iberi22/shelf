import { createNamespaceAuthorizer } from 'edge-mesh';
import { useEdgeMesh } from 'edge-mesh-react';
import type { AppState, PeerInfo, PeerPermissions } from 'p2p-mesh-core';
import { dbSync } from 'p2p-mesh-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import {
  getDeletedIdsFromYMapEvent,
  getShelfEdgeStats,
  SHELF_EDGE_BRANCH_COLLECTIONS,
  SHELF_EDGE_COLLECTIONS,
  SHELF_EDGE_GLOBAL_COLLECTIONS,
  SHELF_EDGE_LOCAL_ORIGIN,
  SHELF_EDGE_NAMESPACE,
  SHELF_EDGE_UNIFIED_DOC,
  type ShelfEdgeCollection,
  type ShelfEdgeCollectionStats,
  shelfEdgeMapKey,
} from '../lib/edge-mesh-workflow';

type EdgeMeshDispatch = (action: {
  type: 'SYNC_ENTITIES';
  payload: { collection: keyof AppState; items: unknown[]; deletedIds: string[] };
}) => void;

export interface EdgeMeshWorkflowStatus {
  enabled: boolean;
  namespace: string;
  unifiedDoc: boolean;
  sharedWithDbSync: boolean;
  lastLocalSyncAt: string | null;
  lastRemoteSyncAt: string | null;
  lastChangedCollections: ShelfEdgeCollection[];
  stats: ShelfEdgeCollectionStats | null;
  totalItems: number;
}

const defaultStatus: EdgeMeshWorkflowStatus = {
  enabled: false,
  namespace: SHELF_EDGE_NAMESPACE,
  unifiedDoc: SHELF_EDGE_UNIFIED_DOC,
  sharedWithDbSync: false,
  lastLocalSyncAt: null,
  lastRemoteSyncAt: null,
  lastChangedCollections: [],
  stats: null,
  totalItems: 0,
};

const EDGE_MESH_STATUS_EVENT = 'shelf-edge-mesh-status';
const SHELF_EDGE_SECURITY_ORIGIN = 'shelf-edge-security-revert';

const collectionPermissionMap: Partial<Record<ShelfEdgeCollection, keyof PeerPermissions>> = {
  products: 'canEditProducts',
  sales: 'canEditSales',
  clients: 'canEditClients',
  suppliers: 'canEditSuppliers',
  purchaseOrders: 'canEditPurchaseOrders',
  arqueoSessions: 'canViewArqueo',
  ocrResults: 'canEditPurchaseOrders',
};

const emitStatus = (status: EdgeMeshWorkflowStatus) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<EdgeMeshWorkflowStatus>(EDGE_MESH_STATUS_EVENT, { detail: status }));
  (window as unknown as { __shelfEdgeMeshStatus?: EdgeMeshWorkflowStatus }).__shelfEdgeMeshStatus = status;
};

const isLocalTestRuntime = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

export function useEdgeMeshWorkflowStatus() {
  const [status, setStatus] = useState<EdgeMeshWorkflowStatus>(() => {
    if (typeof window === 'undefined') return defaultStatus;
    return (
      (window as unknown as { __shelfEdgeMeshStatus?: EdgeMeshWorkflowStatus }).__shelfEdgeMeshStatus || defaultStatus
    );
  });

  useEffect(() => {
    const handler = (event: Event) => {
      setStatus((event as CustomEvent<EdgeMeshWorkflowStatus>).detail);
    };

    window.addEventListener(EDGE_MESH_STATUS_EVENT, handler);
    return () => window.removeEventListener(EDGE_MESH_STATUS_EVENT, handler);
  }, []);

  return status;
}

interface EdgeMeshWorkflowBridgeProps {
  state: AppState;
  dispatch: EdgeMeshDispatch;
  isLoaded: boolean;
}

const getMasterPeerId = (state: AppState) => {
  return state.peers.find((peer) => peer.isMaster)?.id || state.localPeerId || null;
};

const getPeer = (state: AppState, peerId: string): PeerInfo | undefined => {
  if (state.localPeerId === peerId) {
    return {
      id: peerId,
      role: state.role,
      permissions: state.permissions,
      lastSeen: new Date().toISOString(),
    };
  }

  return state.peers.find((peer) => peer.id === peerId);
};

const isMaliciousAuditEntry = (item: unknown) => {
  return Boolean(
    item &&
      typeof item === 'object' &&
      typeof (item as { action?: unknown }).action === 'string' &&
      (item as { action: string }).action.includes('PRIVILEGE'),
  );
};

const canPeerMutateCollection = (
  state: AppState,
  peerId: string,
  collection: ShelfEdgeCollection,
  items: unknown[],
) => {
  // Local device writes (or test injects attributed to this node) always allowed.
  if (peerId && (peerId === state.localPeerId || peerId === dbSync.localPeerId)) {
    return true;
  }

  const masterPeerId = getMasterPeerId(state) || dbSync.getMasterPeerId?.() || null;
  if (masterPeerId && peerId === masterPeerId) return true;

  if (collection === 'teamMembers') return false;
  if (collection === 'auditLogs') {
    return !items.some(isMaliciousAuditEntry);
  }

  const permissionKey = collectionPermissionMap[collection];
  if (!permissionKey) return false;

  const peer = getPeer(state, peerId);
  if (!peer) return false;

  const permissions = peer.permissions || state.permissions;
  const authorizer = createNamespaceAuthorizer();
  for (const candidate of state.peers) {
    const candidatePermissions =
      candidate.permissions || (candidate.id === state.localPeerId ? state.permissions : undefined);
    for (const [candidateCollection, candidatePermissionKey] of Object.entries(collectionPermissionMap)) {
      if (candidatePermissions?.[candidatePermissionKey]) {
        authorizer.concederCapacidad(`${SHELF_EDGE_NAMESPACE}:${candidateCollection}`, candidate.id as any, 'write');
      }
    }
  }

  if (permissions?.[permissionKey] === true) {
    authorizer.concederCapacidad(`${SHELF_EDGE_NAMESPACE}:${collection}`, peerId as any, 'write');
  }

  return authorizer.verificarCapacidad(`${SHELF_EDGE_NAMESPACE}:${collection}`, peerId as any, 'write');
};

const getStateCollection = (state: AppState, collection: ShelfEdgeCollection) => {
  return ((state[collection] as unknown[]) || []).filter((item): item is { id: string } => {
    return Boolean(item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string');
  });
};

const EdgeMeshWorkflowBridge: React.FC<EdgeMeshWorkflowBridgeProps> = ({ state, dispatch, isLoaded }) => {
  const mesh = useEdgeMesh();
  const [status, setStatus] = useState<EdgeMeshWorkflowStatus>(defaultStatus);
  const dispatchRef = useRef(dispatch);
  const stateRef = useRef(state);
  const remoteSyncTimerRef = useRef<number | null>(null);
  const pendingRemoteCollectionsRef = useRef(
    new Map<ShelfEdgeCollection, { items: unknown[]; deletedIds: Set<string> }>(),
  );

  dispatchRef.current = dispatch;
  stateRef.current = state;

  const sharedDoc = useMemo(() => {
    if (!mesh) return null;
    return mesh.yjsAdapter.doc;
  }, [mesh]);

  const isSharedWithDbSync = Boolean(sharedDoc && sharedDoc === dbSync.doc);

  // Unified Phase B: plain map keys (products, sales, …) matching dbSync — no shelf_ prefix.
  const mapPrefix = '';

  useEffect(() => {
    emitStatus(status);
  }, [status]);

  // Test harness on the shared document
  useEffect(() => {
    if (!isLocalTestRuntime() || !sharedDoc || !mesh) return;

    (window as unknown as { __shelfEdgeMeshForTest?: unknown }).__shelfEdgeMeshForTest = {
      unified: SHELF_EDGE_UNIFIED_DOC,
      sharedWithDbSync: isSharedWithDbSync,
      getState: () => {
        const snapshot = {} as Record<ShelfEdgeCollection, unknown[]>;
        for (const collection of SHELF_EDGE_COLLECTIONS) {
          const key = shelfEdgeMapKey(collection, mapPrefix, true);
          snapshot[collection] = Array.from(sharedDoc.getMap(key).values());
        }
        return snapshot;
      },
      applyRemoteUpdate: (peerId: string, update: number[]) => {
        // Prefer dbSync.applyUpdate so primary-path remote authz runs on the same doc.
        if (isSharedWithDbSync) {
          dbSync.applyUpdate(new Uint8Array(update), peerId);
        } else {
          mesh.yjsAdapter.applyUpdate(new Uint8Array(update), peerId);
        }
      },
      getUpdate: (_collection?: string) => {
        // Full-doc update (collection arg kept for API compat with tests).
        const update = mesh.yjsAdapter.getState?.() || new Uint8Array();
        return Array.from(update);
      },
      /** Encode only a single map for lighter inject tests (optional). */
      getCollectionUpdate: (collection: ShelfEdgeCollection) => {
        const key = shelfEdgeMapKey(collection, mapPrefix, true);
        const yMap = sharedDoc.getMap(key);
        // Fall back to full state — surgical single-map export needs a temp doc.
        void yMap;
        const update = mesh.yjsAdapter.getState?.() || new Uint8Array();
        return Array.from(update);
      },
      remove: (collection: ShelfEdgeCollection, id: string) => {
        const key = shelfEdgeMapKey(collection, mapPrefix, true);
        const yMap = sharedDoc.getMap(key);
        // Use local origin so Security Guard does not treat test harness as a remote peer.
        sharedDoc.transact(() => {
          yMap.delete(id);
        }, 'local');
      },
      upsert: (collection: ShelfEdgeCollection, id: string, item: unknown) => {
        const key = shelfEdgeMapKey(collection, mapPrefix, true);
        const yMap = sharedDoc.getMap(key);
        sharedDoc.transact(() => {
          yMap.set(id, item);
        }, 'local');
      },
    };

    return () => {
      delete (window as unknown as { __shelfEdgeMeshForTest?: unknown }).__shelfEdgeMeshForTest;
    };
  }, [sharedDoc, mesh, isSharedWithDbSync]);

  // Status: read stats from the single document (no AppState → Y mirror)
  useEffect(() => {
    if (!sharedDoc || !isLoaded) {
      setStatus(defaultStatus);
      return;
    }

    const stats = getShelfEdgeStats(sharedDoc, mapPrefix, true);
    const totalItems = Object.values(stats).reduce((total, count) => total + count, 0);

    setStatus((previous) => ({
      enabled: true,
      namespace: SHELF_EDGE_NAMESPACE,
      unifiedDoc: true,
      sharedWithDbSync: isSharedWithDbSync,
      lastLocalSyncAt: previous.lastLocalSyncAt ?? new Date().toISOString(),
      lastRemoteSyncAt: previous.lastRemoteSyncAt,
      lastChangedCollections: previous.lastChangedCollections,
      stats,
      totalItems,
    }));
  }, [sharedDoc, isLoaded, isSharedWithDbSync, state.products, state.clients, state.sales, state.suppliers]);

  // Defense-in-depth security observers on shared maps (complements dbSync.applyUpdate).
  // Does not re-dispatch SYNC_ENTITIES when sharedWithDbSync — dbSync.onObserve already owns that path.
  useEffect(() => {
    if (!sharedDoc || !isLoaded) return;

    const scheduleRemoteApply = (collection: ShelfEdgeCollection, yMap: Y.Map<unknown>, deletedIds: string[]) => {
      // When doc is shared, React state is driven by dbSync.onObserve — avoid double SYNC_ENTITIES.
      if (isSharedWithDbSync) {
        const stats = getShelfEdgeStats(sharedDoc, mapPrefix, true);
        setStatus((previous) => ({
          ...previous,
          enabled: true,
          lastRemoteSyncAt: new Date().toISOString(),
          lastChangedCollections: [collection],
          stats,
          totalItems: Object.values(stats).reduce((t, c) => t + c, 0),
        }));
        return;
      }

      const pending = pendingRemoteCollectionsRef.current.get(collection) || {
        items: [],
        deletedIds: new Set<string>(),
      };

      pending.items = Array.from(yMap.values());
      for (const deletedId of deletedIds) {
        pending.deletedIds.add(deletedId);
      }
      pendingRemoteCollectionsRef.current.set(collection, pending);

      if (remoteSyncTimerRef.current) return;

      remoteSyncTimerRef.current = window.setTimeout(() => {
        remoteSyncTimerRef.current = null;
        const changedCollections = Array.from(pendingRemoteCollectionsRef.current.keys());

        pendingRemoteCollectionsRef.current.forEach((pendingCollection, pendingCollectionName) => {
          dispatchRef.current({
            type: 'SYNC_ENTITIES',
            payload: {
              collection: pendingCollectionName,
              items: pendingCollection.items,
              deletedIds: Array.from(pendingCollection.deletedIds),
            },
          });
        });
        pendingRemoteCollectionsRef.current.clear();

        const stats = getShelfEdgeStats(sharedDoc, mapPrefix, true);
        setStatus((previous) => ({
          ...previous,
          enabled: true,
          lastRemoteSyncAt: new Date().toISOString(),
          lastChangedCollections: changedCollections,
          stats,
          totalItems: Object.values(stats).reduce((total, count) => total + count, 0),
        }));
      }, 0);
    };

    const setupObservers = (collections: readonly ShelfEdgeCollection[]) => {
      return collections.map((collection) => {
        const key = shelfEdgeMapKey(collection, mapPrefix, true);
        const yMap = sharedDoc.getMap(key);
        const observer = (event: Y.YMapEvent<unknown>) => {
          if (event.transaction.origin === SHELF_EDGE_LOCAL_ORIGIN) return;
          if (event.transaction.origin === SHELF_EDGE_SECURITY_ORIGIN) return;
          if (event.transaction.origin === 'p2p-security-revert') return;
          if (event.transaction.origin === 'local') {
            // Local dbSync writes — update status only
            const stats = getShelfEdgeStats(sharedDoc, mapPrefix, true);
            setStatus((previous) => ({
              ...previous,
              enabled: true,
              lastLocalSyncAt: new Date().toISOString(),
              lastChangedCollections: [collection],
              stats,
              totalItems: Object.values(stats).reduce((t, c) => t + c, 0),
            }));
            return;
          }

          if (!(typeof event.transaction.origin === 'string')) {
            scheduleRemoteApply(collection, yMap, getDeletedIdsFromYMapEvent(event));
            return;
          }

          const changedIds = Array.from(event.changes.keys.keys());
          const changedItems = changedIds.map((id) => yMap.get(id)).filter(Boolean);
          const deletedIds = getDeletedIdsFromYMapEvent(event);
          const remotePeerId = event.transaction.origin as string;

          // Phase B shared doc: dbSync.applyUpdate already gates untrusted peers and
          // privilege maps. Bridge must NOT re-revert entity CRDT (products/clients/…)
          // or multi-peer catch-up breaks. Only enforce privilege collections here.
          const privilegeCollections: ShelfEdgeCollection[] = ['teamMembers', 'auditLogs'];
          if (isSharedWithDbSync && !privilegeCollections.includes(collection)) {
            scheduleRemoteApply(collection, yMap, deletedIds);
            return;
          }

          const canApply = canPeerMutateCollection(stateRef.current, remotePeerId, collection, changedItems);

          if (!canApply) {
            const previousItems = new Map(
              getStateCollection(stateRef.current, collection).map((item) => [item.id, item]),
            );
            sharedDoc.transact(() => {
              for (const id of changedIds) {
                const previousItem = previousItems.get(id);
                if (previousItem) {
                  yMap.set(id, previousItem);
                } else {
                  yMap.delete(id);
                }
              }
              for (const id of deletedIds) {
                const previousItem = previousItems.get(id);
                if (previousItem) {
                  yMap.set(id, previousItem);
                }
              }
            }, SHELF_EDGE_SECURITY_ORIGIN);
            return;
          }

          scheduleRemoteApply(collection, yMap, deletedIds);
        };

        yMap.observe(observer);
        return { yMap, observer };
      });
    };

    const observers = setupObservers([...SHELF_EDGE_GLOBAL_COLLECTIONS, ...SHELF_EDGE_BRANCH_COLLECTIONS]);

    return () => {
      if (remoteSyncTimerRef.current) {
        window.clearTimeout(remoteSyncTimerRef.current);
        remoteSyncTimerRef.current = null;
      }
      pendingRemoteCollectionsRef.current.clear();
      for (const { yMap, observer } of observers) {
        yMap.unobserve(observer);
      }
    };
  }, [sharedDoc, isLoaded, isSharedWithDbSync]);

  return null;
};

export default EdgeMeshWorkflowBridge;
