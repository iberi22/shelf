// types.ts

export interface NavItem {
  nameKey: string;
  icon: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  quantity: number;
  price: number;
  cost: number;
  imageUrl?: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number; // price per unit at the time of sale
  cost: number; // cost per unit at the time of sale
}

export interface Sale {
  id: string;
  date: string; // ISO string or similar
  items: SaleItem[];
  totalPrice: number;
  profit: number;
  clientId?: string;
  clientName?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

export interface Supplier {
  id: string;
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

export interface PurchaseOrder {
    id: string;
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
}

export type UserRole = 'owner' | 'admin' | 'member';

export interface TeamMember {
  id: string;
  email: string | null;
  role: UserRole;
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
}

export type ImportStrategy = 'skip' | 'update';

export interface ImportProductsPayload {
    products: Omit<Product, 'id'>[];
    strategy: ImportStrategy;
}

export type RestoreStatePayload = AppState;

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}