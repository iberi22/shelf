import type { Product, Sale } from 'p2p-mesh-core';
import { describe, expect, it } from 'vitest';
import {
  type DateRange,
  generateInventoryValuationPDF,
  generateLowStockPDF,
  generateSalesSummaryPDF,
} from './pdfExport';

// ─── Helpers ───────────────────────────────────────────────────

function readBlobText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsText(blob);
  }).then((text) => text.replace(/\\\(/g, '(').replace(/\\\)/g, ')'));
}

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: `p-${overrides.name}`,
    name: 'Product',
    sku: 'SKU-000',
    quantity: 1,
    price: 10,
    cost: 5,
    isActive: true,
    updatedBy: 'test-peer',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSale(overrides: Partial<Sale>): Sale {
  return {
    id: `s-${overrides.clientName}`,
    date: '2026-08-10T10:00:00.000Z',
    items: [{ productId: 'p1', productName: 'Cafe', quantity: 1, price: 10, cost: 5 }],
    totalPrice: 10,
    profit: 5,
    clientName: 'Client',
    isActive: true,
    updatedBy: 'test-peer',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── generateInventoryValuationPDF ─────────────────────────────

describe('generateInventoryValuationPDF', () => {
  const products: Product[] = [
    makeProduct({ name: 'Green Tea', sku: 'TV-002', quantity: 2, price: 8, cost: 3 }),
    makeProduct({ name: 'Cafe Especial', sku: 'CF-001', quantity: 10, price: 25.5, cost: 12 }),
    makeProduct({ name: 'Cookies', sku: 'CK-003', quantity: 100, price: 1.5, cost: 0.5, isActive: false }),
  ];

  it('returns a non-empty PDF Blob', async () => {
    const blob = generateInventoryValuationPDF(products);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);

    const text = await readBlobText(blob);
    expect(text).toContain('Inventory Valuation');
    expect(text).toContain('Product');
    expect(text).toContain('Unit Price');
    expect(text).toContain('Total Value');
  });

  it('includes product names, SKUs and computed total values', async () => {
    const text = await readBlobText(generateInventoryValuationPDF(products));
    // 2 x $8.00 = $16.00, 10 x $25.50 = $255.00
    expect(text).toContain('Green Tea');
    expect(text).toContain('TV-002');
    expect(text).toContain('$16.00');
    expect(text).toContain('$255.00');
    // Grand total: 12 units -> $271.00
    expect(text).toContain('Grand total: $271.00');
  });

  it('excludes inactive products', async () => {
    const text = await readBlobText(generateInventoryValuationPDF(products));
    expect(text).not.toContain('Cookies');
    expect(text).toContain('2 product(s)');
  });

  it('respects a custom title, company and currency symbol', async () => {
    const text = await readBlobText(
      generateInventoryValuationPDF(products, {
        title: 'My Custom Valuation',
        companyName: 'Shelf INC',
        currencySymbol: 'US$',
      }),
    );
    expect(text).toContain('My Custom Valuation');
    expect(text).toContain('Shelf INC');
    expect(text).toContain('US$255.00');
  });

  it('handles an empty product list', async () => {
    const text = await readBlobText(generateInventoryValuationPDF([]));
    expect(text).toContain('0 product(s)');
  });
});

// ─── generateLowStockPDF ───────────────────────────────────────

describe('generateLowStockPDF', () => {
  const products: Product[] = [
    makeProduct({ name: 'Bread', sku: 'BR-001', quantity: 3, price: 2, cost: 1 }),
    makeProduct({ name: 'Milk', sku: 'MK-002', quantity: 1, price: 3, cost: 1.5 }),
    makeProduct({ name: 'Eggs', sku: 'EG-003', quantity: 5, price: 4, cost: 2 }),
    makeProduct({ name: 'Rice', sku: 'RC-004', quantity: 20, price: 6, cost: 3 }),
    makeProduct({ name: 'Frozen Rice', sku: 'FR-005', quantity: 2, price: 7, cost: 4, isActive: false }),
  ];

  it('returns a non-empty PDF Blob', async () => {
    const blob = generateLowStockPDF(products, 5);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);

    const text = await readBlobText(blob);
    expect(text).toContain('Low Stock Report');
    expect(text).toContain('Threshold');
  });

  it('includes only active products at or below the threshold', async () => {
    const text = await readBlobText(generateLowStockPDF(products, 5));
    expect(text).toContain('Milk');
    expect(text).toContain('Bread');
    expect(text).toContain('Eggs');
    expect(text).not.toContain('Rice'); // quantity 20 > threshold
    expect(text).not.toContain('Frozen Rice'); // inactive
    expect(text).toContain('3 product(s) at or below the threshold of 5 units');
  });

  it('sorts most critical products first (lowest quantity)', async () => {
    const text = await readBlobText(generateLowStockPDF(products, 5));
    expect(text.indexOf('Milk')).toBeLessThan(text.indexOf('Bread'));
    expect(text.indexOf('Bread')).toBeLessThan(text.indexOf('Eggs'));
  });

  it('returns an empty report when nothing is below the threshold', async () => {
    const text = await readBlobText(generateLowStockPDF(products, 0));
    expect(text).toContain('0 product(s)');
    expect(text).not.toContain('Milk');
  });
});

