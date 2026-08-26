/**
 * Shopify / WooCommerce webhook handlers for shelf-inventory.
 *
 * Pure, edge-safe logic layer that the Vercel Edge Functions under
 * `api/webhooks/` delegate to. It provides:
 *
 *  1. `handleShopifyOrder` / `handleWooCommerceOrder` — map platform order
 *     payloads to Shelf sales and apply them to the inventory CRDT
 *     (sale upsert + per line-item stock decrement on the product/variant).
 *  2. `handleShopifyProduct` / `handleWooCommerceProduct` — create/update
 *     Shelf products from platform product webhooks (upsert into CRDT).
 *  3. HMAC-SHA256 signature verification for both platforms, using the Web
 *     Crypto API so it runs on Vercel Edge, browsers and Node ≥ 20.
 *  4. Idempotency via webhook ID dedup: the caller plugs in a
 *     `WebhookDedupStore` (in-memory for tests/single instance, KV-backed
 *     e.g. `SET NX` for serverless) and duplicate deliveries are a no-op.
 *
 * Handlers never touch `process.env` or the network — the API routes own the
 * request plumbing (headers, secrets, KV persistence).
 */
import * as Y from 'yjs';
import type { Product, Sale } from '../../../packages/p2p-mesh-core/src/types';
import type { ShopifyOrder, ShopifyProduct, WooOrder, WooProduct } from '../api/webhooks/parsers';
import { parseShopifyOrder, parseShopifyProduct, parseWooOrder, parseWooProduct } from '../api/webhooks/parsers';

/** Peer ID stamped on Shopify-sourced entities (matches api/webhooks routes). */
export const SHOPIFY_WEBHOOK_PEER_ID = 'shopify-webhook-bot';
/** Peer ID stamped on WooCommerce-sourced entities (matches api/webhooks routes). */
export const WOOCOMMERCE_WEBHOOK_PEER_ID = 'woocommerce-webhook-bot';
/** Yjs transaction origin used for every webhook-applied mutation. */
export const WEBHOOK_CRDT_ORIGIN = 'webhook-sync';

export type WebhookPlatform = 'shopify' | 'woocommerce';
export type WebhookEntityType = 'order' | 'product';

// ── HMAC signature verification ────────────────────────────────────────────

/**
 * Verify an HMAC-SHA256 signature over the RAW webhook body.
 *
 * Both Shopify (`X-Shopify-Hmac-SHA256`) and WooCommerce
 * (`X-WC-Webhook-Signature`) sign the exact raw request body and ship the
 * digest base64-encoded, so the verification primitive is shared.
 *
 * Implemented on the Web Crypto API to stay compatible with the Vercel Edge
 * runtime. Any parse/verify failure (malformed base64, missing input,
 * mismatched digest) resolves to `false`.
 */
export async function verifyWebhookHmac(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signatureBytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(rawBody));
  } catch {
    return false;
  }
}

/** Shopify: verify the `X-Shopify-Hmac-SHA256` header against the raw body. */
export function verifyShopifyHmac(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  return verifyWebhookHmac(rawBody, signature, secret);
}

/** WooCommerce: verify the `X-WC-Webhook-Signature` header against the raw body. */
export function verifyWooCommerceHmac(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  return verifyWebhookHmac(rawBody, signature, secret);
}

// ── Idempotency: webhook ID dedup ──────────────────────────────────────────

/** Minimal key-value interface so callers can back dedup with Vercel KV / Redis. */
export interface WebhookDedupStore {
  has(key: string): boolean | Promise<boolean>;
  add(key: string): void | Promise<void>;
}

/**
 * In-memory dedup store — safe for tests and single-instance runtimes.
 * For distributed serverless deployments use an atomic store (e.g. Redis
 * `SET NX`) that implements the same interface without a has/add race.
 */
export class InMemoryWebhookDedup implements WebhookDedupStore {
  private readonly seen = new Set<string>();

  has(key: string): boolean {
    return this.seen.has(key);
  }

  add(key: string): void {
    this.seen.add(key);
  }
}

/** Stable dedup key for a platform webhook, e.g. `shopify:order:9999`. */
export function webhookDedupKey(platform: WebhookPlatform, entity: WebhookEntityType, id: string | number): string {
  return `${platform}:${entity}:${id}`;
}

