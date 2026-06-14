import { useEdgeMesh } from 'edge-mesh-react';
import type { AppState } from 'p2p-mesh-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import {
  getDeletedIdsFromYMapEvent,
  getShelfEdgeStats,
  SHELF_EDGE_COLLECTIONS,
  SHELF_EDGE_LOCAL_ORIGIN,
  SHELF_EDGE_NAMESPACE,
  type ShelfEdgeCollection,
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

const emitStatus = (status: EdgeMeshWorkflowStatus) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<EdgeMeshWorkflowStatus>(EDGE_MESH_STATUS_EVENT, { detail: status }));
  (window as unknown as { __shelfEdgeMeshStatus?: EdgeMeshWorkflowStatus }).__shelfEdgeMeshStatus = status;
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

const EdgeMeshWorkflowBridge: React.FC<EdgeMeshWorkflowBridgeProps> = ({ state, dispatch, isLoaded }) => {
  const mesh = useEdgeMesh();
  const [status, setStatus] = useState<EdgeMeshWorkflowStatus>(defaultStatus);
  const dispatchRef = useRef(dispatch);
  const remoteSyncTimerRef = useRef<number | null>(null);
  const pendingRemoteCollectionsRef = useRef(
    new Map<ShelfEdgeCollection, { items: unknown[]; deletedIds: Set<string> }>(),
  );

  dispatchRef.current = dispatch;

  const adapter = useMemo(() => {
    if (!mesh) return null;
    return mesh.getNamespace(SHELF_EDGE_NAMESPACE);
  }, [mesh]);

  useEffect(() => {
    emitStatus(status);
  }, [status]);

  useEffect(() => {
    if (!adapter || !isLoaded) {
      setStatus(defaultStatus);
      return;
    }

    const result = syncAppStateToShelfEdgeDoc(adapter.doc, state);
    setStatus((previous) => ({
      enabled: true,
      namespace: SHELF_EDGE_NAMESPACE,
      lastLocalSyncAt: result.changedCollections.length > 0 ? new Date().toISOString() : previous.lastLocalSyncAt,
      lastRemoteSyncAt: previous.lastRemoteSyncAt,
      lastChangedCollections:
        result.changedCollections.length > 0 ? result.changedCollections : previous.lastChangedCollections,
      stats: result.stats,
      totalItems: result.totalItems,
    }));
  }, [adapter, isLoaded, state]);

  useEffect(() => {
    if (!adapter || !isLoaded) return;

    const scheduleRemoteApply = (collection: ShelfEdgeCollection, yMap: Y.Map<unknown>, deletedIds: string[]) => {
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

        const stats = getShelfEdgeStats(adapter.doc);
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

    const observers = SHELF_EDGE_COLLECTIONS.map((collection) => {
      const yMap = adapter.doc.getMap(collection);
      const observer = (event: Y.YMapEvent<unknown>) => {
        if (event.transaction.origin === SHELF_EDGE_LOCAL_ORIGIN) return;
        scheduleRemoteApply(collection, yMap, getDeletedIdsFromYMapEvent(event));
      };

      yMap.observe(observer);
      return { yMap, observer };
    });

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
  }, [adapter, isLoaded]);

  return null;
};

export default EdgeMeshWorkflowBridge;
