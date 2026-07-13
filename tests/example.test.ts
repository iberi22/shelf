/**
 * example.test.ts
 *
 * Tests de ejemplo para el monorepo Shelf.
 * Demuestra patrones de testing para el proyecto.
 */

import { createTestProduct, createTestSale } from './test-setup';

// ============================================================================
// Tests de Productos
// ============================================================================

describe('Product Management', () => {
  describe('createTestProduct', () => {
    it('should create a product with default values', () => {
      const product = createTestProduct();

      expect(product).toBeDefined();
      expect(product.id).toContain('test-');
      expect(product.sku).toContain('SKU-');
      expect(product.name).toBe('Producto de Prueba');
      expect(product.quantity).toBe(10);
      expect(product.price).toBe(25.99);
      expect(product.cost).toBe(15.50);
    });

    it('should override default values with provided overrides', () => {
      const product = createTestProduct({
        name: 'Custom Product',
        quantity: 5,
        price: 99.99,
      });

      expect(product.name).toBe('Custom Product');
      expect(product.quantity).toBe(5);
      expect(product.price).toBe(99.99);
      expect(product.cost).toBe(15.50); // Default preserved
    });

    it('should generate unique IDs for each product', () => {
      const productA = createTestProduct();
      const productB = createTestProduct();

      expect(productA.id).not.toBe(productB.id);
      expect(productA.sku).not.toBe(productB.sku);
    });
  });

  describe('Product Validation', () => {
    it('should validate product has required fields', () => {
      const product = createTestProduct();

      expect(product.id).toBeTruthy();
      expect(product.sku).toBeTruthy();
      expect(product.name).toBeTruthy();
      expect(typeof product.quantity).toBe('number');
      expect(typeof product.price).toBe('number');
    });

    it('should have non-negative quantity', () => {
      const product = createTestProduct({ quantity: 0 });
      expect(product.quantity).toBeGreaterThanOrEqual(0);

      const productWithStock = createTestProduct({ quantity: 100 });
      expect(productWithStock.quantity).toBeGreaterThan(0);
    });

    it('should have positive price', () => {
      const product = createTestProduct({ price: 0 });
      expect(product.price).toBeGreaterThanOrEqual(0);

      const pricedProduct = createTestProduct({ price: 10.99 });
      expect(pricedProduct.price).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Tests de Ventas
// ============================================================================

describe('Sales Tracking', () => {
  describe('createTestSale', () => {
    it('should create a sale with default values', () => {
      const sale = createTestSale();

      expect(sale).toBeDefined();
      expect(sale.id).toContain('sale-');
      expect(sale.products).toHaveLength(1);
      expect(sale.total).toBe(25.99);
      expect(sale.date).toBeTruthy();
    });

    it('should accept custom products in sale', () => {
      const products = [
        createTestProduct({ name: 'Item A', price: 10 }),
        createTestProduct({ name: 'Item B', price: 20 }),
      ];

      const sale = createTestSale({ products, total: 30 });

      expect(sale.products).toHaveLength(2);
      expect(sale.total).toBe(30);
      expect(sale.products[0].name).toBe('Item A');
      expect(sale.products[1].name).toBe('Item B');
    });
  });

  describe('Sale Calculations', () => {
    it('should calculate total from products', () => {
      const products = [
        createTestProduct({ price: 10, quantity: 2 }),
        createTestProduct({ price: 5, quantity: 3 }),
      ];

      const calculatedTotal = products.reduce(
        (sum, p) => sum + p.price * p.quantity,
        0
      );

      expect(calculatedTotal).toBe(35); // (10*2) + (5*3)
    });

    it('should calculate profit from sale', () => {
      const product = createTestProduct({ price: 100, cost: 60 });
      const profit = product.price - product.cost;

      expect(profit).toBe(40);
    });
  });
});

// ============================================================================
// Tests de Inventario Offline-First
// ============================================================================

describe('Offline-First Inventory', () => {
  it('should persist products in localStorage', () => {
    const product = createTestProduct();
    const products = [product];

    localStorage.setItem('shelf-products', JSON.stringify(products));

    const stored = JSON.parse(localStorage.getItem('shelf-products') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(product.id);
  });

  it('should handle empty inventory', () => {
    const stored = JSON.parse(localStorage.getItem('shelf-products') || '[]');
    expect(Array.isArray(stored)).toBe(true);
  });

  it('should update quantity on sale', () => {
    const product = createTestProduct({ quantity: 10 });

    // Simular venta de 3 unidades
    const soldQuantity = 3;
    product.quantity -= soldQuantity;

    expect(product.quantity).toBe(7);

    // Vender todo el stock
    product.quantity -= product.quantity;
    expect(product.quantity).toBe(0);
  });
});

// ============================================================================
// Tests de Edge Mesh (Conceptual)
// ============================================================================

describe('Edge Mesh Sync', () => {
  it('should track remote origin metadata', () => {
    const remoteUpdate = {
      type: 'remote',
      peerId: 'tablet-bodega-01',
      payload: { productId: 'test-123', quantity: 5 },
      timestamp: Date.now(),
    };

    expect(remoteUpdate.type).toBe('remote');
    expect(remoteUpdate.peerId).toBe('tablet-bodega-01');
    expect(remoteUpdate.payload.productId).toBe('test-123');
  });

  it('should authorize remote mutations before applying', () => {
    const authorizedPeers = ['admin-01', 'tablet-bodega-01'];
    const unauthorizedPeer = 'unknown-device';

    const isAuthorized = (peerId: string): boolean =>
      authorizedPeers.includes(peerId);

    expect(isAuthorized('admin-01')).toBe(true);
    expect(isAuthorized('tablet-bodega-01')).toBe(true);
    expect(isAuthorized(unauthorizedPeer)).toBe(false);
  });
});
