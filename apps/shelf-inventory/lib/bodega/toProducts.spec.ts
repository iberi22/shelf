import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BodegaItem, BodegaSnapshot } from './contract';
import { bodegaProductId, lowStockCount, toReadModel } from './toProducts';

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

  it('8. lowStockCount reuses getStockStatus to count low stock items', async () => {
    const items = [
      createValidItem({ id: 'i1', quantity: 2 }), // low stock
      createValidItem({ id: 'i2', quantity: 10 }), // in-stock
      createValidItem({ id: 'i3', quantity: 0 }), // out
      createValidItem({ id: 'i4', quantity: 4 }), // low stock
    ];
    const snapshot = createSnapshot(items);
    const result = toReadModel(snapshot);

    const count = lowStockCount(result, 5);
    expect(count).toBe(2);

    // Ensure it matches array filter equivalent logic
    const { getStockStatus } = await import('../inventoryView');
    const manualCount = result.products.filter((p) => getStockStatus(p, 5) === 'low').length;
    expect(count).toBe(manualCount);

    // General structural assertions missing in previous tests
    expect(result.currency).toBe('USD');
    expect(result.source.instanceId).toBe('inst-1');
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].id).toBe('loc-1');
    expect(result.products[0].quantity).toBe(2);
    expect(result.products[1].quantity).toBe(10);
    expect(result.products[2].quantity).toBe(0);
    expect(result.products[3].quantity).toBe(4);
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
    const spyGet = vi.spyOn(Storage.prototype, 'getItem');
    const spySet = vi.spyOn(Storage.prototype, 'setItem');
    const spyRemove = vi.spyOn(Storage.prototype, 'removeItem');

    const validItem = createValidItem({ id: 'valid-1', name: 'Valid' });
    const invalidNameItem = createValidItem({ id: 'invalid-2', name: '   ' });
    const validItem2 = createValidItem({ id: 'valid-3', name: 'Valid 2' });

    const snapshot = createSnapshot([validItem, invalidNameItem, validItem2]);
    const before = structuredClone(snapshot);
    // Freeze every level to ensure it is not mutated
    Object.freeze(snapshot);
    Object.freeze(snapshot.source);
    Object.freeze(snapshot.locations);
    for (const location of snapshot.locations) {
      Object.freeze(location);
    }
    Object.freeze(snapshot.items);
    for (const item of snapshot.items) {
      Object.freeze(item);
    }

    const result = toReadModel(snapshot);

    expect(result.products).toHaveLength(2);
    expect(result.unmapped).toBe(1);
    expect(result.products[0].id).toBe('ext:fize:valid-1');
    expect(result.products[1].id).toBe('ext:fize:valid-3');

    expect(spyGet).not.toHaveBeenCalled();
    expect(spySet).not.toHaveBeenCalled();
    expect(spyRemove).not.toHaveBeenCalled();
    expect(snapshot).toEqual(before);
  });

  it('11. toReadModel ignores non-string sku and unit, and converts object customFields to strings safely', () => {
    const item = createValidItem({
      sku: 42 as unknown as string,
      unit: { value: 'kg' } as unknown as string,
      minStock: undefined,
      customFields: 'abc' as unknown as Record<string, string>,
    });
    const item2 = createValidItem({
      id: 'item-2',
      customFields: { num: 123, obj: { a: 1 } } as unknown as Record<string, string>,
    });

    const snapshot = createSnapshot([item, item2]);
    const result = toReadModel(snapshot);

    expect(result.products[0].sku).toBeUndefined();
    expect(result.products[0].customFields?.unit).toBeUndefined();
    // 'abc' is string, not an object, so it should be ignored for customFields mapping
    expect(result.products[0].customFields).toBeUndefined();

    // The second item should have stringified values from the object
    expect(result.products[1].customFields?.num).toBe('123');
    expect(result.products[1].customFields?.obj).toBe('[object Object]');
  });

  it('12. toReadModel increments unmapped for duplicate item IDs in the same snapshot', () => {
    const item1 = createValidItem({ id: 'dup-1', name: 'A' });
    const item2 = createValidItem({ id: 'dup-1', name: 'B' });

    const snapshot = createSnapshot([item1, item2]);
    const result = toReadModel(snapshot);

    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('A');
    expect(result.unmapped).toBe(1);
  });

  it('13. toReadModel passes through sku, price, cost, trims name, and resolves branchName', () => {
    const item = createValidItem({
      id: 'i1',
      sku: 'S-1',
      price: 4,
      cost: 2,
      locationId: 'loc-1',
      name: '  Pad  ',
      minStock: undefined,
      customFields: ['z'] as unknown as Record<string, string>,
    });

    const snapshot = createSnapshot([item]);
    const result = toReadModel(snapshot);

    expect(result.products).toHaveLength(1);
    const p = result.products[0];

    expect(p.sku).toBe('S-1');
    expect(p.price).toBe(4);
    expect(p.cost).toBe(2);
    expect(p.branchName).toBe('Main Bodega');
    expect(p.name).toBe('Pad');
    expect(p.customFields).toBeUndefined(); // Array ignored
  });
});
