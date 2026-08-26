/**
 * Unit tests for Shopify / WooCommerce webhook handlers (lib/webhookHandlers.ts).
 *
 * Covers the five required behaviors:
 *  1. Shopify order → Shelf sale mapping + inventory CRDT updates
 *  2. WooCommerce order → Shelf sale mapping (CRDT updates too)
 *  3. Shopify product sync (create/update)
 *  4. HMAC-SHA256 signature verification for both platforms
 *  5. Idempotency via webhook ID dedup
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { Product, Sale, SaleItem } from '../../../packages/p2p-mesh-core/src/types';
import type { ShopifyOrder, ShopifyProduct, WooOrder, WooProduct } from '../api/webhooks/parsers';
import {
  applyProductToCrdt,
  handleShopifyOrder,
  handleShopifyProduct,
  handleWooCommerceOrder,
  handleWooCommerceProduct,
  InMemoryWebhookDedup,
  SHOPIFY_WEBHOOK_PEER_ID,
  verifyShopifyHmac,
  verifyWooCommerceHmac,
  WOOCOMMERCE_WEBHOOK_PEER_ID,
  webhookDedupKey,
} from './webhookHandlers';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Compute a plausible platform signature: base64 HMAC-SHA256 over the raw body. */
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'shopify-12345',
    name: 'Test Product',
    sku: 'SKU-001',
    quantity: 10,
    price: 29.99,
    cost: 0,
    imageUrl: '',
    isActive: true,
    updatedBy: 'test-peer',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function seedProducts(doc: Y.Doc, ...products: Product[]): void {
  for (const product of products) applyProductToCrdt(doc, product);
}

function shopifyOrder(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: 9999,
    total_price: '59.98',
    subtotal_price: '54.98',
    total_tax: '5.00',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    currency: 'USD',
    line_items: [
      {
        id: 1,
        variant_id: 100,
        title: 'Test Product',
        quantity: 2,
        sku: 'SKU-001',
        variant_title: 'Blue',
        vendor: 'Vendor',
        price: '29.99',
        product_id: 12345,
      },
    ],
    customer: {
      id: 500,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
    },
    ...overrides,
  };
}

