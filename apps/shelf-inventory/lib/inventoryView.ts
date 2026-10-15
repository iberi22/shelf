import type { Product } from 'p2p-mesh-core';
import type { InventoryFacetFilters, InventoryStockStatus } from '../components/FilterBar';
import { getInventoryFieldValue } from './inventoryConfig';

export const getStockStatus = (product: Product, lowStockThreshold: number): InventoryStockStatus => {
  if (product.quantity <= 0) return 'out';
  if (product.quantity <= lowStockThreshold) return 'low';
  return 'in-stock';
};

export const parseDateParam = (value: string): number => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).getTime();
};

export const extractCategories = (products: Product[], categoryField: any): string[] => {
  const values = new Set<string>();
  for (const product of products) {
    const value = categoryField
      ? getInventoryFieldValue(product, categoryField)
      : (product.customFields?.category ?? '');
    if (value) values.add(value);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
};

export const selectVisibleProducts = (
  sortedProducts: Product[],
  filter: string,
  facetFilters: InventoryFacetFilters,
  inventoryFieldDefinitions: any[],
  categoryField: any,
  lowStockThreshold: number,
): Product[] => {
  let result = sortedProducts;
  if (filter) {
    const q = filter.toLowerCase();
    result = result.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.sku?.toLowerCase().includes(q) ||
        product.color?.toLowerCase().includes(q) ||
        product.dimensions?.toLowerCase().includes(q) ||
        product.capacity?.toLowerCase().includes(q) ||
        product.material?.toLowerCase().includes(q) ||
        Object.values(product.customFields || {}).some((value) => String(value).toLowerCase().includes(q)) ||
        inventoryFieldDefinitions.some((field) => field.label.toLowerCase().includes(q)) ||
        product.variantAttributes?.some((attr: string) => attr.toLowerCase().includes(q)) ||
        product.variants?.some((variant) =>
          Object.values(variant.attributes || {}).some((value: unknown) => String(value).toLowerCase().includes(q)),
        ),
    );
  }

  // SHELF-108: facet filters compose with AND (category ∩ status ∩ price ∩ supplier ∩ dates).
  const { category, status, minPrice, maxPrice, supplierId, dateFrom, dateTo } = facetFilters;
  if (category || status || minPrice !== undefined || maxPrice !== undefined || supplierId || dateFrom || dateTo) {
    result = result.filter((product) => {
      if (category) {
        const value = categoryField
          ? getInventoryFieldValue(product, categoryField)
          : (product.customFields?.category ?? '');
        if (value !== category) return false;
      }
      if (status && getStockStatus(product, lowStockThreshold) !== status) return false;
      if (minPrice !== undefined && product.price < minPrice) return false;
      if (maxPrice !== undefined && product.price > maxPrice) return false;
      if (supplierId && product.supplierId !== supplierId) return false;
      if (dateFrom && Date.parse(product.updatedAt) < parseDateParam(dateFrom)) return false;
      if (dateTo && Date.parse(product.updatedAt) > parseDateParam(dateTo) + 86_400_000 - 1) return false;
      return true;
    });
  }
  return result;
};

export const computeTotals = (products: Product[]) => {
  return products.reduce(
    (acc, product) => {
      acc.totalQuantity += product.quantity || 0;
      acc.totalValue += (product.quantity || 0) * (product.price || 0);
      return acc;
    },
    { totalQuantity: 0, totalValue: 0 },
  );
};
