import type { Sale } from 'p2p-mesh-core';
import { type UseReactiveCollectionOptions, useReactiveCollection } from './useReactiveCollection';

/**
 * SHELF-103 — Reactive read-only projection of the sales CRDT collection.
 *
 * Subscribes to the shared Yjs doc's `sales` map and returns the sale list as
 * a live projection. Mutations must go through `dbSync`/the AppContext
 * dispatch (`ADD_SALE`, `UPDATE_SALE`, `DELETE_SALE`, …) — never by setting
 * React state directly. Offline writes applied to the local CRDT reflect
 * instantly through the Yjs observer.
 */
export function useReactiveSales(options: UseReactiveCollectionOptions<Sale> = {}): Sale[] {
  return useReactiveCollection<Sale>('sales', options);
}
