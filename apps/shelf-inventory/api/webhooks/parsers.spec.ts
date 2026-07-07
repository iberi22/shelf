import { describe, it, expect } from 'vitest';
import { parseShopifyProduct, parseShopifyOrder, parseWooProduct, parseWooOrder } from './parsers';

describe('Webhook Parsers', () => {
  const peerId = 'test-bot';

  describe('Shopify Parser', () => {
    it('should parse a Shopify product', () => {
      const shopifyProduct = {
        id: 123456,
        title: 'Test Shopify Product',
        status: 'active',
        variants: [
          {
            id: 789,
            sku: 'SKU-789',
            price: '29.99',
            inventory_quantity: 10,
            title: 'Default Variant',
          },
        ],
        images: [{ src: 'https://example.com/image.jpg' }],
      };

      const parsed = parseShopifyProduct(shopifyProduct as any, peerId);
      expect(parsed.id).toBe('shopify-123456');
      expect(parsed.name).toBe('Test Shopify Product');
      expect(parsed.price).toBe(29.99);
      expect(parsed.quantity).toBe(10);
      expect(parsed.sku).toBe('SKU-789');
    });

    it('should parse a Shopify order', () => {
      const shopifyOrder = {
        id: 999,
        total_price: '59.98',
        created_at: '2024-03-20T10:00:00Z',
        line_items: [
          {
            product_id: 123456,
            variant_id: 789,
            title: 'Test Shopify Product',
            quantity: 2,
            price: '29.99',
            sku: 'SKU-789',
          },
        ],
        customer: {
          id: 555,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
        },
      };

      const parsed = parseShopifyOrder(shopifyOrder as any, peerId);
      expect(parsed.id).toBe('shopify-order-999');
      expect(parsed.totalPrice).toBe(59.98);
      expect(parsed.items.length).toBe(1);
      expect(parsed.clientName).toBe('John Doe');
    });
  });

  describe('WooCommerce Parser', () => {
    it('should parse a WooCommerce product', () => {
      const wooProduct = {
        id: 456,
        name: 'Test Woo Product',
        sku: 'WOO-SKU',
        price: '15.50',
        stock_quantity: 5,
        status: 'publish',
        images: [{ src: 'https://example.com/woo.jpg' }],
      };

      const parsed = parseWooProduct(wooProduct as any, peerId);
      expect(parsed.id).toBe('woo-456');
      expect(parsed.name).toBe('Test Woo Product');
      expect(parsed.price).toBe(15.5);
      expect(parsed.quantity).toBe(5);
    });

    it('should parse a WooCommerce order', () => {
      const wooOrder = {
        id: 888,
        total: '31.00',
        date_created: '2024-03-20T11:00:00Z',
        line_items: [
          {
            product_id: 456,
            variation_id: 0,
            name: 'Test Woo Product',
            quantity: 2,
            price: 15.5,
            sku: 'WOO-SKU',
          },
        ],
        billing: {
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
        },
      };

      const parsed = parseWooOrder(wooOrder as any, peerId);
      expect(parsed.id).toBe('woo-order-888');
      expect(parsed.totalPrice).toBe(31.0);
      expect(parsed.clientName).toBe('Jane Smith');
    });
  });
});
