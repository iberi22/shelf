import type { Product, ProductVariant } from 'p2p-mesh-core';
import { getProductVariants, normalizeProduct } from './productVariants';

export interface ProductLookupResult {
  product: Product;
  variant?: ProductVariant;
}

/**
 * Helper to look up an active product or specific variant by SKU, barcode, or ID.
 */
export function lookupProductByBarcodeOrSku(products: Product[], code: string): ProductLookupResult | null {
  const normalizedCode = code.trim().toLowerCase();
  if (!normalizedCode) return null;

  for (const rawProduct of products) {
    if (rawProduct.isActive === false || rawProduct.quantity <= 0) continue;
    const product = normalizeProduct(rawProduct);

    // 1. Check main product SKU or ID
    if (
      (product.sku || '').trim().toLowerCase() === normalizedCode ||
      product.id.trim().toLowerCase() === normalizedCode
    ) {
      const variants = getProductVariants(product);
      return { product, variant: variants[0] || undefined };
    }

    // 2. Check product variants SKU or ID
    const variants = getProductVariants(product);
    for (const variant of variants) {
      if (
        (variant.sku || '').trim().toLowerCase() === normalizedCode ||
        variant.id.trim().toLowerCase() === normalizedCode
      ) {
        return { product, variant };
      }
    }
  }

  return null;
}
