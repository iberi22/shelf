export interface BaseEntity {
  id: string;
  isActive: boolean;
  updatedBy: string; // Peer ID
  updatedByRole?: any; // P2PRole fallback to avoid cyclic dependency
  updatedAt: string; // ISO String
  signature?: string; // Cryptographic signature of the entity state
}

export interface Branch extends BaseEntity {
  name: string; // 'Bodega Central', 'Sucursal Norte'
  address?: string;
  type?: 'sucursal' | 'bodega';
  isActive: boolean;
  createdAt: number; // timestamp
}

export interface Product extends BaseEntity {
  name: string;
  sku?: string;
  branchId?: string;
  branchName?: string;
  quantity: number;
  price: number;
  cost: number;
  imageUrl?: string;
  reservations?: Record<string, number>;
  color?: string;
  colors?: string[];
  dimensions?: string;
  sizes?: string[];
  capacity?: string;
  material?: string;
  materials?: string[];
  customFields?: Record<string, string>;
  supplierId?: string;
  variantAttributes?: string[];
  variants?: ProductVariant[];
}

export interface ProductVariant extends BaseEntity {
  label?: string;
  sku?: string;
  quantity: number;
  price: number;
  cost: number;
  imageUrl?: string;
  attributes: Record<string, string>;
  reservations?: Record<string, number>;
}

export interface ProductChangeHistoryEntry extends BaseEntity {
  productId: string;
  snapshot: Product;
  sourceAction: string;
}

export interface SaleItem {
  productId: string;
  productVariantId?: string;
  productName: string;
  quantity: number;
  price: number; // price per unit at the time of sale
  cost: number; // cost per unit at the time of sale
  supplierId?: string;
  variantLabel?: string;
}

export interface Sale extends BaseEntity {
  date: string; // ISO string or similar
  items: SaleItem[];
  totalPrice: number;
  profit: number;
  clientId?: string;
  clientName?: string;
  branchId?: string;
}

export interface Client extends BaseEntity {
  name: string;
  phone: string;
  email?: string;
}

export interface Supplier extends BaseEntity {
  name: string;
  phone: string;
  email?: string;
}

export interface PurchaseOrderItem {
  productId: string;
  productVariantId?: string;
  productName: string;
  quantity: number;
  cost: number;
  variantLabel?: string;
}

export interface PurchaseOrder extends BaseEntity {
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  status: 'pending' | 'received' | 'cancelled';
  orderDate: string; // YYYY-MM-DD
  receivedDate?: string; // YYYY-MM-DD
  branchId?: string;
}

export type InventoryFieldType =
  | 'text'
  | 'color'
  | 'measure'
  | 'material'
  | 'multiColor'
  | 'multiMeasure'
  | 'multiMaterial';

export interface InventoryFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: InventoryFieldType;
}

export interface InventoryColorOption {
  name: string;
  hex: string;
}

export interface InventoryConfig {
  variantAttributes: string[];
  fields: InventoryFieldDefinition[];
  measureOptions: string[];
  colorOptions: InventoryColorOption[];
  materialOptions: string[];
  autoApplyProductUpdates: boolean;
  productHistoryLimit: number;
  useEdgeMeshSync: boolean;
}
