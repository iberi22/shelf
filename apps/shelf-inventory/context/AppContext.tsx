import type React from 'react';
import { createContext, type Dispatch, type ReactNode, useContext, useEffect } from 'react';
import usePersistedReducer from '../hooks/usePersistedReducer';
import { dbSync } from 'p2p-mesh-core';
import { p2pManager } from 'p2p-mesh-core';
import type {
  AppState,
  ArqueoSession,
  AuditEntry,
  Client,
  ImportProductsPayload,
  InvoiceOCRResult,
  P2PRole,
  PeerInfo,
  Product,
  PurchaseOrder,
  RestoreStatePayload,
  Sale,
  Supplier,
} from 'p2p-mesh-core';

const initialState: AppState = {
  products: [],
  sales: [],
  clients: [],
  suppliers: [],
  purchaseOrders: [],
  auditLogs: [],
  peers: [],
  localPeerId: null,
  role: 'admin',
  arqueoSessions: [],
  ocrResults: [],
};

type Action =
  | { type: 'ADD_PRODUCT'; payload: Product }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'DELETE_PRODUCT'; payload: string }
  | { type: 'IMPORT_PRODUCTS'; payload: ImportProductsPayload }
  | { type: 'ADD_SALE'; payload: Sale }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: Client }
  | { type: 'DELETE_CLIENT'; payload: string }
  | { type: 'ADD_SUPPLIER'; payload: Supplier }
  | { type: 'UPDATE_SUPPLIER'; payload: Supplier }
  | { type: 'DELETE_SUPPLIER'; payload: string }
  | { type: 'ADD_PURCHASE_ORDER'; payload: PurchaseOrder }
  | { type: 'UPDATE_PURCHASE_ORDER'; payload: PurchaseOrder }
  | { type: 'DELETE_PURCHASE_ORDER'; payload: string }
  | { type: 'RESTORE_STATE'; payload: RestoreStatePayload }
  | { type: 'BATCH_UPDATE_PRODUCTS'; payload: { toAdd: Product[]; toUpdate: Product[] } }
  | { type: 'SET_LOCAL_PEER_ID'; payload: string }
  | { type: 'UPDATE_PEERS'; payload: PeerInfo[] }
  | { type: 'SET_ROLE'; payload: P2PRole }
  | { type: 'SYNC_STATE'; payload: Partial<AppState> }
  | { type: 'RECOVER_ITEM'; payload: { type: AuditEntry['entityType']; id: string } }
  | { type: 'ADD_ARQUEO_SESSION'; payload: ArqueoSession }
  | { type: 'UPDATE_ARQUEO_SESSION'; payload: ArqueoSession }
  | { type: 'ADD_OCR_RESULT'; payload: InvoiceOCRResult }
  | { type: 'UPDATE_OCR_RESULT'; payload: InvoiceOCRResult }
  | { type: 'UPDATE_PEER_PERMISSIONS'; payload: { targetPeerId: string; permissions: any } }
  | { type: 'CLEAR_AUDIT_LOGS'; payload?: { beforeDate: string } }
  | { type: 'RESET_DATA' };

const createAuditEntry = (
  state: AppState,
  action: string,
  entityId?: string,
  entityType?: AuditEntry['entityType'],
  details?: any,
): AuditEntry => ({
  id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  timestamp: new Date().toISOString(),
  peerId: state.localPeerId || 'local',
  action,
  entityId,
  entityType,
  details,
});

const enrich = (state: AppState, item: any) => ({
  isActive: true,
  updatedAt: new Date().toISOString(),
  updatedBy: state.localPeerId || 'local',
  ...item,
});

