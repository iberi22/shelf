import { describe, expect, expectTypeOf, it } from 'vitest';
import * as index from '../index';
import type { InventoryConfig, Product, ProductVariant, PurchaseOrder, Sale } from './types';

describe('Domain Types', () => {
  it('Product should have required keys', () => {
    expectTypeOf<Product>().toHaveProperty('id');
    expectTypeOf<Product>().toHaveProperty('name');
    expectTypeOf<Product>().toHaveProperty('quantity');
    expectTypeOf<Product>().toHaveProperty('price');
    expectTypeOf<Product>().toHaveProperty('cost');
  });

  it('ProductVariant should have required keys', () => {
    expectTypeOf<ProductVariant>().toHaveProperty('id');
    expectTypeOf<ProductVariant>().toHaveProperty('quantity');
    expectTypeOf<ProductVariant>().toHaveProperty('price');
    expectTypeOf<ProductVariant>().toHaveProperty('cost');
    expectTypeOf<ProductVariant>().toHaveProperty('attributes');
  });

  it('Sale should have required keys', () => {
    expectTypeOf<Sale>().toHaveProperty('id');
    expectTypeOf<Sale>().toHaveProperty('date');
    expectTypeOf<Sale>().toHaveProperty('items');
    expectTypeOf<Sale>().toHaveProperty('totalPrice');
    expectTypeOf<Sale>().toHaveProperty('profit');
  });

  it('PurchaseOrder should have required keys', () => {
    expectTypeOf<PurchaseOrder>().toHaveProperty('id');
    expectTypeOf<PurchaseOrder>().toHaveProperty('supplierId');
    expectTypeOf<PurchaseOrder>().toHaveProperty('supplierName');
    expectTypeOf<PurchaseOrder>().toHaveProperty('items');
    expectTypeOf<PurchaseOrder>().toHaveProperty('status');
    expectTypeOf<PurchaseOrder>().toHaveProperty('orderDate');
  });

  it('InventoryConfig should have required keys', () => {
    expectTypeOf<InventoryConfig>().toHaveProperty('variantAttributes');
    expectTypeOf<InventoryConfig>().toHaveProperty('fields');
    expectTypeOf<InventoryConfig>().toHaveProperty('measureOptions');
    expectTypeOf<InventoryConfig>().toHaveProperty('colorOptions');
    expectTypeOf<InventoryConfig>().toHaveProperty('materialOptions');
    expectTypeOf<InventoryConfig>().toHaveProperty('autoApplyProductUpdates');
    expectTypeOf<InventoryConfig>().toHaveProperty('productHistoryLimit');
    expectTypeOf<InventoryConfig>().toHaveProperty('useEdgeMeshSync');
  });

  it('exports logic modules functions (type and runtime)', () => {
    // productVariants
    expectTypeOf(index.createDefaultVariant).toBeFunction();
    expect(typeof index.createDefaultVariant).toBe('function');
    // inventoryConfig
    expectTypeOf(index.normalizeInventoryConfig).toBeFunction();
    expect(typeof index.normalizeInventoryConfig).toBe('function');
    // csvProductImport
    expectTypeOf(index.parseProductCsv).toBeFunction();
    expect(typeof index.parseProductCsv).toBe('function');
    // businessConflicts
    expectTypeOf(index.detectBusinessConflicts).toBeFunction();
    expect(typeof index.detectBusinessConflicts).toBe('function');
    // id
    expectTypeOf(index.generateId).toBeFunction();
    expect(typeof index.generateId).toBe('function');
  });
});
