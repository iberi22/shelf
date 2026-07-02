// types.ts

export interface NavItem {
	nameKey: string;
	icon: string;
}

export interface BaseEntity {
	id: string;
	isActive: boolean;
	updatedBy: string; // Peer ID
	updatedByRole?: P2PRole; // Role of the peer that updated
	updatedAt: string; // ISO String
	signature?: string; // Cryptographic signature of the entity state
}

export interface EntityEditProposal {
	id: string; // unique ID for the proposal (e.g., proposalId)
	entityId: string; // ID of the product or entity being edited
	collectionName: keyof AppState;
	proposedData: any; // The new data proposed by the collaborator
	originalData?: any; // The state of the data before the edit (for 3-way merge)
	peerId: string;
	timestamp: string;
	status: "pending" | "approved" | "rejected";
}

export interface Branch extends BaseEntity {
	name: string; // 'Bodega Central', 'Sucursal Norte'
	address?: string;
	type?: "sucursal" | "bodega";
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
	/** @deprecated Use colors[] for multiple colors */
	color?: string;
	colors?: string[];
	dimensions?: string;
	sizes?: string[];
	capacity?: string;
	material?: string;
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
	status: "pending" | "received";
	orderDate: string; // YYYY-MM-DD
	receivedDate?: string; // YYYY-MM-DD
	branchId?: string;
}

export interface User {
	uid: string;
	email: string | null;
	subscriptionTier: "free" | "pro" | "pyme";
	isGuest?: boolean;
}

export type UserRole = "owner" | "admin" | "member";

export type P2PRole = "admin" | "collaborator" | "vendedor" | "custom";

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
	status?: "connected" | "verified" | "offline";
}

export interface AuditEntry {
	id: string;
	timestamp: string;
	peerId: string;
	peerRole?: P2PRole; // Role of the peer that performed the action
	action: string;
	entityId?: string;
	entityType?: "product" | "sale" | "client" | "supplier" | "purchaseOrder";
	details?: any;
	signature?: string; // Cryptographic signature of the log entry
}

export interface StatCardData {
	titleKey: string;
	value: string;
	icon: string;
	change?: string;
	changeType?: "positive" | "negative";
}

export interface AppState {
	products: Product[];
	sales: Sale[];
	clients: Client[];
	suppliers: Supplier[];
	purchaseOrders: PurchaseOrder[];
	auditLogs: AuditEntry[];
	peers: PeerInfo[];
	teamMembers: TeamMember[];
	inventoryConfig: InventoryConfig;
	localPeerId: string | null;
	role: P2PRole;
	permissions?: PeerPermissions;
	arqueoSessions: ArqueoSession[];
	ocrResults: InvoiceOCRResult[];
	branches: Branch[];
	activeBranch?: string;
	activeBranchId?: string;
	isExpelled?: boolean;
	pendingEdits: EntityEditProposal[];
	productChangeHistory: ProductChangeHistoryEntry[];
}

export type ImportStrategy = "skip" | "update";

export interface ImportProductsPayload {
	products: Omit<Product, "id" | "isActive" | "updatedBy" | "updatedAt">[];
	strategy: ImportStrategy;
}

export type RestoreStatePayload = AppState;

export interface ChatMessage {
	role: "user" | "model";
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
	status: "pending" | "reviewed" | "applied";
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
	status: "open" | "closed";
}

export type InventoryFieldType =
	| "text"
	| "color"
	| "measure"
	| "multiColor"
	| "multiMeasure";

export interface InventoryFieldDefinition {
	id: string;
	key: string;
	label: string;
	type: InventoryFieldType;
}

export interface InventoryConfig {
	variantAttributes: string[];
	fields: InventoryFieldDefinition[];
	measureOptions: string[];
	autoApplyProductUpdates: boolean;
	productHistoryLimit: number;
	useEdgeMeshSync: boolean;
}