/**
 * Claim a webhook ID for processing. Returns `true` when this is the first
 * sighting (caller should process), `false` when the ID was already handled
 * (duplicate delivery — caller should skip). Without a store every delivery
 * is processed.
 */
async function claimWebhook(store: WebhookDedupStore | undefined, key: string): Promise<boolean> {
  if (!store) return true;
  if (await store.has(key)) return false;
  await store.add(key);
  return true;
}

// ── CRDT (Yjs) application ─────────────────────────────────────────────────

/** One stock decrement applied to a product (or one of its variants). */
export interface InventoryAdjustment {
  productId: string;
  productVariantId?: string;
  /** Units removed from stock (never exceeds the available quantity). */
  delta: number;
  quantityBefore: number;
  quantityAfter: number;
}

/**
 * Apply a Shelf sale to the inventory CRDT:
 *  1. upsert the sale into the `sales` map,
 *  2. decrement stock for every line item: the matching variant when the
 *     item references one and it exists, otherwise the product itself.
 *
 * Decrements are clamped at 0 — a webhook-sourced order is authoritative
 * (the sale already happened on the platform) so we never mint negative
 * stock, but we record the delta actually applied.
 *
 * Products that are not (yet) synced into the doc are skipped without error.
 */
export function applySaleToCrdt(doc: Y.Doc, sale: Sale, origin = WEBHOOK_CRDT_ORIGIN): InventoryAdjustment[] {
  const salesMap = doc.getMap('sales');
  const productsMap = doc.getMap('products');
  const adjustments: InventoryAdjustment[] = [];
  const updatedBy = sale.updatedBy || origin;

  doc.transact(() => {
    salesMap.set(sale.id, sale);

    for (const item of sale.items) {
      const product = productsMap.get(item.productId) as Product | undefined;
      if (!product) continue;

      const updatedAt = new Date().toISOString();

      if (item.productVariantId && product.variants && product.variants.length > 0) {
        const variant = product.variants.find((candidate) => candidate.id === item.productVariantId);
        if (variant) {
          const quantityBefore = variant.quantity;
          const delta = Math.min(item.quantity, quantityBefore);
          const nextVariant = {
            ...variant,
            quantity: quantityBefore - delta,
            updatedBy,
            updatedAt,
          };
          productsMap.set(product.id, {
            ...product,
            variants: product.variants.map((candidate) => (candidate.id === nextVariant.id ? nextVariant : candidate)),
            updatedBy,
            updatedAt,
          });
          adjustments.push({
            productId: product.id,
            productVariantId: variant.id,
            delta,
            quantityBefore,
            quantityAfter: nextVariant.quantity,
          });
          continue;
        }
      }

      const quantityBefore = product.quantity;
      const delta = Math.min(item.quantity, quantityBefore);
      const nextQuantity = quantityBefore - delta;
      productsMap.set(product.id, {
        ...product,
        quantity: nextQuantity,
        updatedBy,
        updatedAt,
      });
      adjustments.push({
        productId: product.id,
        delta,
        quantityBefore,
        quantityAfter: nextQuantity,
      });
    }
  }, origin);

  return adjustments;
}

/** Upsert a Shelf product into the `products` CRDT map. */
export function applyProductToCrdt(doc: Y.Doc, product: Product, origin = WEBHOOK_CRDT_ORIGIN): void {
  doc.transact(() => {
    doc.getMap('products').set(product.id, product);
  }, origin);
}

// ── Handler context & results ──────────────────────────────────────────────

export interface WebhookHandlerContext {
  /**
   * Opt-in webhook ID store. When omitted every delivery is processed
   * (caller takes responsibility for replay protection).
   */
  dedup?: WebhookDedupStore;
  /**
   * Yjs document to mutate. When omitted a fresh document is created and the
   * returned `update` blob is the only durable artifact (same contract as
   * `sync-helper`). For real persistence, reload the doc state from KV,
   * apply the returned update, and persist again.
   */
  doc?: Y.Doc;
}

