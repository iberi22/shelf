// types.ts

export interface NavItem {
  nameKey: string;
  icon: string;
}

export interface BaseEntity {
  id: string;
  isActive: boolean;
  updatedBy: string; // Peer ID
  updatedAt: string; // ISO String
}

export interface Product extends BaseEntity {
  name: string;
  sku?: string;
  quantity: number;
  price: number;
  cost: number;
  imageUrl?: string;
  color?: string;
  dimensions?: string;
  capacity?: string;
  material?: string;
  supplierId?: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number; // price per unit at the time of sale
  cost: number; // cost per unit at the time of sale
  supplierId?: string;
}

export interface Sale extends BaseEntity {
  date: string; // ISO string or similar
  items: SaleItem[];
  totalPrice: number;
  profit: number;
  clientId?: string;
  clientName?: string;
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
  productName: string;
  quantity: number;
  cost: number;
}

export interface PurchaseOrder extends BaseEntity {
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  status: 'pending' | 'received';
  orderDate: string; // YYYY-MM-DD
  receivedDate?: string; // YYYY-MM-DD
}

export interface User {
  uid: string;
  email: string | null;
  subscriptionTier: 'free' | 'pro' | 'pyme';
  isGuest?: boolean;
}

export type UserRole = 'owner' | 'admin' | 'member';

export type P2PRole = 'admin' | 'collaborator';

export interface TeamMember {
  id: string;
  email: string | null;
  role: UserRole;
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
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  peerId: string;
  action: string;
  entityId?: string;
  entityType?: 'product' | 'sale' | 'client' | 'supplier' | 'purchaseOrder';
  details?: any;
}

export interface StatCardData {
  titleKey: string;
  value: string;
  icon: string;
  change?: string;
  changeType?: 'positive' | 'negative';
}

export interface AppState {
  products: Product[];
  sales: Sale[];
  clients: Client[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  auditLogs: AuditEntry[];
  peers: PeerInfo[];
  localPeerId: string | null;
  role: P2PRole;
  permissions?: PeerPermissions;
  arqueoSessions: ArqueoSession[];
  ocrResults: InvoiceOCRResult[];
}

export type ImportStrategy = 'skip' | 'update';

export interface ImportProductsPayload {
  products: Omit<Product, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>[];
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

export interface InvoiceOCRResult extends BaseEntity {
  imageUrl: string; // Base64 or Firebase Storage URL
  extractedData: ExtractedInvoiceData;
  rawOCRText?: string; // Full OCR text for debugging
  status: 'pending' | 'reviewed' | 'applied';
  createdAt: string;
  appliedToPurchaseOrderId?: string;
  userId?: string;
}

export interface ScannedInvoice {
  id: string;
  ocrResultId: string;
  confirmedData: ExtractedInvoiceData;
  createdAt: string;
  appliedAt?: string;
}

export interface ArqueoSession extends BaseEntity {
  createdAt: string;
  invoices: ScannedInvoice[];
  createdProducts: string[]; // Product IDs created from invoices
  status: 'open' | 'closed';
}