const appReducer = (state: AppState, action: Action): AppState => {
  let newState: AppState;

  switch (action.type) {
    case 'ADD_PRODUCT': {
      const enriched = enrich(state, action.payload);
      newState = { ...state, products: [...state.products, enriched] };
      break;
    }
    case 'UPDATE_PRODUCT': {
      const enriched = enrich(state, action.payload);
      newState = {
        ...state,
        products: state.products.map((p) => (p.id === action.payload.id ? enriched : p)),
      };
      break;
    }
    case 'DELETE_PRODUCT': {
      const deletedItem = {
        ...state.products.find((p) => p.id === action.payload),
        isActive: false,
        updatedAt: new Date().toISOString(),
        updatedBy: state.localPeerId || 'local',
      };
      newState = {
        ...state,
        products: state.products.map((p) => (p.id === action.payload ? (deletedItem as Product) : p)),
      };
      break;
    }

    case 'BATCH_UPDATE_PRODUCTS': {
      const { toAdd, toUpdate } = action.payload;
      const enrichedToAdd = toAdd.map((p) => enrich(state, p));
      const enrichedToUpdate = toUpdate.map((p) => enrich(state, p));
      const updatedIds = new Set(enrichedToUpdate.map((p) => p.id));
      const updatedProducts = state.products.map((p) => {
        if (updatedIds.has(p.id)) {
          return enrichedToUpdate.find((up) => up.id === p.id) || p;
        }
        return p;
      });
      newState = { ...state, products: [...updatedProducts, ...enrichedToAdd] };
      break;
    }

    case 'IMPORT_PRODUCTS': {
      const { products: newProductsData, strategy } = action.payload;
      const existingSkus = new Map<string, Product>();
      state.products.forEach((p) => {
        if (p.sku) existingSkus.set(p.sku, p);
      });

      const productsToAdd: Product[] = [];
      const productsToUpdate: Map<string, Product> = new Map();

      newProductsData.forEach((newProductData) => {
        const sku = newProductData.sku;
        if (sku && existingSkus.has(sku)) {
          if (strategy === 'update') {
            const existingProduct = existingSkus.get(sku);
            if (existingProduct) {
              const updatedProduct = enrich(state, { ...existingProduct, ...newProductData });
              productsToUpdate.set(updatedProduct.id, updatedProduct);
            }
          }
        } else {
          productsToAdd.push(
            enrich(state, {
              id: `${new Date().toISOString()}_${Math.random()}`,
              ...newProductData,
            }) as Product,
          );
        }
      });

      const updatedProductList = state.products.map((p) => {
        if (productsToUpdate.has(p.id)) {
          const updated = productsToUpdate.get(p.id);
          return updated || p;
        }
        return p;
      });

      newState = { ...state, products: [...updatedProductList, ...productsToAdd] };
      break;
    }

    case 'ADD_SALE': {
      const newProducts = [...state.products];
      for (const item of action.payload.items) {
        const productIndex = newProducts.findIndex((p) => p.id === item.productId);
        if (productIndex !== -1) {
          newProducts[productIndex] = enrich(state, {
            ...newProducts[productIndex],
            quantity: newProducts[productIndex].quantity - item.quantity,
          });
        }
      }

      const salePayload = enrich(state, action.payload);
      if (salePayload.clientId) {
        const client = state.clients.find((c) => c.id === salePayload.clientId);
        if (client) {
          salePayload.clientName = client.name;
        }
      }

      newState = {
        ...state,
        products: newProducts,
        sales: [...state.sales, salePayload],
      };
      break;
    }

    case 'ADD_CLIENT':
      newState = { ...state, clients: [...state.clients, enrich(state, action.payload)] };
      break;
    case 'UPDATE_CLIENT':
      newState = {
        ...state,
        clients: state.clients.map((c) => (c.id === action.payload.id ? enrich(state, action.payload) : c)),
      };
      break;
    case 'DELETE_CLIENT':
      newState = {
        ...state,
        clients: state.clients.map((c) =>
          c.id === action.payload
            ? { ...c, isActive: false, updatedAt: new Date().toISOString(), updatedBy: state.localPeerId || 'local' }
            : c,
        ),
      };
      break;

    case 'ADD_SUPPLIER':
      newState = { ...state, suppliers: [...state.suppliers, enrich(state, action.payload)] };
      break;
    case 'UPDATE_SUPPLIER':
      newState = {
        ...state,
        suppliers: state.suppliers.map((s) => (s.id === action.payload.id ? enrich(state, action.payload) : s)),
      };
      break;
    case 'DELETE_SUPPLIER':
      newState = {
        ...state,
        suppliers: state.suppliers.map((s) =>
          s.id === action.payload
            ? { ...s, isActive: false, updatedAt: new Date().toISOString(), updatedBy: state.localPeerId || 'local' }
            : s,
        ),
      };
      break;

    case 'ADD_PURCHASE_ORDER':
      newState = { ...state, purchaseOrders: [...state.purchaseOrders, enrich(state, action.payload)] };
      break;
    case 'UPDATE_PURCHASE_ORDER': {
      const oldPO = state.purchaseOrders.find((po) => po.id === action.payload.id);
      const newPO = action.payload;
      let products = state.products;

      if (oldPO?.status === 'pending' && newPO.status === 'received') {
        products = state.products.map((p) => {
          const poItem = newPO.items.find((item) => item.productId === p.id);
          if (poItem) {
            return enrich(state, { ...p, quantity: p.quantity + poItem.quantity });
          }
          return p;
        });
      }

      newState = {
        ...state,
        products,
        purchaseOrders: state.purchaseOrders.map((po) => (po.id === newPO.id ? enrich(state, newPO) : po)),
      };
      break;
    }
    case 'DELETE_PURCHASE_ORDER':
      newState = {
        ...state,
        purchaseOrders: state.purchaseOrders.map((po) =>
          po.id === action.payload
            ? { ...po, isActive: false, updatedAt: new Date().toISOString(), updatedBy: state.localPeerId || 'local' }
            : po,
        ),
      };
      break;

    case 'ADD_ARQUEO_SESSION':
      newState = { ...state, arqueoSessions: [...state.arqueoSessions, enrich(state, action.payload)] };
      break;
    case 'UPDATE_ARQUEO_SESSION':
      newState = {
        ...state,
        arqueoSessions: state.arqueoSessions.map((s) =>
          s.id === action.payload.id ? enrich(state, action.payload) : s,
        ),
      };
      break;
    case 'ADD_OCR_RESULT':
      newState = { ...state, ocrResults: [...state.ocrResults, enrich(state, action.payload)] };
      break;
    case 'UPDATE_OCR_RESULT':
      newState = {
        ...state,
        ocrResults: state.ocrResults.map((r) => (r.id === action.payload.id ? enrich(state, action.payload) : r)),
      };
      break;

    case 'SET_LOCAL_PEER_ID':
      return { ...state, localPeerId: action.payload };

    case 'UPDATE_PEERS':
      return { ...state, peers: action.payload };

    case 'SET_ROLE':
      return { ...state, role: action.payload };

    case 'UPDATE_PEER_PERMISSIONS': {
      if (action.payload.targetPeerId === state.localPeerId) {
        return { ...state, permissions: action.payload.permissions };
      }
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === action.payload.targetPeerId ? { ...p, permissions: action.payload.permissions } : p
        ),
      };
    }

    case 'SYNC_STATE':
      return { ...state, ...action.payload };

    case 'RECOVER_ITEM': {
      const { type, id } = action.payload;
      const metadata = { isActive: true, updatedAt: new Date().toISOString(), updatedBy: state.localPeerId || 'local' };
      switch (type) {
        case 'product':
          newState = { ...state, products: state.products.map((p) => (p.id === id ? { ...p, ...metadata } : p)) };
          break;
        case 'client':
          newState = { ...state, clients: state.clients.map((c) => (c.id === id ? { ...c, ...metadata } : c)) };
          break;
        case 'supplier':
          newState = { ...state, suppliers: state.suppliers.map((s) => (s.id === id ? { ...s, ...metadata } : s)) };
          break;
        case 'purchaseOrder':
          newState = {
            ...state,
            purchaseOrders: state.purchaseOrders.map((po) => (po.id === id ? { ...po, ...metadata } : po)),
          };
          break;
        default:
          return state;
      }
      break;
    }

    case 'RESTORE_STATE':
      return { ...initialState, ...action.payload };

    case 'CLEAR_AUDIT_LOGS': {
      if (action.payload?.beforeDate) {
        const beforeTime = new Date(action.payload.beforeDate).getTime();
        return {
          ...state,
          auditLogs: state.auditLogs.filter((log) => new Date(log.timestamp).getTime() >= beforeTime),
        };
      }
      return { ...state, auditLogs: [] };
    }

    case 'RESET_DATA':
      return initialState;

    default:
      return state;
  }

  // Audit Logging for state-mutating actions
  const mutationActions = ['ADD', 'UPDATE', 'DELETE', 'IMPORT', 'BATCH', 'RECOVER'];
  if (mutationActions.some((prefix) => action.type.startsWith(prefix))) {
    const auditEntry = createAuditEntry(
      state,
      action.type,
      (action as any).payload?.id ||
        (typeof (action as any).payload === 'string' ? (action as any).payload : undefined),
      action.type.toLowerCase().includes('product')
        ? 'product'
        : action.type.toLowerCase().includes('sale')
          ? 'sale'
          : action.type.toLowerCase().includes('client')
            ? 'client'
            : action.type.toLowerCase().includes('supplier')
              ? 'supplier'
              : action.type.toLowerCase().includes('purchase')
                ? 'purchaseOrder'
                : undefined,
      action.type.includes('IMPORT') || action.type.includes('BATCH') ? action.payload : undefined,
    );
    newState.auditLogs = [auditEntry, ...newState.auditLogs].slice(0, 1000);
  }

  return newState;
};

