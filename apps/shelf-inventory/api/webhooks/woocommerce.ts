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

  const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, signatureBytes, bodyData);
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
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
  const body = await req.json();

  const peerId = 'woocommerce-webhook-bot';

  if (topic === 'product.created' || topic === 'product.updated') {
    const product = parseWooProduct(body, peerId);
    await processWebhookEntity(product, 'products');
    console.log('Processed Woo Product:', product.id);
  } else if (topic === 'order.created') {
    const sale = parseWooOrder(body, peerId);
    await processWebhookEntity(sale, 'sales');
    console.log('Processed Woo Order:', sale.id);
  }

  return new Response('OK', { status: 200 });
}

import { parseWooOrder, parseWooProduct } from './parsers';
import { processWebhookEntity } from './sync-helper';
