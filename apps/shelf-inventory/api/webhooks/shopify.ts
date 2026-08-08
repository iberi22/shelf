export const config = {
  runtime: 'edge',
};

async function verifyShopifySignature(req: Request, secret: string): Promise<boolean> {
  const hmacHeader = req.headers.get('X-Shopify-Hmac-SHA256');
  if (!hmacHeader) return false;

  const body = await req.clone().text();
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

  const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!shopifySecret) {
    console.error('SHOPIFY_WEBHOOK_SECRET is not configured');
    return new Response('Internal Server Error', { status: 500 });
  }

  const isValid = await verifyShopifySignature(req, shopifySecret);
  if (!isValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const topic = req.headers.get('X-Shopify-Topic');
  const body = await req.json();

  // Peer ID for the webhook system
  const peerId = 'shopify-webhook-bot';

  if (topic === 'products/update' || topic === 'products/create') {
    const product = parseShopifyProduct(body, peerId);
    await processWebhookEntity(product, 'products');
    console.log('Processed Shopify Product:', product.id);
  } else if (topic === 'orders/create') {
    const sale = parseShopifyOrder(body, peerId);
    await processWebhookEntity(sale, 'sales');
    console.log('Processed Shopify Order:', sale.id);
  }

  return new Response('OK', { status: 200 });
}

import { parseShopifyOrder, parseShopifyProduct } from './parsers';
import { processWebhookEntity } from './sync-helper';