export interface OrderWebhookResult {
  /** `duplicate` when the webhook ID was already processed (idempotent no-op). */
  status: 'created' | 'duplicate';
  dedupKey: string;
  sale: Sale;
  inventoryAdjustments: InventoryAdjustment[];
  /** Yjs state update carrying the applied mutations (empty for duplicates). */
  update: Uint8Array;
}

export interface ProductWebhookResult {
  status: 'created' | 'duplicate';
  dedupKey: string;
  product: Product;
  /** Yjs state update carrying the applied mutation (empty for duplicates). */
  update: Uint8Array;
}

/** Shared order-handling flow: parse → claim → apply sale + inventory. */
async function handleOrder<P extends ShopifyOrder | WooOrder>(
  platform: WebhookPlatform,
  payload: P,
  parse: (payload: P, peerId: string) => Sale,
  peerId: string,
  context: WebhookHandlerContext,
): Promise<OrderWebhookResult> {
  const dedupKey = webhookDedupKey(platform, 'order', payload.id);
  const doc = context.doc ?? new Y.Doc();
  const sale = parse(payload, peerId);

  if (!(await claimWebhook(context.dedup, dedupKey))) {
    return {
      status: 'duplicate',
      dedupKey,
      sale,
      inventoryAdjustments: [],
      update: Y.encodeStateAsUpdate(new Y.Doc()),
    };
  }

  const inventoryAdjustments = applySaleToCrdt(doc, sale);
  return {
    status: 'created',
    dedupKey,
    sale,
    inventoryAdjustments,
    update: Y.encodeStateAsUpdate(doc),
  };
}

/**
 * Map a Shopify `orders/create` payload to a Shelf sale and apply it to the
 * inventory CRDT (sale upsert + stock decrement per line item).
 */
export function handleShopifyOrder(
  order: ShopifyOrder,
  context: WebhookHandlerContext = {},
): Promise<OrderWebhookResult> {
  return handleOrder('shopify', order, parseShopifyOrder, SHOPIFY_WEBHOOK_PEER_ID, context);
}

/**
 * Map a WooCommerce `order.created` payload to a Shelf sale and apply it to
 * the inventory CRDT (sale upsert + stock decrement per line item).
 */
export function handleWooCommerceOrder(
  order: WooOrder,
  context: WebhookHandlerContext = {},
): Promise<OrderWebhookResult> {
  return handleOrder('woocommerce', order, parseWooOrder, WOOCOMMERCE_WEBHOOK_PEER_ID, context);
}

/** Shared product-handling flow: parse → claim → upsert product. */
async function handleProduct<P extends ShopifyProduct | WooProduct>(
  platform: WebhookPlatform,
  payload: P,
  parse: (payload: P, peerId: string) => Product,
  peerId: string,
  context: WebhookHandlerContext,
): Promise<ProductWebhookResult> {
  const dedupKey = webhookDedupKey(platform, 'product', payload.id);
  const doc = context.doc ?? new Y.Doc();
  const product = parse(payload, peerId);

  if (!(await claimWebhook(context.dedup, dedupKey))) {
    return {
      status: 'duplicate',
      dedupKey,
      product,
      update: Y.encodeStateAsUpdate(new Y.Doc()),
    };
  }

  applyProductToCrdt(doc, product);
  return {
    status: 'created',
    dedupKey,
    product,
    update: Y.encodeStateAsUpdate(doc),
  };
}

/**
 * Sync a Shopify `products/create` / `products/update` payload into the
 * Shelf catalog (creates or updates the `shopify-<id>` product).
 */
export function handleShopifyProduct(
  product: ShopifyProduct,
  context: WebhookHandlerContext = {},
): Promise<ProductWebhookResult> {
  return handleProduct('shopify', product, parseShopifyProduct, SHOPIFY_WEBHOOK_PEER_ID, context);
}

/**
 * Sync a WooCommerce `product.created` / `product.updated` payload into the
 * Shelf catalog (creates or updates the `woo-<id>` product).
 */
export function handleWooCommerceProduct(
  product: WooProduct,
  context: WebhookHandlerContext = {},
): Promise<ProductWebhookResult> {
  return handleProduct('woocommerce', product, parseWooProduct, WOOCOMMERCE_WEBHOOK_PEER_ID, context);
}
