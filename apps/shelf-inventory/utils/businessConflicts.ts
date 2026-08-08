import type { Product, Sale } from 'p2p-mesh-core';

export interface BusinessConflict {
  id: string; // unique identifier for the conflict
  productId: string;
  productVariantId?: string;
  productName: string;
  variantLabel?: string;
  initialStock: number;
  totalSold: number;
  negativeStock: number;
  sales: Sale[];
}

export const detectBusinessConflicts = (products: Product[], sales: Sale[]): BusinessConflict[] => {
  const conflicts: BusinessConflict[] = [];
  const activeSales = sales.filter((s) => s.isActive !== false);

  for (const product of products) {
    if (product.isActive === false) continue;

    const variants = product.variants || [];
    if (variants.length > 0) {
      for (const variant of variants) {
        if (variant.isActive === false) continue;

        // Get sales containing this variant
        const variantSales = activeSales.filter((s) =>
          s.items.some((item) => item.productId === product.id && item.productVariantId === variant.id),
        );

        if (variantSales.length <= 1) continue;

        // Check if there are sales from different peers (meaning offline concurrent sales)
        const peers = new Set(variantSales.map((s) => s.updatedBy || 'local'));
        if (peers.size <= 1) continue;

        // Calculate total sold quantity for this variant
        let totalSold = 0;
        const peerSoldQuantities: Record<string, number> = {};

        for (const sale of variantSales) {
          const item = sale.items.find((it) => it.productId === product.id && it.productVariantId === variant.id);
          if (item) {
            totalSold += item.quantity;
            const peer = sale.updatedBy || 'local';
            peerSoldQuantities[peer] = (peerSoldQuantities[peer] || 0) + item.quantity;
          }
        }

        // Reconstruct initial stock: current quantity + sales that have already decremented it.
        // The maximum sold by any single peer represents the decrement already reflected in the converged nominal stock (LWW winner).
        const maxSoldByAnyPeer = Math.max(...Object.values(peerSoldQuantities), 0);
        const initialStock = variant.quantity + maxSoldByAnyPeer;

        if (totalSold > initialStock) {
          const negativeStock = initialStock - totalSold; // will be negative
          conflicts.push({
            id: `${product.id}::${variant.id}`,
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            variantLabel: variant.label,
            initialStock,
            totalSold,
            negativeStock,
            sales: variantSales,
          });
        }
      }
    } else {
      // No variants - process at base product level
      const productSales = activeSales.filter((s) =>
        s.items.some((item) => item.productId === product.id && !item.productVariantId),
      );

      if (productSales.length <= 1) continue;

      const peers = new Set(productSales.map((s) => s.updatedBy || 'local'));
      if (peers.size <= 1) continue;

      let totalSold = 0;
      const peerSoldQuantities: Record<string, number> = {};

      for (const sale of productSales) {
        const item = sale.items.find((it) => it.productId === product.id && !it.productVariantId);
        if (item) {
          totalSold += item.quantity;
          const peer = sale.updatedBy || 'local';
          peerSoldQuantities[peer] = (peerSoldQuantities[peer] || 0) + item.quantity;
        }
      }

      const maxSoldByAnyPeer = Math.max(...Object.values(peerSoldQuantities), 0);
      const initialStock = product.quantity + maxSoldByAnyPeer;

      if (totalSold > initialStock) {
        const negativeStock = initialStock - totalSold;
        conflicts.push({
          id: `${product.id}::base`,
          productId: product.id,
          productName: product.name,
          initialStock,
          totalSold,
          negativeStock,
          sales: productSales,
        });
      }
    }
  }

  return conflicts;
};
