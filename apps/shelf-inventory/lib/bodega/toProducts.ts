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

  const seenIds = new Set<string>();

  for (const item of items) {
    const trimmedName = typeof item.name === 'string' ? item.name.trim() : '';
    if (!item.id || !trimmedName) {
      unmapped++;
      continue;
    }

    if (seenIds.has(item.id)) {
      unmapped++;
      continue;
    }
    seenIds.add(item.id);

    const productId = bodegaProductId(source.appId, item.id);

    const customFields: Record<string, string> = {};
    if (item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)) {
      for (const [k, v] of Object.entries(item.customFields)) {
        customFields[k] = String(v);
      }
    }
    if (typeof item.unit === 'string') {
      customFields.unit = item.unit;
    }
    if (item.minStock !== undefined) {
      customFields.minStock = String(item.minStock);
    }

    const branchId = typeof item.locationId === 'string' ? item.locationId : undefined;
    const branchName = branchId ? locations.find((l) => l.id === branchId)?.name : undefined;

    const product: Product = {
      id: productId,
      name: trimmedName,
      sku: typeof item.sku === 'string' ? item.sku : undefined,
      branchId: branchId,
      branchName: branchName,
      quantity: typeof item.quantity === 'number' ? item.quantity : 0,
      price: Number.isFinite(item.price) ? item.price : 0,
      cost: Number.isFinite(item.cost) ? item.cost : 0,
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
