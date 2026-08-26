export const config = {
  runtime: 'edge',
};

async function verifyWooCommerceSignature(req: Request, secret: string): Promise<boolean> {
  const signature = req.headers.get('X-WC-Webhook-Signature');
  if (!signature) return false;

  const body = await req.clone().text();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const bodyData = encoder.encode(body);

  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

  const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, signatureBytes, bodyData);
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 500000) {
    return new Response('Payload Too Large', { status: 413 });
  }

  const wooSecret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!wooSecret) {
    console.error('WOOCOMMERCE_WEBHOOK_SECRET is not configured');
    return new Response('Internal Server Error', { status: 500 });
  }

  const isValid = await verifyWooCommerceSignature(req, wooSecret);
  if (!isValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const topic = req.headers.get('X-WC-Webhook-Topic');
  const bodyText = await req.text();
  if (bodyText.length > 500000) {
    return new Response('Payload Too Large', { status: 413 });
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

  const peerId = 'woocommerce-webhook-bot';

  if (topic === 'product.created' || topic === 'product.updated') {
    const product = parseWooProduct(body as WooProduct, peerId);
    await processWebhookEntity(product, 'products');
    console.log('Processed Woo Product:', product.id);
  } else if (topic === 'order.created') {
    const sale = parseWooOrder(body as WooOrder, peerId);
    await processWebhookEntity(sale, 'sales');
    console.log('Processed Woo Order:', sale.id);
  }

  return new Response('OK', { status: 200 });
}

import { parseWooOrder, parseWooProduct, type WooOrder, type WooProduct } from './parsers';
import { processWebhookEntity } from './sync-helper';
