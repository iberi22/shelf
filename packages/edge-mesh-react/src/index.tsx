import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { EdgeMesh, EdgeMeshConfig } from 'edge-mesh';
import * as Y from 'yjs';

interface EdgeMeshContextType {
  mesh: EdgeMesh | null;
}

const EdgeMeshContext = createContext<EdgeMeshContextType>({ mesh: null });

export const EdgeMeshProvider: React.FC<{ config: EdgeMeshConfig | null; children: React.ReactNode }> = ({ config, children }) => {
  const mesh = useMemo(() => {
    if (!config) return null;
    return new EdgeMesh(config);
  }, [config]);

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

export function useCollection<T>(namespace: string, collectionName: string) {
  const mesh = useEdgeMesh();
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    if (!mesh) return;

    const adapter = mesh.getNamespace(namespace);
    const yMap: Y.Map<T> = adapter.doc.getMap(collectionName);

    const updateItems = () => {
      setItems(Array.from(yMap.values()));
    };

    updateItems();
    yMap.observe(updateItems);

    return () => {
      yMap.unobserve(updateItems);
    };
  }, [mesh, namespace, collectionName]);

  const upsert = (id: string, item: T) => {
    if (!mesh) return;
    const adapter = mesh.getNamespace(namespace);
    const yMap: Y.Map<T> = adapter.doc.getMap(collectionName);
    adapter.doc.transact(() => {
      yMap.set(id, item);
    }, 'local');
  };

  const remove = (id: string) => {
    if (!mesh) return;
    const adapter = mesh.getNamespace(namespace);
    const yMap: Y.Map<T> = adapter.doc.getMap(collectionName);
    adapter.doc.transact(() => {
      yMap.delete(id);
    }, 'local');
  };

  return { items, upsert, remove };
}