// ─── generateSalesSummaryPDF ───────────────────────────────────

describe('generateSalesSummaryPDF', () => {
  const dateRange: DateRange = { start: '2026-08-01', end: '2026-08-31' };
  const sales: Sale[] = [
    makeSale({
      id: 's1',
      clientName: 'Ana Lopez',
      date: '2026-08-01T09:00:00.000Z',
      items: [{ productId: 'p1', productName: 'Cafe', quantity: 2, price: 25.5, cost: 12 }],
      totalPrice: 51,
      profit: 27,
    }),
    makeSale({
      id: 's2',
      clientName: 'Luis Gomez',
      date: '2026-08-31T23:30:00.000Z', // last day boundary must be included
      items: [{ productId: 'p2', productName: 'Green Tea', quantity: 4, price: 5, cost: 2 }],
      totalPrice: 20,
      profit: 12,
    }),
    makeSale({
      id: 's3',
      clientName: 'Old Client',
      date: '2026-07-15T12:00:00.000Z',
      totalPrice: 999,
      profit: 500,
    }),
  ];

  it('returns a non-empty PDF Blob', async () => {
    const blob = generateSalesSummaryPDF(sales, dateRange);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);

    const text = await readBlobText(blob);
    expect(text).toContain('Sales Summary');
    expect(text).toContain('Client');
    expect(text).toContain('Profit');
  });

  it('includes sales inside the inclusive date range and skips the rest', async () => {
    const text = await readBlobText(generateSalesSummaryPDF(sales, dateRange));
    expect(text).toContain('Ana Lopez');
    expect(text).toContain('Luis Gomez');
    expect(text).not.toContain('Old Client');
  });

  it('computes totals over the filtered sales', async () => {
    const text = await readBlobText(generateSalesSummaryPDF(sales, dateRange));
    expect(text).toContain('2 sale(s)');
    expect(text).toContain('Revenue: $71.00'); // 51 + 20
    expect(text).toContain('Profit: $39.00'); // 27 + 12
  });

  it('filters by an arbitrary date range', async () => {
    const text = await readBlobText(generateSalesSummaryPDF(sales, { start: '2026-08-01', end: '2026-08-15' }));
    expect(text).toContain('Ana Lopez');
    expect(text).not.toContain('Luis Gomez');
  });

  it('handles a range with no sales', async () => {
    const text = await readBlobText(generateSalesSummaryPDF(sales, { start: '2025-01-01', end: '2025-01-31' }));
    expect(text).toContain('0 sale(s)');
  });
});
