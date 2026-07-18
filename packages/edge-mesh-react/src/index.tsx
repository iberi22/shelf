import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { EdgeMesh, EdgeMeshConfig } from 'edge-mesh';
import type * as Y from 'yjs';

interface EdgeMeshContextType {
  mesh: EdgeMesh | null;
}

const EdgeMeshContext = createContext<EdgeMeshContextType>({ mesh: null });

/**
 * Stable key for config identity. yDoc is compared by reference.
 */
function configIdentity(config: EdgeMeshConfig | null): string {
  if (!config) return 'null';
  const docRef =
    config.yDoc && typeof config.yDoc === 'object'
      ? `doc:${(config.yDoc as { guid?: string }).guid ?? 'shared'}`
      : 'doc:owned';
  return `${config.nodoId}|${config.peerId ?? ''}|${docRef}|${config.storageBackend ?? ''}`;
}

export const EdgeMeshProvider: React.FC<{
  config: EdgeMeshConfig | null;
  children: React.ReactNode;
}> = ({ config, children }) => {
  const identity = configIdentity(config);

  const mesh = useMemo(() => {
    if (!config) return null;
    const m = new EdgeMesh(config);
    m.iniciar().catch(console.error);
    return m;
    // identity captures yDoc reference + nodoId without deep-compare noise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  useEffect(() => {
    return () => {
      if (mesh) {
        // Safe for shared docs: YjsAdapter.destroy() will not call doc.destroy()
        mesh.detener().catch(console.error);
      }
    };
  }, [mesh]);

  return (
    <EdgeMeshContext.Provider value={{ mesh }}>
      {children}
    </EdgeMeshContext.Provider>
  );
};

export const useEdgeMesh = () => {
  const context = useContext(EdgeMeshContext);
  if (!context) {
    throw new Error('useEdgeMesh must be used within an EdgeMeshProvider');
  }
  return context.mesh;
};

/**
 * Observe a Y.Map collection on the mesh document.
 * @param namespace When empty, uses bare collection name (Phase B unified / dbSync maps).
 *                 When set, uses `${namespace}_${collectionName}` (legacy).
 */
export function useCollection<T>(namespace: string, collectionName: string) {
  const mesh = useEdgeMesh();
  const [items, setItems] = useState<T[]>([]);

  const mapKey = namespace ? `${namespace}_${collectionName}` : collectionName;

  useEffect(() => {
    if (!mesh) return;

    const yMap = mesh.yjsAdapter.doc.getMap(mapKey) as Y.Map<T>;

    const updateItems = () => {
      setItems(Array.from(yMap.values()));
    };

    updateItems();
    yMap.observe(updateItems);

    return () => {
      yMap.unobserve(updateItems);
    };
  }, [mesh, mapKey]);

  const upsert = (id: string, item: T) => {
    if (!mesh) return;
    const yMap = mesh.yjsAdapter.doc.getMap(mapKey) as Y.Map<T>;
    mesh.yjsAdapter.doc.transact(() => {
      yMap.set(id, item);
    }, 'local');
  };

  const remove = (id: string) => {
    if (!mesh) return;
    const yMap = mesh.yjsAdapter.doc.getMap(mapKey) as Y.Map<T>;
    mesh.yjsAdapter.doc.transact(() => {
      yMap.delete(id);
    }, 'local');
  };

  return { items, upsert, remove };
}