interface AppContextType {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch, isLoaded] = usePersistedReducer(appReducer, initialState, 'shelfState');

  // Initialize Distributed Backend
  useEffect(() => {
    // Listen for CRDT updates from other peers
    dbSync.onChange(() => {
      const remoteState = dbSync.getState();
      dispatch({ type: 'SYNC_STATE', payload: remoteState });
    });

    // Setup P2P Handlers
    p2pManager.onConnectionChange((peers) => {
      dispatch({ type: 'UPDATE_PEERS', payload: peers });
    });

    return () => {
      p2pManager.disconnect();
    };
  }, [dispatch]);

  // Populate Yjs CRDT once initial state is loaded from IndexedDB
  useEffect(() => {
    if (isLoaded) {
      dbSync.initWithState(state);
    }
  }, [isLoaded]);

  // Update CRDT when local state changes (mutations)
  // We use a simplified debounce/comparison to avoid infinite loops
  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.products) !== JSON.stringify(currentState.products);

    if (needsSync) {
      dbSync.syncProducts(state.products);
    }
  }, [state.products, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.sales) !== JSON.stringify(currentState.sales);

    if (needsSync) {
      dbSync.syncSales(state.sales);
    }
  }, [state.sales, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.clients) !== JSON.stringify(currentState.clients);

    if (needsSync) {
      dbSync.syncClients(state.clients);
    }
  }, [state.clients, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.suppliers) !== JSON.stringify(currentState.suppliers);

    if (needsSync) {
      dbSync.syncSuppliers(state.suppliers);
    }
  }, [state.suppliers, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.purchaseOrders) !== JSON.stringify(currentState.purchaseOrders);

    if (needsSync) {
      dbSync.syncPurchaseOrders(state.purchaseOrders);
    }
  }, [state.purchaseOrders, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.auditLogs) !== JSON.stringify(currentState.auditLogs);

    if (needsSync) {
      dbSync.syncAuditLogs(state.auditLogs);
    }
  }, [state.auditLogs, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.arqueoSessions) !== JSON.stringify(currentState.arqueoSessions);

    if (needsSync) {
      dbSync.syncArqueoSessions(state.arqueoSessions);
    }
  }, [state.arqueoSessions, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const currentState = dbSync.getState();
    const needsSync = JSON.stringify(state.ocrResults) !== JSON.stringify(currentState.ocrResults);

    if (needsSync) {
      dbSync.syncOCRResults(state.ocrResults);
    }
  }, [state.ocrResults, isLoaded]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useApp = useAppContext;
