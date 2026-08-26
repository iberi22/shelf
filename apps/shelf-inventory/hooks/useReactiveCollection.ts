import type { AppState } from 'p2p-mesh-core';
import { dbSync } from 'p2p-mesh-core';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/**
 * SHELF-103 — Unidirectional reactive pattern.
 *
 * Collection names that live as bare Y.Map keys on the shared CRDT doc
 * (Phase B unified doc, shared with dbSync).
 */
export type ReactiveCollectionName = Exclude<
  keyof AppState,
  | 'peers'
  | 'localPeerId'
  | 'activeBranch'
  | 'activeBranchId'
  | 'role'
  | 'inventoryConfig'
  | 'permissions'
  | 'isExpelled'
  | 'pendingEdits'
>;

export interface UseReactiveCollectionOptions<T = unknown> {
  /**
   * Yjs document to subscribe to. Defaults to the shared `dbSync.doc`
   * (the single source of truth for the shelf CRDT). Tests inject a fresh
   * `Y.Doc` to unit-test the hook without touching the dbSync singleton.
   */
  doc?: Y.Doc;
  /**
   * Map key to observe. Defaults to `collectionName` (bare Phase B key,
   * shared with dbSync). Legacy namespaces can pass `shelf_products`.
   */
  mapKey?: string;
  /**
   * Optional per-item normalization applied on every snapshot read.
   * Use a stable module-level function reference to avoid re-subscribing
   * on every render.
   */
  normalize?: (item: T) => T;
}

/**
 * Subscribes to a Y.Map collection on the shared Yjs document and returns a
 * read-only projection of its values. This is the reactive bridge that makes
 * React state a pure projection of CRDT state: local mutations applied via
 * `dbSync.upsertEntity` (or any Yjs update, local or remote) reflect
 * synchronously through the Yjs observer — no local `setState` data path.
 */
export function useReactiveCollection<T = Record<string, unknown>>(
  collectionName: ReactiveCollectionName,
  options: UseReactiveCollectionOptions<T> = {},
): T[] {
  const { doc: docOption, mapKey, normalize } = options;
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    const doc = docOption ?? dbSync.doc;
    if (!doc) return;

    const yMap = doc.getMap(mapKey ?? collectionName) as Y.Map<T>;

    const updateItems = () => {
      let next = Array.from(yMap.values()) as T[];
      if (normalize) {
        next = next.map(normalize) as T[];
      }
      setItems(next);
    };

    // Initial snapshot (synchronous CRDT read — offline writes are already
    // reflected at subscription time because they were applied to Yjs first).
    updateItems();

    // Subscribe to Yjs doc changes (local + remote). Yjs observers fire
    // synchronously inside the transaction, so local CRDT writes reflect
    // instantly without waiting for P2P sync.
    yMap.observe(updateItems);

    return () => yMap.unobserve(updateItems);
  }, [docOption, collectionName, mapKey, normalize]);

  return items;
}
