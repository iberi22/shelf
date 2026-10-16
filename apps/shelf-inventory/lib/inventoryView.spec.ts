import type { Product } from 'p2p-mesh-core';
import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  extractCategories,
  getStockStatus,
  parseDateParam,
  selectVisibleProducts,
} from './inventoryView';

describe('inventoryView', () => {
  describe('getStockStatus', () => {
    it('returns "out" for zero quantity', () => {
      expect(getStockStatus({ quantity: 0 } as unknown as Product, 5)).toBe('out');
    });
    it('returns "out" for negative quantity', () => {
      expect(getStockStatus({ quantity: -1 } as unknown as Product, 5)).toBe('out');
    });
    it('returns "low" when quantity is equal to threshold', () => {
      expect(getStockStatus({ quantity: 5 } as unknown as Product, 5)).toBe('low');
    });
    it('returns "low" when quantity is below threshold but > 0', () => {
      expect(getStockStatus({ quantity: 3 } as unknown as Product, 5)).toBe('low');
    });
    it('returns "in-stock" when quantity is above threshold', () => {
      expect(getStockStatus({ quantity: 6 } as unknown as Product, 5)).toBe('in-stock');
    });
  });

  describe('parseDateParam', () => {
    it('parses YYYY-MM-DD correctly', () => {
      const ts = parseDateParam('2026-01-15');
      const date = new Date(ts);
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(15);
    });
  });

  describe('extractCategories', () => {
    it('extracts categories and sorts them', () => {
      const products = [
        { customFields: { category: 'B' } } as unknown as Product,
        { customFields: { category: 'A' } } as unknown as Product,
        { customFields: { category: 'B' } } as unknown as Product,
        {} as unknown as Product,
      ];
      expect(extractCategories(products, undefined)).toEqual(['A', 'B']);
    });
  });

  describe('selectVisibleProducts', () => {
    const p1 = {
      name: 'Apple',
      sku: 'A1',
      quantity: 10,
      price: 5,
      updatedAt: '2026-01-01T12:00:00Z',
      supplierId: 's1',
    } as unknown as Product;
    const p2 = {
      name: 'Banana',
      sku: 'B1',
      quantity: 2,
      price: 10,
      updatedAt: '2026-01-05T12:00:00Z',
      supplierId: 's2',
    } as unknown as Product;
    const p3 = {
      name: 'Cherry',
      sku: 'C1',
      quantity: 0,
      price: 15,
      updatedAt: '2026-01-10T12:00:00Z',
      supplierId: 's1',
    } as unknown as Product;
    const products = [p1, p2, p3];

    it('returns all when no filters', () => {
      const res = selectVisibleProducts(products, '', {}, [], undefined, 5);
      expect(res.length).toBe(3);
    });

    it('filters by search term (name)', () => {
      const res = selectVisibleProducts(products, 'ban', {}, [], undefined, 5);
      expect(res.length).toBe(1);
      expect(res[0].name).toBe('Banana');
    });

    it('filters by stock status (low)', () => {
      const res = selectVisibleProducts(products, '', { status: 'low' }, [], undefined, 5);
      expect(res.length).toBe(1);
      expect(res[0].name).toBe('Banana');
    });

    it('filters by price range', () => {
      const res = selectVisibleProducts(products, '', { minPrice: 6, maxPrice: 12 }, [], undefined, 5);
      expect(res.length).toBe(1);
      expect(res[0].name).toBe('Banana');
    });

    it('filters by supplierId', () => {
      const res = selectVisibleProducts(products, '', { supplierId: 's1' }, [], undefined, 5);
      expect(res.length).toBe(2);
      expect(res.map((p) => p.name)).toEqual(['Apple', 'Cherry']);
    });
  });

  describe('computeTotals', () => {
    it('computes totals for empty list', () => {
      expect(computeTotals([])).toEqual({ totalQuantity: 0, totalValue: 0 });
    });

    it('computes totals correctly', () => {
      const products = [
        { quantity: 2, price: 10 } as unknown as Product,
        { quantity: 3, price: 20 } as unknown as Product,
      ];
      expect(computeTotals(products)).toEqual({ totalQuantity: 5, totalValue: 80 });
    });
  });
});
