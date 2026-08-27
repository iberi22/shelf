import { buildEventId, claimEvent } from './idempotency';
import { parseShopifyOrder, parseShopifyProduct, type ShopifyOrder, type ShopifyProduct } from './parsers';
import { processWebhookEntity } from './sync-helper';

export const config = {
  runtime: 'edge',
};

async function verifyShopifySignature(body: string, secret: string, hmacHeader: string | null): Promise<boolean> {
  if (!hmacHeader) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const bodyData = encoder.encode(body);

  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

  const hmacHeaderBytes = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, hmacHeaderBytes, bodyData);
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 500000) {
    return new Response('Payload Too Large', { status: 413 });
  }

  const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!shopifySecret) {
    console.error('SHOPIFY_WEBHOOK_SECRET is not configured');
    return new Response('Internal Server Error', { status: 500 });
  }

  const hmacHeader = req.headers.get('X-Shopify-Hmac-SHA256');
  const bodyText = await req.text();
  if (bodyText.length > 500000) {
    return new Response('Payload Too Large', { status: 413 });
  }

  if (!(await verifyShopifySignature(bodyText, shopifySecret, hmacHeader))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return new Response('Bad Request', { status: 400 });
  }

  const topic = req.headers.get('X-Shopify-Topic');

  // Idempotency: retries carry an identical body → same event id → skipped.
  // Claimed only after validation, so malformed deliveries are never marked seen.
  const eventId = await buildEventId('shopify', topic, bodyText);
  if (!claimEvent(eventId)) {
    console.log('[webhooks:shopify] duplicate delivery skipped:', eventId);
    return new Response('OK', { status: 200 });
  }

  // Peer ID for the webhook system
  const peerId = 'shopify-webhook-bot';

  if (topic === 'products/update' || topic === 'products/create') {
    const product = parseShopifyProduct(body as ShopifyProduct, peerId);
    await processWebhookEntity(product, 'products');
    console.log('Processed Shopify Product:', product.id);
  } else if (topic === 'orders/create') {
    const sale = parseShopifyOrder(body as ShopifyOrder, peerId);
    await processWebhookEntity(sale, 'sales');
    console.log('Processed Shopify Order:', sale.id);
  }

  return new Response('OK', { status: 200 });
}