function shopifyProduct(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 12345,
    title: 'Test Product',
    body_html: '<p>Desc</p>',
    vendor: 'Vendor',
    product_type: 'Widget',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    status: 'active',
    tags: 'a,b',
    variants: [
      {
        id: 100,
        product_id: 12345,
        title: 'Blue',
        price: '29.99',
        sku: 'SKU-001',
        inventory_quantity: 10,
        option1: 'Blue',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    images: [],
    image: { src: 'https://example.com/img.jpg' },
    ...overrides,
  };
}

function wooOrder(overrides: Partial<WooOrder> = {}): WooOrder {
  return {
    id: 777,
    total: '89.97',
    date_created: '2026-03-20T14:30:00Z',
    line_items: [
      {
        id: 1,
        name: 'Product A',
        product_id: 100,
        variation_id: 200,
        quantity: 3,
        sku: 'SKU-A',
        price: 29.99,
      },
    ],
    billing: {
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
    },
    ...overrides,
  };
}

function wooProduct(overrides: Partial<WooProduct> = {}): WooProduct {
  return {
    id: 555,
    name: 'Woo Product',
    sku: 'WOO-SKU-1',
    price: '45.50',
    stock_quantity: 20,
    status: 'publish',
    images: [{ src: 'https://woo.com/pic.png' }],
    variations: [1001, 1002],
    ...overrides,
  };
}

function readProduct(doc: Y.Doc, id: string): Product | undefined {
  return doc.getMap('products').get(id) as Product | undefined;
}

function readSale(doc: Y.Doc, id: string): Sale | undefined {
  return doc.getMap('sales').get(id) as Sale | undefined;
}

// ── HMAC signature verification ────────────────────────────────────────────

describe('verifyShopifyHmac', () => {
  const secret = 'test-shopify-secret-123';

  it('accepts a valid signature over the raw body', async () => {
    const body = JSON.stringify(shopifyOrder());
    await expect(verifyShopifyHmac(body, await sign(body, secret), secret)).resolves.toBe(true);
  });

  it('rejects a signature computed over a different body', async () => {
    const body = JSON.stringify(shopifyOrder());
    await expect(verifyShopifyHmac(body, await sign('{"tampered":true}', secret), secret)).resolves.toBe(false);
  });

  it('rejects a signature computed with a different secret', async () => {
    const body = JSON.stringify(shopifyOrder());
    await expect(verifyShopifyHmac(body, await sign(body, 'wrong-secret'), secret)).resolves.toBe(false);
  });

  it('rejects a missing signature header', async () => {
    const body = JSON.stringify(shopifyOrder());
    await expect(verifyShopifyHmac(body, null, secret)).resolves.toBe(false);
    await expect(verifyShopifyHmac(body, undefined, secret)).resolves.toBe(false);
    await expect(verifyShopifyHmac(body, '', secret)).resolves.toBe(false);
  });

  it('rejects malformed base64 signatures without throwing', async () => {
    const body = JSON.stringify(shopifyOrder());
    await expect(verifyShopifyHmac(body, 'not-base64!!!', secret)).resolves.toBe(false);
  });
});

describe('verifyWooCommerceHmac', () => {
  const secret = 'test-woo-secret-456';

  it('accepts a valid signature over the raw body', async () => {
    const body = JSON.stringify(wooOrder());
    await expect(verifyWooCommerceHmac(body, await sign(body, secret), secret)).resolves.toBe(true);
  });

  it('rejects a tampered body and wrong secrets', async () => {
    const body = JSON.stringify(wooOrder());
    await expect(verifyWooCommerceHmac(body, await sign('["evil"]', secret), secret)).resolves.toBe(false);
    await expect(verifyWooCommerceHmac(body, await sign(body, 'nope'), secret)).resolves.toBe(false);
    await expect(verifyWooCommerceHmac(body, null, secret)).resolves.toBe(false);
  });
});

// ── Dedup keys & in-memory store ───────────────────────────────────────────

describe('webhookDedupKey', () => {
  it('builds stable platform:entity:id keys', () => {
    expect(webhookDedupKey('shopify', 'order', 9999)).toBe('shopify:order:9999');
    expect(webhookDedupKey('woocommerce', 'product', '555')).toBe('woocommerce:product:555');
  });
});

describe('InMemoryWebhookDedup', () => {
  it('tracks seen keys', () => {
    const store = new InMemoryWebhookDedup();
    expect(store.has('shopify:order:1')).toBe(false);
    store.add('shopify:order:1');
    expect(store.has('shopify:order:1')).toBe(true);
    expect(store.has('shopify:order:2')).toBe(false);
  });
});

// ── Shopify order handling ─────────────────────────────────────────────────

describe('handleShopifyOrder', () => {
  it('maps a Shopify order payload to a Shelf sale', async () => {
    const result = await handleShopifyOrder(shopifyOrder());

    expect(result.status).toBe('created');
    expect(result.dedupKey).toBe('shopify:order:9999');
    expect(result.sale).toMatchObject({
      id: 'shopify-order-9999',
      date: '2026-01-15T10:00:00Z',
      totalPrice: 59.98,
      profit: 59.98,
      clientId: 'shopify-customer-500',
      clientName: 'John Doe',
      isActive: true,
      updatedBy: SHOPIFY_WEBHOOK_PEER_ID,
    });
    expect(result.sale.items).toEqual<SaleItem[]>([
      {
        productId: 'shopify-12345',
        productVariantId: 'shopify-variant-100',
        productName: 'Test Product',
        quantity: 2,
        price: 29.99,
        cost: 0,
      },
    ]);
  });

  it('writes the sale and decrements product stock in the CRDT doc', async () => {
    const doc = new Y.Doc();
    seedProducts(doc, makeProduct());

    const result = await handleShopifyOrder(shopifyOrder(), { doc });

    expect(result.status).toBe('created');
    expect(readSale(doc, 'shopify-order-9999')).toMatchObject({ id: 'shopify-order-9999', totalPrice: 59.98 });
    expect(readProduct(doc, 'shopify-12345')?.quantity).toBe(8);
    expect(result.inventoryAdjustments).toEqual([
      {
        productId: 'shopify-12345',
        delta: 2,
        quantityBefore: 10,
        quantityAfter: 8,
      },
    ]);
  });

  it('decrements the matching variant stock when the item references one', async () => {
    const doc = new Y.Doc();
    seedProducts(
      doc,
      makeProduct({
        variants: [
          {
            id: 'shopify-variant-100',
            label: 'Blue',
            sku: 'SKU-001',
            quantity: 5,
            price: 29.99,
            cost: 0,
            attributes: { option1: 'Blue' },
            isActive: true,
            updatedBy: 'test-peer',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );

    const result = await handleShopifyOrder(shopifyOrder(), { doc });

    expect(result.inventoryAdjustments).toEqual([
      {
        productId: 'shopify-12345',
        productVariantId: 'shopify-variant-100',
        delta: 2,
        quantityBefore: 5,
        quantityAfter: 3,
      },
    ]);
    const product = readProduct(doc, 'shopify-12345');
    expect(product?.variants?.[0]?.quantity).toBe(3);
    expect(product?.quantity).toBe(10); // product-level stock untouched when variant is adjusted
  });

  it('falls back to product stock when the variant id does not match', async () => {
    const doc = new Y.Doc();
    seedProducts(
      doc,
      makeProduct({
        variants: [
          {
            id: 'shopify-variant-999',
            label: 'Other',
            sku: 'SKU-X',
            quantity: 5,
            price: 19.99,
            cost: 0,
            attributes: {},
            isActive: true,
            updatedBy: 'test-peer',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );

    const result = await handleShopifyOrder(shopifyOrder(), { doc });

    expect(readProduct(doc, 'shopify-12345')?.quantity).toBe(8);
    expect(result.inventoryAdjustments[0]?.productVariantId).toBeUndefined();
  });

  it('clamps the decrement at zero and never mints negative stock', async () => {
    const doc = new Y.Doc();
    seedProducts(doc, makeProduct({ quantity: 1 }));

    const result = await handleShopifyOrder(shopifyOrder(), { doc });

    expect(readProduct(doc, 'shopify-12345')?.quantity).toBe(0);
    expect(result.inventoryAdjustments[0]).toMatchObject({ delta: 1, quantityBefore: 1, quantityAfter: 0 });
  });

  it('records the sale and skips products not synced into the doc', async () => {
    const doc = new Y.Doc();
    const result = await handleShopifyOrder(shopifyOrder(), { doc });

    expect(result.status).toBe('created');
    expect(readSale(doc, 'shopify-order-9999')).toBeDefined();
    expect(result.inventoryAdjustments).toEqual([]);
  });

  it('is idempotent: duplicate webhook IDs are skipped via the dedup store', async () => {
    const doc = new Y.Doc();
    seedProducts(doc, makeProduct());
    const dedup = new InMemoryWebhookDedup();

    const first = await handleShopifyOrder(shopifyOrder(), { doc, dedup });
    const second = await handleShopifyOrder(shopifyOrder(), { doc, dedup });

    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(second.inventoryAdjustments).toEqual([]);
    expect(readProduct(doc, 'shopify-12345')?.quantity).toBe(8); // decremented exactly once
    expect(second.sale.id).toBe('shopify-order-9999');
  });

  it('applies every delivery when no dedup store is configured', async () => {
    const doc = new Y.Doc();
    seedProducts(doc, makeProduct());

    await handleShopifyOrder(shopifyOrder(), { doc });
    await handleShopifyOrder(shopifyOrder(), { doc });

    expect(readProduct(doc, 'shopify-12345')?.quantity).toBe(6);
  });

  it('returns a Yjs update blob that round-trips into a fresh doc', async () => {
    const doc = new Y.Doc();
    seedProducts(doc, makeProduct());

    const result = await handleShopifyOrder(shopifyOrder(), { doc });

    expect(result.update).toBeInstanceOf(Uint8Array);
    const replica = new Y.Doc();
    Y.applyUpdate(replica, result.update);
    expect(readSale(replica, 'shopify-order-9999')).toMatchObject({ id: 'shopify-order-9999' });
    expect(readProduct(replica, 'shopify-12345')?.quantity).toBe(8);
  });
});

// ── WooCommerce order handling ─────────────────────────────────────────────

describe('handleWooCommerceOrder', () => {
  it('maps a WooCommerce order payload to a Shelf sale', async () => {
    const result = await handleWooCommerceOrder(wooOrder());

    expect(result.status).toBe('created');
    expect(result.dedupKey).toBe('woocommerce:order:777');
    expect(result.sale).toMatchObject({
      id: 'woo-order-777',
      date: '2026-03-20T14:30:00Z',
      totalPrice: 89.97,
      clientName: 'Jane Smith',
      isActive: true,
      updatedBy: WOOCOMMERCE_WEBHOOK_PEER_ID,
    });
    expect(result.sale.items).toEqual<SaleItem[]>([
      {
        productId: 'woo-100',
        productVariantId: 'woo-variant-200',
        productName: 'Product A',
        quantity: 3,
        price: 29.99,
        cost: 0,
      },
    ]);
  });

  it('writes the sale and decrements inventory for woo products', async () => {
    const doc = new Y.Doc();
    seedProducts(doc, makeProduct({ id: 'woo-100', quantity: 5 }));

    const result = await handleWooCommerceOrder(wooOrder(), { doc });

    expect(readSale(doc, 'woo-order-777')).toBeDefined();
    expect(readProduct(doc, 'woo-100')?.quantity).toBe(2);
    expect(result.inventoryAdjustments[0]).toMatchObject({
      productId: 'woo-100',
      delta: 3,
      quantityBefore: 5,
      quantityAfter: 2,
    });
  });

  it('is idempotent via webhook ID dedup', async () => {
    const doc = new Y.Doc();
    seedProducts(doc, makeProduct({ id: 'woo-100', quantity: 5 }));
    const dedup = new InMemoryWebhookDedup();

    const first = await handleWooCommerceOrder(wooOrder(), { doc, dedup });
    const second = await handleWooCommerceOrder(wooOrder(), { doc, dedup });

    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(readProduct(doc, 'woo-100')?.quantity).toBe(2);
  });
});

// ── Shopify product sync ───────────────────────────────────────────────────

describe('handleShopifyProduct', () => {
  it('creates a Shelf product from a Shopify product payload', async () => {
    const result = await handleShopifyProduct(shopifyProduct());

    expect(result.status).toBe('created');
    expect(result.dedupKey).toBe('shopify:product:12345');
    expect(result.product).toMatchObject({
      id: 'shopify-12345',
      name: 'Test Product',
      sku: 'SKU-001',
      quantity: 10,
      price: 29.99,
      cost: 0,
      imageUrl: 'https://example.com/img.jpg',
      isActive: true,
      updatedBy: SHOPIFY_WEBHOOK_PEER_ID,
    });
    expect(result.product.variants?.[0]).toMatchObject({
      id: 'shopify-variant-100',
      label: 'Blue',
      quantity: 10,
      price: 29.99,
    });
  });

  it('upserts the product into the CRDT doc (create then update)', async () => {
    const doc = new Y.Doc();
    const first = await handleShopifyProduct(shopifyProduct(), { doc });
    const second = await handleShopifyProduct(shopifyProduct({ title: 'Renamed Product', variants: [], images: [] }), {
      doc,
    });

    expect(first.status).toBe('created');
    expect(second.status).toBe('created');
    expect(readProduct(doc, 'shopify-12345')?.name).toBe('Renamed Product');
  });

  it('maps archived products to inactive', async () => {
    const result = await handleShopifyProduct(shopifyProduct({ status: 'archived' }));
    expect(result.product.isActive).toBe(false);
  });

  it('skips duplicate product webhooks via the dedup store', async () => {
    const doc = new Y.Doc();
    const dedup = new InMemoryWebhookDedup();

    const first = await handleShopifyProduct(shopifyProduct(), { doc, dedup });
    const second = await handleShopifyProduct(shopifyProduct({ title: 'Ignored' }), { doc, dedup });

    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(readProduct(doc, 'shopify-12345')?.name).toBe('Test Product');
  });
});

// ── WooCommerce product sync ───────────────────────────────────────────────

describe('handleWooCommerceProduct', () => {
  it('creates a Shelf product from a WooCommerce product payload', async () => {
    const result = await handleWooCommerceProduct(wooProduct());

    expect(result.status).toBe('created');
    expect(result.dedupKey).toBe('woocommerce:product:555');
    expect(result.product).toMatchObject({
      id: 'woo-555',
      name: 'Woo Product',
      sku: 'WOO-SKU-1',
      quantity: 20,
      price: 45.5,
      imageUrl: 'https://woo.com/pic.png',
      isActive: true,
      updatedBy: WOOCOMMERCE_WEBHOOK_PEER_ID,
    });
  });

  it('maps draft products to inactive', async () => {
    const result = await handleWooCommerceProduct(wooProduct({ status: 'draft' }));
    expect(result.product.isActive).toBe(false);
  });
});
