import { createNamespaceAuthorizer, isEdgeMeshRemoteOrigin } from 'edge-mesh';
import { useEdgeMesh } from 'edge-mesh-react';
import type { AppState, PeerInfo, PeerPermissions } from 'p2p-mesh-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import {
  getDeletedIdsFromYMapEvent,
  getShelfEdgeStats,
  SHELF_EDGE_LOCAL_ORIGIN,
  SHELF_EDGE_NAMESPACE,
  type ShelfEdgeCollection,
  SHELF_EDGE_BRANCH_COLLECTIONS,
  SHELF_EDGE_GLOBAL_COLLECTIONS,
  type ShelfEdgeCollectionStats,
  syncAppStateToShelfEdgeDoc,
} from '../lib/edge-mesh-workflow';

type EdgeMeshDispatch = (action: {
  type: 'SYNC_ENTITIES';
  payload: { collection: keyof AppState; items: unknown[]; deletedIds: string[] };
}) => void;

export interface EdgeMeshWorkflowStatus {
  enabled: boolean;
  namespace: string;
  lastLocalSyncAt: string | null;
  lastRemoteSyncAt: string | null;
  lastChangedCollections: ShelfEdgeCollection[];
  stats: ShelfEdgeCollectionStats | null;
  totalItems: number;
}

