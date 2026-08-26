import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock sync-helper before importing handler ──────────────────────────
vi.mock('../sync-helper', () => ({
  processWebhookEntity: vi.fn().mockResolvedValue(new Uint8Array()),
}));

import { processWebhookEntity } from '../sync-helper';
import handler from '../woocommerce';

const WEBHOOK_SECRET = 'test-woo-secret-456';

// ── Helpers ────────────────────────────────────────────────────────────
function computeHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

function makeWooRequest(
  body: object,
  opts: {
    method?: string;
    hmacHeader?: string | null;
    topic?: string;
    secret?: string;
  } = {},
): Request {
  const { method = 'POST', hmacHeader, topic = 'product.updated', secret = WEBHOOK_SECRET } = opts;
  const bodyStr = JSON.stringify(body);

  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (topic) headers.set('X-WC-Webhook-Topic', topic);

  if (hmacHeader === undefined) {
    // auto-compute valid HMAC
    headers.set('X-WC-Webhook-Signature', computeHmac(bodyStr, secret));
  } else if (hmacHeader !== null) {
    headers.set('X-WC-Webhook-Signature', hmacHeader);
  }
  // hmacHeader === null → header omitted (no header sent)

  return new Request('https://example.com/api/webhooks/woocommerce', {
    method,
    headers,
    body: method === 'POST' ? bodyStr : undefined,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────
describe('WooCommerce webhook handler', () => {
  beforeEach(() => {
    process.env.WOOCOMMERCE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    vi.mocked(processWebhookEntity).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── HTTP-level guards ───────────────────────────────────────────────
  it('returns 405 for non-POST requests', async () => {
    const req = new Request('https://example.com/api/webhooks/woocommerce', {
      method: 'GET',
    });
    const res = await handler(req);
    expect(res.status).toBe(405);
  });

  it('returns 500 when WOOCOMMERCE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    const body = {
      id: 1,
      name: 'X',
      sku: '',
      price: '0',
      stock_quantity: 0,
      status: 'publish',
      images: [],
      variations: [],
    };
    const req = makeWooRequest(body);
    const res = await handler(req);
    expect(res.status).toBe(500);
  });

  // ── HMAC signature checks ───────────────────────────────────────────
  it('returns 401 when HMAC header is missing', async () => {
    const body = {
      id: 1,
      name: 'X',
      sku: '',
      price: '0',
      stock_quantity: 0,
      status: 'publish',
      images: [],
      variations: [],
    };
    const req = makeWooRequest(body, { hmacHeader: null });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid HMAC signature', async () => {
    const body = {
      id: 1,
      name: 'X',
      sku: '',
      price: '0',
      stock_quantity: 0,
      status: 'publish',
      images: [],
      variations: [],
    };
    const req = makeWooRequest(body, {
      hmacHeader: computeHmac('wrong-payload', WEBHOOK_SECRET),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid HMAC signature', async () => {
    const product = {
      id: 1,
      name: 'P',
      sku: 'S1',
      price: '10',
      stock_quantity: 5,
      status: 'publish',
      images: [],
      variations: [],
    };
    const req = makeWooRequest(product);
    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  // ── Payload limits and validation ───────────────────────────────────
  it('returns 413 when content-length exceeds 500KB', async () => {
    const req = makeWooRequest({});
    req.headers.set('content-length', '500001');
    const res = await handler(req);
    expect(res.status).toBe(413);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = makeWooRequest({});
    Object.defineProperty(req, 'text', { value: async () => '{invalid-json' });
    Object.defineProperty(req, 'clone', { value: () => ({ text: async () => '{invalid-json' }) });

    req.headers.set('X-WC-Webhook-Signature', computeHmac('{invalid-json', WEBHOOK_SECRET));

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-object JSON body', async () => {
    const req = makeWooRequest({});
    Object.defineProperty(req, 'text', { value: async () => '"string-body"' });
    Object.defineProperty(req, 'clone', { value: () => ({ text: async () => '"string-body"' }) });

    req.headers.set('X-WC-Webhook-Signature', computeHmac('"string-body"', WEBHOOK_SECRET));

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for array JSON body', async () => {
    const req = makeWooRequest({});
    Object.defineProperty(req, 'text', { value: async () => '[]' });
    Object.defineProperty(req, 'clone', { value: () => ({ text: async () => '[]' }) });

    req.headers.set('X-WC-Webhook-Signature', computeHmac('[]', WEBHOOK_SECRET));

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  // ── Product parsing (product.updated & product.created) ─────────────
  it('parses product.updated webhook', async () => {
    const wooProduct = {
      id: 555,
      name: 'Woo Product',
      sku: 'WOO-SKU-1',
      price: '45.50',
      stock_quantity: 20,
      status: 'publish',
      images: [{ src: 'https://woo.com/pic.png' }],
      variations: [1001, 1002],
    };
    const req = makeWooRequest(wooProduct, { topic: 'product.updated' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(processWebhookEntity).toHaveBeenCalledTimes(1);

    const [entity, collection] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(collection).toBe('products');
    expect(entity).toMatchObject({
      id: 'woo-555',
      name: 'Woo Product',
      sku: 'WOO-SKU-1',
      quantity: 20,
      price: 45.5,
      cost: 0,
      imageUrl: 'https://woo.com/pic.png',
      isActive: true,
      updatedBy: 'woocommerce-webhook-bot',
    });
  });

  it('treats draft product as inactive', async () => {
    const wooProduct = {
      id: 600,
      name: 'Draft',
      sku: '',
      price: '0',
      stock_quantity: 0,
      status: 'draft',
      images: [],
      variations: [],
    };
    const req = makeWooRequest(wooProduct, { topic: 'product.created' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const [entity] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(entity).toMatchObject({ isActive: false });
  });

  // ── Order parsing (order.created) ───────────────────────────────────
  it('parses order.created webhook with billing info', async () => {
    const wooOrder = {
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
    };
    const req = makeWooRequest(wooOrder, { topic: 'order.created' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(processWebhookEntity).toHaveBeenCalledTimes(1);

    const [entity, collection] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(collection).toBe('sales');
    expect(entity).toMatchObject({
      id: 'woo-order-777',
      totalPrice: 89.97,
      clientName: 'Jane Smith',
      isActive: true,
      updatedBy: 'woocommerce-webhook-bot',
    });

    const items = (entity as any).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productId: 'woo-100',
      productVariantId: 'woo-variant-200',
      productName: 'Product A',
      quantity: 3,
      price: 29.99,
    });
  });

  it('parses order without billing info', async () => {
    const wooOrder = {
      id: 100,
      total: '5.00',
      date_created: '2026-01-01T00:00:00Z',
      line_items: [],
    };
    const req = makeWooRequest(wooOrder, { topic: 'order.created' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const [entity] = vi.mocked(processWebhookEntity).mock.calls[0]!;
    expect(entity).toMatchObject({
      id: 'woo-order-100',
      clientName: undefined,
    });
  });

  // ── Unknown topic → still returns 200 (no crash) ───────────────────
  it('returns 200 for unknown topic without crashing', async () => {
    const req = makeWooRequest({ id: 1 }, { topic: 'order.updated' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(processWebhookEntity).not.toHaveBeenCalled();
  });
});
