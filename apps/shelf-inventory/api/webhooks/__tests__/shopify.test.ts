import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock sync-helper before importing handler ──────────────────────────
vi.mock('../sync-helper', () => ({
  processWebhookEntity: vi.fn().mockResolvedValue(new Uint8Array()),
}));

import { resetIdempotencyCache } from '../idempotency';
import handler from '../shopify';
import { processWebhookEntity } from '../sync-helper';

const WEBHOOK_SECRET = 'test-shopify-secret-123';

// ── Helpers ────────────────────────────────────────────────────────────
function computeHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

function makeShopifyRequest(
  body: object,
  opts: {
    method?: string;
    hmacHeader?: string | null;
    topic?: string;
    secret?: string;
  } = {},
): Request {
  const { method = 'POST', hmacHeader, topic = 'products/update', secret = WEBHOOK_SECRET } = opts;
  const bodyStr = JSON.stringify(body);

  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (topic) headers.set('X-Shopify-Topic', topic);

  if (hmacHeader === undefined) {
    // auto-compute valid HMAC
    headers.set('X-Shopify-Hmac-SHA256', computeHmac(bodyStr, secret));
  } else if (hmacHeader !== null) {
    headers.set('X-Shopify-Hmac-SHA256', hmacHeader);
  }
  // hmacHeader === null → header omitted (no header sent)

  return new Request('https://example.com/api/webhooks/shopify', {
    method,
    headers,
    body: method === 'POST' ? bodyStr : undefined,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────
describe('Shopify webhook handler', () => {
  beforeEach(() => {
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    vi.mocked(processWebhookEntity).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── HTTP-level guards ───────────────────────────────────────────────
  it('returns 405 for non-POST requests', async () => {
    const req = new Request('https://example.com/api/webhooks/shopify', {
      method: 'GET',
    });
    const res = await handler(req);
    expect(res.status).toBe(405);
  });

  it('returns 500 when SHOPIFY_WEBHOOK_SECRET is not set', async () => {
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    const body = { id: 1, title: 'X', variants: [], images: [] };
    const req = makeShopifyRequest(body);
    const res = await handler(req);
    expect(res.status).toBe(500);
  });

  // ── HMAC signature checks ───────────────────────────────────────────
  it('returns 401 when HMAC header is missing', async () => {
    const body = { id: 1, title: 'X', variants: [], images: [] };
    const req = makeShopifyRequest(body, { hmacHeader: null });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid HMAC signature', async () => {
    const body = { id: 1, title: 'X', variants: [], images: [] };
    const req = makeShopifyRequest(body, {
      hmacHeader: computeHmac('wrong-payload', WEBHOOK_SECRET),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid HMAC signature', async () => {
    const product = {
      id: 1,
      title: 'P',
      status: 'active',
      image: { src: 'img' },
      images: [],
      variants: [],
    };
    const req = makeShopifyRequest(product);
    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  // ── Payload limits and validation ───────────────────────────────────
  it('returns 413 when content-length exceeds 500KB', async () => {
    const req = makeShopifyRequest({});
    req.headers.set('content-length', '500001');
    const res = await handler(req);
    expect(res.status).toBe(413);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = makeShopifyRequest({});
    // Replace the body with invalid JSON but keep valid HMAC
    Object.defineProperty(req, 'text', { value: async () => '{invalid-json' });
    Object.defineProperty(req, 'clone', { value: () => ({ text: async () => '{invalid-json' }) });

    // We also need to update the signature to match the invalid JSON
    req.headers.set('X-Shopify-Hmac-SHA256', computeHmac('{invalid-json', WEBHOOK_SECRET));

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-object JSON body', async () => {
    const req = makeShopifyRequest({});
    Object.defineProperty(req, 'text', { value: async () => '"string-body"' });
    Object.defineProperty(req, 'clone', { value: () => ({ text: async () => '"string-body"' }) });

    req.headers.set('X-Shopify-Hmac-SHA256', computeHmac('"string-body"', WEBHOOK_SECRET));

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for array JSON body', async () => {
    const req = makeShopifyRequest({});
    Object.defineProperty(req, 'text', { value: async () => '[]' });
    Object.defineProperty(req, 'clone', { value: () => ({ text: async () => '[]' }) });

    req.headers.set('X-Shopify-Hmac-SHA256', computeHmac('[]', WEBHOOK_SECRET));

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  // ── Product parsing (products/update & products/create) ─────────────
  it('parses product update webhook and calls processWebhookEntity', async () => {
    const shopifyProduct = {
      id: 12345,
      title: 'Test Product',
      status: 'active',
      image: { src: 'https://example.com/img.jpg' },
      images: [],
      variants: [
        {
          id: 100,
          product_id: 12345,
          title: 'Default',
          price: '29.99',
          sku: 'SKU-001',
          inventory_quantity: 10,
          option1: 'Blue',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const req = makeShopifyRequest(shopifyProduct, { topic: 'products/update' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(processWebhookEntity).toHaveBeenCalledTimes(1);

    const [entity, collection] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(collection).toBe('products');
    expect(entity).toMatchObject({
      id: 'shopify-12345',
      name: 'Test Product',
      sku: 'SKU-001',
      quantity: 10,
      price: 29.99,
      cost: 0,
      imageUrl: 'https://example.com/img.jpg',
      isActive: true,
      updatedBy: 'shopify-webhook-bot',
    });
  });

  it('treats archived product as inactive', async () => {
    const shopifyProduct = {
      id: 200,
      title: 'Archived',
      status: 'archived',
      images: [],
      variants: [],
    };
    const req = makeShopifyRequest(shopifyProduct, { topic: 'products/create' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const [entity] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(entity).toMatchObject({ isActive: false });
  });

  // ── Order parsing (orders/create) ───────────────────────────────────
  it('parses order webhook with customer info', async () => {
    const shopifyOrder = {
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
    };
    const req = makeShopifyRequest(shopifyOrder, { topic: 'orders/create' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(processWebhookEntity).toHaveBeenCalledTimes(1);

    const [entity, collection] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(collection).toBe('sales');
    expect(entity).toMatchObject({
      id: 'shopify-order-9999',
      totalPrice: 59.98,
      clientName: 'John Doe',
      clientId: 'shopify-customer-500',
      isActive: true,
      updatedBy: 'shopify-webhook-bot',
    });
  });

  it('parses order without customer', async () => {
    const shopifyOrder = {
      id: 100,
      total_price: '10.00',
      subtotal_price: '10.00',
      total_tax: '0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      currency: 'USD',
      line_items: [],
    };
    const req = makeShopifyRequest(shopifyOrder, { topic: 'orders/create' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const [entity] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(entity).toMatchObject({
      id: 'shopify-order-100',
      clientId: undefined,
      clientName: undefined,
    });
  });

  // ── Unknown topic → still returns 200 (no crash) ───────────────────
  it('returns 200 for unknown topic without crashing', async () => {
    const req = makeShopifyRequest({ id: 1 }, { topic: 'orders/unknown' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(processWebhookEntity).not.toHaveBeenCalled();
  });
});

// ── Idempotency (duplicate delivery dedupe by event id) ──────────────
describe('idempotency', () => {
  beforeEach(() => {
    resetIdempotencyCache();
    vi.mocked(processWebhookEntity).mockClear();
  });

  it('dedupes identical deliveries (same body → same event id)', async () => {
    const product = { id: 424242, title: 'Dedupe', status: 'active', images: [], variants: [] };
    const first = await handler(makeShopifyRequest(product, { topic: 'products/update' }));
    expect(first.status).toBe(200);
    expect(processWebhookEntity).toHaveBeenCalledTimes(1);

    vi.mocked(processWebhookEntity).mockClear();
    const second = await handler(makeShopifyRequest(product, { topic: 'products/update' }));
    expect(second.status).toBe(200);
    expect(processWebhookEntity).not.toHaveBeenCalled();
  });

  it('processes a distinct payload for the same entity (not deduped)', async () => {
    const base = { id: 515151, title: 'V1', status: 'active', images: [], variants: [] };
    await handler(makeShopifyRequest(base, { topic: 'products/update' }));
    expect(processWebhookEntity).toHaveBeenCalledTimes(1);

    vi.mocked(processWebhookEntity).mockClear();
    const updated = { ...base, title: 'V2' };
    await handler(makeShopifyRequest(updated, { topic: 'products/update' }));
    expect(processWebhookEntity).toHaveBeenCalledTimes(1);
  });
});
