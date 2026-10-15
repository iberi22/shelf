export type {
  BaseEntity,
  Branch,
  Client,
  InventoryColorOption,
  InventoryConfig,
  InventoryFieldDefinition,
  InventoryFieldType,
  Product,
  ProductChangeHistoryEntry,
  ProductVariant,
  PurchaseOrder,
  PurchaseOrderItem,
  Sale,
  SaleItem,
  Supplier,
} from '@swal/inventory-core';

// types.ts

export interface NavItem {
  nameKey: string;
  icon: string;
}

export interface EntityEditProposal {
  id: string; // unique ID for the proposal (e.g., proposalId)
  entityId: string; // ID of the product or entity being edited
  collectionName: keyof AppState;
  proposedData: any; // The new data proposed by the collaborator
  originalData?: any; // The state of the data before the edit (for 3-way merge)
  peerId: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function mergeUnique(base: string[], extra?: string): string[] {
  if (!isNonEmptyString(extra)) return [...base];
  const value = extra.trim();
  return base.includes(value) ? [...base] : [...base, value];
}

/**
 * Type guard that detects products still carrying data in the deprecated
 * singular fields (color / material) while the plural arrays
 * (colors / materials) are empty.
 */
export function isLegacyProduct(product: import('@swal/inventory-core').Product): boolean {
  const legacyColor = isNonEmptyString(product.color) && !(product.colors && product.colors.length > 0);
  const legacyMaterial = isNonEmptyString(product.material) && !(product.materials && product.materials.length > 0);
  return legacyColor || legacyMaterial;
}

/**
 * Migration helper that moves deprecated singular color / material values
 * into their plural arrays, deduplicating and preserving order.
 */
export function migrateToPlural(product: import('@swal/inventory-core').Product): import('@swal/inventory-core').Product {
  const hasLegacyColor = isNonEmptyString(product.color);
  const hasLegacyMaterial = isNonEmptyString(product.material);
  if (!hasLegacyColor && !hasLegacyMaterial) return product;

  const colors = mergeUnique(product.colors ?? [], product.color);
  const materials = mergeUnique(product.materials ?? [], product.material);

  const { color: _deprecatedColor, material: _deprecatedMaterial, ...rest } = product;
  return { ...rest, colors, materials };
}
export interface User {
  uid: string;
  email: string | null;
  subscriptionTier?: 'free' | 'pro' | 'pyme';
  isGuest?: boolean;
}

export type UserRole = 'owner' | 'admin' | 'member';

export type P2PRole = 'admin' | 'collaborator' | 'vendedor' | 'custom' | 'readonly';

export type TeamMemberRole = 'owner' | P2PRole | 'member';

export interface TeamMember {
  id: string;
  email: string | null;
  role: TeamMemberRole;
}

export function teamRoleToP2PRole(role: TeamMemberRole): P2PRole {
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'vendedor') return 'vendedor';
  if (role === 'custom') return 'custom';
  return 'collaborator'; // collaborator + legacy member
}

export interface PeerPermissions {
  canViewProducts: boolean;
  canEditProducts: boolean;
  canViewSales: boolean;
  canEditSales: boolean;
  canViewClients: boolean;
  canEditClients: boolean;
  canViewSuppliers: boolean;
  canEditSuppliers: boolean;
  canViewPurchaseOrders: boolean;
  canEditPurchaseOrders: boolean;
  canViewReports: boolean;
  canViewArqueo: boolean;
  canViewDashboard: boolean;
}

export interface PeerInfo {
  id: string;
  role: P2PRole;
  lastSeen: string;
  isMaster?: boolean;
  permissions?: PeerPermissions;
  status?: 'connected' | 'verified' | 'offline';
  dsaPublicKey?: string;
  isVerified?: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  peerId: string;
  peerRole?: P2PRole; // Role of the peer that performed the action
  action: string;
  entityId?: string;
  entityType?: 'product' | 'sale' | 'client' | 'supplier' | 'purchaseOrder';
  details?: any;
  signature?: string; // Cryptographic signature of the log entry
}

export interface StatCardData {
  titleKey: string;
  value: string;
  icon: string;
  change?: string;
  changeType?: 'positive' | 'negative';
}

export interface AppState {
  products: import('@swal/inventory-core').Product[];
  sales: import('@swal/inventory-core').Sale[];
  clients: import('@swal/inventory-core').Client[];
  suppliers: import('@swal/inventory-core').Supplier[];
  purchaseOrders: import('@swal/inventory-core').PurchaseOrder[];
  auditLogs: AuditEntry[];
  peers: PeerInfo[];
  teamMembers: TeamMember[];
  inventoryConfig: import('@swal/inventory-core').InventoryConfig;
  localPeerId: string | null;
  role: P2PRole;
  permissions?: PeerPermissions;
  arqueoSessions: ArqueoSession[];
  ocrResults: InvoiceOCRResult[];
  branches: import('@swal/inventory-core').Branch[];
  activeBranch?: string;
  activeBranchId?: string;
  isExpelled?: boolean;
  pendingEdits: EntityEditProposal[];
  productChangeHistory: import('@swal/inventory-core').ProductChangeHistoryEntry[];
}

export type ImportStrategy = 'skip' | 'update';

export interface ImportProductsPayload {
  products: Omit<import('@swal/inventory-core').Product, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>[];
  strategy: ImportStrategy;
}

export type RestoreStatePayload = AppState;

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: number; // 0-1 confidence score
}

export interface ExtractedInvoiceData {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  items: InvoiceLineItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
}

export type InvoiceOCRResult = import('@swal/inventory-core').BaseEntity & {
  imageUrl: string; // Base64 or Firebase Storage URL
  extractedData: ExtractedInvoiceData;
  rawOCRText?: string; // Full OCR text for debugging
  status: 'pending' | 'reviewed' | 'applied';
  createdAt: string;
  appliedToPurchaseOrderId?: string;
  userId?: string;
};

export interface ScannedInvoice {
  id: string;
  ocrResultId: string;
  confirmedData: ExtractedInvoiceData;
  createdAt: string;
  appliedAt?: string;
}

export type ArqueoSession = import('@swal/inventory-core').BaseEntity & {
  createdAt: string;
  invoices: ScannedInvoice[];
  createdProducts: string[]; // Product IDs created from invoices
  status: 'open' | 'closed';
};

