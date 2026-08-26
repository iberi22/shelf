import type { Product, Sale, SaleItem } from '../../../../packages/p2p-mesh-core/src/types';

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  created_at: string;
  handle?: string;
  updated_at: string;
  published_at?: string;
  template_suffix?: string;
  status?: string;
  published_scope?: string;
  tags?: string;
  admin_graphql_api_id?: string;
  variants: ShopifyVariant[];
  images: { src: string }[];
  image?: { src: string };
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  position?: number;
  inventory_policy?: string;
  compare_at_price?: string;
  fulfillment_service?: string;
  inventory_management?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  created_at: string;
  updated_at: string;
  taxable?: boolean;
  barcode?: string;
  grams?: number;
  image_id?: number;
  weight?: number;
  weight_unit?: string;
  inventory_item_id?: number;
  inventory_quantity: number;
  old_inventory_quantity?: number;
  requires_shipping?: boolean;
  admin_graphql_api_id?: string;
}

export interface ShopifyOrder {
  id: number;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  created_at: string;
  updated_at: string;
  currency: string;
  line_items: ShopifyLineItem[];
  customer?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface ShopifyLineItem {
  id: number;
  variant_id: number;
  title: string;
  quantity: number;
  sku: string;
  variant_title: string;
  vendor: string;
  price: string;
  product_id: number;
}

export function parseShopifyProduct(shopifyProduct: ShopifyProduct, peerId: string): Product {
  const firstVariant = shopifyProduct.variants[0];

  return {
    id: `shopify-${shopifyProduct.id}`,
    name: shopifyProduct.title,
    sku: firstVariant?.sku || '',
    quantity: shopifyProduct.variants.reduce((acc, v) => acc + (v.inventory_quantity || 0), 0),
    price: parseFloat(firstVariant?.price || '0'),
    cost: 0, // Shopify doesn't provide cost in standard webhook
    imageUrl: shopifyProduct.image?.src || shopifyProduct.images?.[0]?.src || '',
    isActive: shopifyProduct.status !== 'archived',
    updatedBy: peerId,
    updatedAt: new Date().toISOString(),
    variants: shopifyProduct.variants.map((v) => ({
      id: `shopify-variant-${v.id}`,
      label: v.title,
      sku: v.sku,
      quantity: v.inventory_quantity,
      price: parseFloat(v.price),
      cost: 0,
      attributes: {
        option1: v.option1 || '',
        option2: v.option2 || '',
        option3: v.option3 || '',
      },
      isActive: true,
      updatedBy: peerId,
      updatedAt: new Date().toISOString(),
    })),
  };
}

export function parseShopifyOrder(shopifyOrder: ShopifyOrder, peerId: string): Sale {
  const items: SaleItem[] = shopifyOrder.line_items.map((item) => ({
    productId: `shopify-${item.product_id}`,
    productVariantId: `shopify-variant-${item.variant_id}`,
    productName: item.title,
    quantity: item.quantity,
    price: parseFloat(item.price),
    cost: 0,
  }));

  const totalPrice = parseFloat(shopifyOrder.total_price);

  return {
    id: `shopify-order-${shopifyOrder.id}`,
    date: shopifyOrder.created_at,
    items,
    totalPrice,
    profit: totalPrice, // Simplified
    clientId: shopifyOrder.customer ? `shopify-customer-${shopifyOrder.customer.id}` : undefined,
    clientName: shopifyOrder.customer
      ? `${shopifyOrder.customer.first_name} ${shopifyOrder.customer.last_name}`
      : undefined,
    isActive: true,
    updatedBy: peerId,
    updatedAt: new Date().toISOString(),
  };
}

export interface WooProduct {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock_quantity: number;
  status: string;
  images: { src: string }[];
  variations: number[];
}

export interface WooOrder {
  id: number;
  total: string;
  date_created: string;
  line_items: WooLineItem[];
  billing?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface WooLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  sku: string;
  price: number;
}

export function parseWooProduct(wooProduct: WooProduct, peerId: string): Product {
  return {
    id: `woo-${wooProduct.id}`,
    name: wooProduct.name,
    sku: wooProduct.sku,
    quantity: wooProduct.stock_quantity || 0,
    price: parseFloat(wooProduct.price || '0'),
    cost: 0,
    imageUrl: wooProduct.images?.[0]?.src || '',
    isActive: wooProduct.status === 'publish',
    updatedBy: peerId,
    updatedAt: new Date().toISOString(),
  };
}

export function parseWooOrder(wooOrder: WooOrder, peerId: string): Sale {
  const items: SaleItem[] = wooOrder.line_items.map((item) => ({
    productId: `woo-${item.product_id}`,
    productVariantId: item.variation_id ? `woo-variant-${item.variation_id}` : undefined,
    productName: item.name,
    quantity: item.quantity,
    price: item.price,
    cost: 0,
  }));

  const total = parseFloat(wooOrder.total);

  return {
    id: `woo-order-${wooOrder.id}`,
    date: wooOrder.date_created,
    items,
    totalPrice: total,
    profit: total,
    clientName: wooOrder.billing ? `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}` : undefined,
    isActive: true,
    updatedBy: peerId,
    updatedAt: new Date().toISOString(),
  };
}
