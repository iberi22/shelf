import type { Product } from 'p2p-mesh-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BodegaItem, BodegaSnapshot } from './contract';
import { type BodegaReadModel, bodegaProductId, lowStockCount, toReadModel } from './toProducts';

describe('toProducts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseSource = {
    appId: 'fize' as const,
    instanceId: 'inst-1',
    schemaVersion: 1,
    exportedAt: '2026-01-01T10:00:00Z',
  };

  const createValidItem = (overrides?: Partial<BodegaItem>): BodegaItem => ({
    id: 'item-1',
    name: 'Apple',
    quantity: 10,
    minStock: 5,
    cost: 2,
    price: 4,
    ...overrides,
  });

  const createSnapshot = (items: BodegaItem[]): BodegaSnapshot => ({
    format: 'swal-inventory-export/v1',
    source: { ...baseSource },
    currency: 'USD',
    locations: [{ id: 'loc-1', name: 'Main Bodega', type: 'bodega' }],
    items,
    movements: [],
  });

  it('1. bodegaProductId generates a namespaced, collision-free id', () => {
    const id1 = bodegaProductId('fize', 'a1');
    const id2 = bodegaProductId('gara-g', 'a1');
    expect(id1).toBe('ext:fize:a1');
    expect(id2).toBe('ext:gara-g:a1');
    expect(id1).not.toBe(id2);
  });

  it('2. toReadModel fills all required BaseEntity fields properly', () => {
    const item = createValidItem();
    const snapshot = createSnapshot([item]);
    const result = toReadModel(snapshot);

    expect(result.products).toHaveLength(1);
    const product = result.products[0];
    expect(product.id).toBe('ext:fize:item-1');
    expect(product.isActive).toBe(true);
    expect(product.updatedBy).toBe('bodega:fize');
    expect(product.updatedAt).toBe(baseSource.exportedAt);
  });

  it('3. toReadModel sets default price and cost to 0 when missing', () => {
    const item = createValidItem({ price: undefined, cost: undefined } as unknown as BodegaItem);
    const snapshot = createSnapshot([item]);
    const result = toReadModel(snapshot);

    expect(result.products[0].price).toBe(0);
    expect(result.products[0].cost).toBe(0);
  });

  it('4. toReadModel properly flattens unit and minStock into customFields', () => {
    const item = createValidItem({ unit: 'kg', minStock: 20 });
    const snapshot = createSnapshot([item]);
    const result = toReadModel(snapshot);

    expect(result.products[0].customFields?.unit).toBe('kg');
    expect(result.products[0].customFields?.minStock).toBe('20');
  });

  it('5. toReadModel maps locationId to branchId', () => {
    const item = createValidItem({ locationId: 'loc-1' });
    const snapshot = createSnapshot([item]);
    const result = toReadModel(snapshot);

    expect(result.products[0].branchId).toBe('loc-1');
  });

  it('6. toReadModel skips and counts an item without a name', () => {
    const item = createValidItem({ name: '' }); // empty name
    const item2 = createValidItem({ id: 'item-2', name: 'Banana' });
    const snapshot = createSnapshot([item, item2]);
    const result = toReadModel(snapshot);

    expect(result.products).toHaveLength(1);
    expect(result.unmapped).toBe(1);
  });

  it('7. toReadModel skips and counts an item without an id', () => {
    const item = createValidItem({ id: '' });
    const item2 = createValidItem({ id: 'item-2', name: 'Banana' });
    const snapshot = createSnapshot([item, item2]);
    const result = toReadModel(snapshot);

    expect(result.products).toHaveLength(1);
    expect(result.unmapped).toBe(1);
  });

  it('8. lowStockCount reuses getStockStatus to count low stock items', () => {
    const model: BodegaReadModel = {
      products: [
        { quantity: 2 } as unknown as Product, // low stock (<= 5)
        { quantity: 10 } as unknown as Product, // in-stock
        { quantity: 0 } as unknown as Product, // out
        { quantity: 4 } as unknown as Product, // low stock
      ],
      locations: [],
      currency: 'USD',
      source: { appId: 'fize', instanceId: 'inst-1', exportedAt: '' },
      unmapped: 0,
    };

    const count = lowStockCount(model, 5);
    expect(count).toBe(2);
  });

  it('9. toReadModel avoids id collisions between different apps with same item id', () => {
    const item1 = createValidItem({ id: 'item-x' });
    const snap1 = createSnapshot([item1]);
    snap1.source.appId = 'fize';

    const item2 = createValidItem({ id: 'item-x' });
    const snap2 = createSnapshot([item2]);
    snap2.source.appId = 'gara-g';

    const res1 = toReadModel(snap1);
    const res2 = toReadModel(snap2);

    expect(res1.products[0].id).toBe('ext:fize:item-x');
    expect(res2.products[0].id).toBe('ext:gara-g:item-x');
    expect(res1.products[0].id).not.toBe(res2.products[0].id);
  });

  it('10. toReadModel processes a mixed snapshot and maintains pure behavior with no localStorage access', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem');

    const validItem = createValidItem({ id: 'valid-1', name: 'Valid' });
    const invalidNameItem = createValidItem({ id: 'invalid-2', name: '' });
    const validItem2 = createValidItem({ id: 'valid-3', name: 'Valid 2' });

    const snapshot = createSnapshot([validItem, invalidNameItem, validItem2]);
    const result = toReadModel(snapshot);

    expect(result.products).toHaveLength(2);
    expect(result.unmapped).toBe(1);
    expect(result.products[0].id).toBe('ext:fize:valid-1');
    expect(result.products[1].id).toBe('ext:fize:valid-3');

    expect(spy).not.toHaveBeenCalled();
  });
});
