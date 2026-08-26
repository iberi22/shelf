import type { Product } from 'p2p-mesh-core';
import { normalizeProduct } from '../lib/productVariants';
import { type UseReactiveCollectionOptions, useReactiveCollection } from './useReactiveCollection';

/**
 * SHELF-103 — Reactive read-only projection of the products CRDT collection.
 *
 * Subscribes to the shared Yjs doc's `products` map and returns the product
 * list as a live projection. Mutations must go through `dbSync`/the AppContext
 * dispatch (`ADD_PRODUCT`, `UPDATE_PRODUCT`, `DELETE_PRODUCT`, …) — never by
 * setting React state directly. Offline writes applied to the local CRDT
 * reflect instantly through the Yjs observer.
 */
export function useReactiveProducts(options: UseReactiveCollectionOptions<Product> = {}): Product[] {
  return useReactiveCollection<Product>('products', {
    ...options,
    normalize: normalizeProduct,
  });
}