const defaultStatus: EdgeMeshWorkflowStatus = {
  enabled: false,
  namespace: SHELF_EDGE_NAMESPACE,
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
  const masterPeerId = getMasterPeerId(state);
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
  const authorizer = createNamespaceAuthorizer({ authorityPeerId: masterPeerId || undefined });
  for (const candidate of state.peers) {
    const candidatePermissions =
      candidate.permissions || (candidate.id === state.localPeerId ? state.permissions : undefined);
    for (const [candidateCollection, candidatePermissionKey] of Object.entries(collectionPermissionMap)) {
      if (candidatePermissions?.[candidatePermissionKey]) {
        authorizer.grant({
          subject: candidate.id,
          namespace: `${SHELF_EDGE_NAMESPACE}:${candidateCollection}`,
          action: 'write',
        });
      }
    }
  }

  if (permissions?.[permissionKey] === true) {
    authorizer.grant({
      subject: peerId,
      namespace: `${SHELF_EDGE_NAMESPACE}:${collection}`,
      action: 'write',
    });
  }

  return authorizer.can(peerId, `${SHELF_EDGE_NAMESPACE}:${collection}`, 'write');
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

  const globalAdapter = useMemo(() => {
    if (!mesh) return null;
    return mesh.getNamespace(SHELF_EDGE_NAMESPACE);
  }, [mesh]);

  const branchAdapter = useMemo(() => {
    if (!mesh || !state.activeBranchId) return null;
    return mesh.getNamespace(`${SHELF_EDGE_NAMESPACE}/${state.activeBranchId}`);
  }, [mesh, state.activeBranchId]);

  useEffect(() => {
    emitStatus(status);
  }, [status]);

  useEffect(() => {
    if (!isLocalTestRuntime() || !globalAdapter) return;

    (window as unknown as { __shelfEdgeMeshForTest?: unknown }).__shelfEdgeMeshForTest = {
      getState: () => {
        const globalState = SHELF_EDGE_GLOBAL_COLLECTIONS.reduce(
          (snapshot, collection) => {
            snapshot[collection] = Array.from(globalAdapter.doc.getMap(collection).values());
            return snapshot;
          },
          {} as Record<ShelfEdgeCollection, unknown[]>,
        );
        const branchState = branchAdapter
          ? SHELF_EDGE_BRANCH_COLLECTIONS.reduce(
              (snapshot, collection) => {
                snapshot[collection] = Array.from(branchAdapter.doc.getMap(collection).values());
                return snapshot;
              },
              {} as Record<ShelfEdgeCollection, unknown[]>,
            )
          : {};
        return { ...globalState, ...branchState };
      },
      applyRemoteUpdate: (peerId: string, update: number[], namespace?: string) => {
        const targetAdapter =
          namespace && namespace !== SHELF_EDGE_NAMESPACE ? mesh?.getNamespace(namespace) : globalAdapter;
        targetAdapter?.applyUpdate(new Uint8Array(update), { type: 'remote', peerId });
      },
      getUpdate: (namespace?: string) => {
        const targetAdapter =
          namespace && namespace !== SHELF_EDGE_NAMESPACE ? mesh?.getNamespace(namespace) : globalAdapter;
        return Array.from(targetAdapter?.getUpdate() || []);
      },
      remove: (collection: ShelfEdgeCollection, id: string) => {
        const isBranch = SHELF_EDGE_BRANCH_COLLECTIONS.includes(collection as any);
        const targetAdapter = isBranch ? branchAdapter : globalAdapter;
        if (!targetAdapter) return;
        const yMap = targetAdapter.doc.getMap(collection);
        targetAdapter.doc.transact(() => {
          yMap.delete(id);
        }, 'shelf-edge-e2e');
      },
      upsert: (collection: ShelfEdgeCollection, id: string, item: unknown) => {
        const isBranch = SHELF_EDGE_BRANCH_COLLECTIONS.includes(collection as any);
        const targetAdapter = isBranch ? branchAdapter : globalAdapter;
        if (!targetAdapter) return;
        const yMap = targetAdapter.doc.getMap(collection);
        targetAdapter.doc.transact(() => {
          yMap.set(id, item);
        }, 'shelf-edge-e2e');
      },
    };

    return () => {
      delete (window as unknown as { __shelfEdgeMeshForTest?: unknown }).__shelfEdgeMeshForTest;
    };
  }, [globalAdapter, branchAdapter, mesh]);

  useEffect(() => {
    if (!globalAdapter || !isLoaded) {
      setStatus(defaultStatus);
      return;
    }

    // Sync Global Collections
    const globalResult = syncAppStateToShelfEdgeDoc(globalAdapter.doc, state, SHELF_EDGE_GLOBAL_COLLECTIONS as any);

    // Sync Branch Collections
    let branchResult = {
      changedCollections: [] as ShelfEdgeCollection[],
      stats: {} as ShelfEdgeCollectionStats,
      totalItems: 0,
    };
    if (branchAdapter) {
      branchResult = syncAppStateToShelfEdgeDoc(branchAdapter.doc, state, SHELF_EDGE_BRANCH_COLLECTIONS as any);
    }

    const totalStats = { ...globalResult.stats, ...branchResult.stats };
    const allChanged = [...globalResult.changedCollections, ...branchResult.changedCollections];

    setStatus((previous) => ({
      enabled: true,
      namespace: SHELF_EDGE_NAMESPACE,
      lastLocalSyncAt: allChanged.length > 0 ? new Date().toISOString() : previous.lastLocalSyncAt,
      lastRemoteSyncAt: previous.lastRemoteSyncAt,
      lastChangedCollections: allChanged.length > 0 ? allChanged : previous.lastChangedCollections,
      stats: totalStats,
      totalItems: globalResult.totalItems + branchResult.totalItems,
    }));
  }, [globalAdapter, branchAdapter, isLoaded, state]);

  useEffect(() => {
    if (!globalAdapter || !isLoaded) return;

    const scheduleRemoteApply = (
      collection: ShelfEdgeCollection,
      yMap: Y.Map<unknown>,
      deletedIds: string[],
    ) => {
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

        const globalStats = getShelfEdgeStats(globalAdapter.doc);
        const branchStats = branchAdapter ? getShelfEdgeStats(branchAdapter.doc) : ({} as any);
        const stats = { ...globalStats, ...branchStats };
        setStatus((previous) => ({
          ...previous,
          enabled: true,
          lastRemoteSyncAt: new Date().toISOString(),
          lastChangedCollections: changedCollections,
          stats,
          totalItems: Object.values(stats).reduce((total, count) => (Number(total) || 0) + (Number(count) || 0), 0) as number,
        }));
      }, 0);
    };

    const setupObservers = (collections: readonly ShelfEdgeCollection[], adapter: any) => {
      if (!adapter) return [];
      return collections.map((collection) => {
        const yMap = adapter.doc.getMap(collection);
        const observer = (event: Y.YMapEvent<unknown>) => {
          if (event.transaction.origin === SHELF_EDGE_LOCAL_ORIGIN) return;
          if (event.transaction.origin === SHELF_EDGE_SECURITY_ORIGIN) return;
          if (!isEdgeMeshRemoteOrigin(event.transaction.origin)) {
            scheduleRemoteApply(collection, yMap, getDeletedIdsFromYMapEvent(event));
            return;
          }

          const changedIds = Array.from(event.changes.keys.keys());
          const changedItems = changedIds.map((id) => yMap.get(id)).filter(Boolean);
          const deletedIds = getDeletedIdsFromYMapEvent(event);
          const remotePeerId = event.transaction.origin.peerId;
          const canApply = canPeerMutateCollection(stateRef.current, remotePeerId, collection, changedItems);

          if (!canApply) {
            const previousItems = new Map(getStateCollection(stateRef.current, collection).map((item) => [item.id, item]));
            adapter.doc.transact(() => {
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

    const globalObservers = setupObservers(SHELF_EDGE_GLOBAL_COLLECTIONS, globalAdapter);
    const branchObservers = setupObservers(SHELF_EDGE_BRANCH_COLLECTIONS, branchAdapter);

    return () => {
      if (remoteSyncTimerRef.current) {
        window.clearTimeout(remoteSyncTimerRef.current);
        remoteSyncTimerRef.current = null;
      }
      pendingRemoteCollectionsRef.current.clear();
      for (const { yMap, observer } of [...globalObservers, ...branchObservers]) {
        yMap.unobserve(observer);
      }
    };
  }, [globalAdapter, branchAdapter, isLoaded]);

  return null;
};

export default EdgeMeshWorkflowBridge;
