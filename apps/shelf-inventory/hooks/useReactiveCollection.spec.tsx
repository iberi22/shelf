import { act, renderHook } from '@testing-library/react';
import type { Product, Sale } from 'p2p-mesh-core';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { useReactiveCollection } from './useReactiveCollection';
import { useReactiveProducts } from './useReactiveProducts';
import { useReactiveSales } from './useReactiveSales';

/**
 * SHELF-103 unit tests — reactive hooks are tested against a fresh mock Yjs
 * document (dependency-injected via options.doc) so the dbSync singleton and
 * its IndexedDB layer are never touched.
 */
describe('useReactiveCollection (SHELF-103 unidirectional reactive)', () => {
  let doc: Y.Doc;

  beforeEach(() => {
    doc = new Y.Doc();
  });

  it('returns an empty projection for an empty map', () => {
    const { result } = renderHook(() => useReactiveCollection('products', { doc }));
    expect(result.current).toEqual([]);
  });

  it('reflects a local CRDT write instantly without any dispatch setState path', () => {
    const { result } = renderHook(() => useReactiveCollection<{ id: string; name: string }>('products', { doc }));

    // Simulate an offline local mutation applied straight to the Yjs doc
    // (this is what dbSync.upsertEntity does under the hood).
    act(() => {
      doc.getMap('products').set('p1', { id: 'p1', name: 'Offline product' });
    });

    expect(result.current).toEqual([{ id: 'p1', name: 'Offline product' }]);
  });

  it('reflects updates and deletes on the Yjs map', () => {
    const { result } = renderHook(() => useReactiveCollection<{ id: string; name: string }>('products', { doc }));
    const yMap = doc.getMap('products');

    act(() => {
      yMap.set('p1', { id: 'p1', name: 'A' });
      yMap.set('p2', { id: 'p2', name: 'B' });
    });
    expect(result.current).toHaveLength(2);

    act(() => {
      yMap.set('p1', { id: 'p1', name: 'A updated' });
      yMap.delete('p2');
    });
    expect(result.current).toEqual([{ id: 'p1', name: 'A updated' }]);
  });

  it('reflects remote-origin updates (peer sync) on the shared doc', () => {
    const { result } = renderHook(() => useReactiveCollection<{ id: string }>('sales', { doc }));

    act(() => {
      doc.transact(() => {
        doc.getMap('sales').set('s1', { id: 's1', total: 100 });
      }, 'remote-peer-abc');
    });

    expect(result.current).toEqual([{ id: 's1', total: 100 }]);
  });

  it('supports a custom mapKey (legacy namespaced docs)', () => {
    const { result } = renderHook(() =>
      useReactiveCollection<{ id: string }>('products', { doc, mapKey: 'shelf_products' }),
    );

    act(() => {
      doc.getMap('shelf_products').set('p1', { id: 'p1' });
    });

    expect(result.current).toEqual([{ id: 'p1' }]);
  });

  it('stops observing after unmount', () => {
    const { unmount } = renderHook(() => useReactiveCollection('sales', { doc }));
    unmount();

    // Mutating after unmount must not throw or leak observers.
    expect(() => {
      doc.getMap('sales').set('s1', { id: 's1' });
    }).not.toThrow();
  });
});

describe('useReactiveProducts (SHELF-103)', () => {
  let doc: Y.Doc;

  beforeEach(() => {
    doc = new Y.Doc();
  });

  it('projects products from the Yjs map and normalizes them', () => {
    const { result } = renderHook(() => useReactiveProducts({ doc }));

    act(() => {
      doc.getMap('products').set('p1', { id: 'p1', name: 'Tea', price: 12, quantity: 3 } satisfies Partial<Product>);
    });

    const [product] = result.current as Product[];
    expect(product?.id).toBe('p1');
    expect(product?.name).toBe('Tea');
    // normalizeProduct enriches variants/quantity projections
    expect(Array.isArray(product?.variants)).toBe(true);
    expect(product?.quantity).toBe(3);
  });

  it('keeps soft-deleted (isActive:false) records in the projection', () => {
    const { result } = renderHook(() => useReactiveProducts({ doc }));

    act(() => {
      doc.getMap('products').set('p1', { id: 'p1', name: 'Gone', isActive: false } satisfies Partial<Product>);
    });

    expect(result.current).toHaveLength(1);
    expect((result.current[0] as Product).isActive).toBe(false);
  });
});

describe('useReactiveSales (SHELF-103)', () => {
  let doc: Y.Doc;

  beforeEach(() => {
    doc = new Y.Doc();
  });

  it('projects sales from the Yjs map as-is', () => {
    const { result } = renderHook(() => useReactiveSales({ doc }));

    act(() => {
      doc.getMap('sales').set('s1', {
        id: 's1',
        date: '2026-08-26',
        totalPrice: 250,
        items: [],
        profit: 50,
      } satisfies Partial<Sale>);
    });

    expect(result.current).toEqual([{ id: 's1', date: '2026-08-26', totalPrice: 250, items: [], profit: 50 }]);
  });
});
