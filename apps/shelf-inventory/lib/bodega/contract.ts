export const BODEGA_FORMAT = 'swal-inventory-export/v1';
export const BODEGA_ENC_FORMAT = 'swal-inventory-export-enc/v1';

export interface BodegaLocation {
  id: string;
  name: string;
  type: 'bodega' | 'sucursal';
}

export interface BodegaItem {
  id: string;
  sku?: string;
  name: string;
  quantity: number;
  unit?: string;
  minStock: number;
  cost: number;
  price: number;
  locationId?: string;
  customFields?: Record<string, string>;
}

export interface BodegaMovement {
  id: string;
  itemId: string;
  kind: 'purchase' | 'use' | 'waste' | 'adjust';
  qty: number;
  at: string;
}

export interface BodegaSnapshot {
  format: string;
  source: {
    appId: 'fize' | 'gara-g' | 'shelf';
    instanceId: string;
    schemaVersion: number;
    exportedAt: string;
  };
  currency: string;
  locations: BodegaLocation[];
  items: BodegaItem[];
  movements: BodegaMovement[];
}

export class BodegaFormatError extends Error {
  code: 'formato' | 'clave' | 'alterado';

  constructor(code: 'formato' | 'clave' | 'alterado', message: string) {
    super(message);
    this.name = 'BodegaFormatError';
    this.code = code;
    Object.setPrototypeOf(this, BodegaFormatError.prototype);
  }
}

export function normalizeKind(kind: string): 'purchase' | 'use' | 'waste' | 'adjust' {
  if (kind === 'purchase' || kind === 'use' || kind === 'waste' || kind === 'adjust') {
    return kind;
  }
  return 'adjust';
}

export function signedQty(kind: string, qty: number): number {
  const normKind = normalizeKind(kind);
  const absQty = Math.abs(qty);
  if (normKind === 'use' || normKind === 'waste') {
    return -absQty;
  }
  if (normKind === 'purchase') {
    return absQty;
  }
  return qty;
}
