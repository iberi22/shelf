import type { Product } from 'p2p-mesh-core';
import { getStockStatus } from '../inventoryView';
import type { BodegaLocation, BodegaSnapshot } from './contract';

export function bodegaProductId(sourceAppId: string, itemId: string): string {
  return `ext:${sourceAppId}:${itemId}`;
}

export interface BodegaReadModel {
  products: Product[];
  locations: { id: string; name: string; type: string }[];
  currency: string;
  source: {
    appId: string;
    instanceId: string;
    exportedAt: string;
  };
  unmapped: number;
}

export function toReadModel(snapshot: BodegaSnapshot): BodegaReadModel {
  const products: Product[] = [];
  let unmapped = 0;

  const { source, currency, locations, items } = snapshot;

  const locationsOutput = locations.map((loc: BodegaLocation) => ({
    id: loc.id,
    name: loc.name,
    type: loc.type,
  }));

  for (const item of items) {
    if (!item.id || !item.name) {
      unmapped++;
      continue;
    }

    const productId = bodegaProductId(source.appId, item.id);

    const customFields: Record<string, string> = { ...item.customFields };
    if (item.unit !== undefined) {
      customFields.unit = String(item.unit);
    }
    if (item.minStock !== undefined) {
      customFields.minStock = String(item.minStock);
    }

    const product: Product = {
      id: productId,
      name: item.name,
      sku: item.sku,
      branchId: item.locationId,
      quantity: item.quantity,
      price: item.price ?? 0,
      cost: item.cost ?? 0,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      isActive: true,
      updatedBy: `bodega:${source.appId}`,
      updatedAt: source.exportedAt,
    };

    products.push(product);
  }

  return {
    products,
    locations: locationsOutput,
    currency,
    source: {
      appId: source.appId,
      instanceId: source.instanceId,
      exportedAt: source.exportedAt,
    },
    unmapped,
  };
}

export function lowStockCount(model: BodegaReadModel, threshold: number): number {
  let count = 0;
  for (const product of model.products) {
    if (getStockStatus(product, threshold) === 'low') {
      count++;
    }
  }
  return count;
}
