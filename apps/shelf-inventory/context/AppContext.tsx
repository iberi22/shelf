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
  TeamMember,
} from 'p2p-mesh-core';
import { dbSync, p2pManager } from 'p2p-mesh-core';
import React, { createContext, type Dispatch, type ReactNode, useCallback, useContext, useEffect } from 'react';
import usePersistedReducer from '../hooks/usePersistedReducer';

const initialState: AppState = {
  products: [],
  sales: [],
  clients: [],
  suppliers: [],
  purchaseOrders: [],
  auditLogs: [],
  peers: [],
  teamMembers: [],
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
  | { type: 'ADD_TEAM_MEMBER'; payload: TeamMember }
  | { type: 'UPDATE_TEAM_MEMBER'; payload: TeamMember }
  | { type: 'DELETE_TEAM_MEMBER'; payload: string }
  | { type: 'RESTORE_STATE'; payload: RestoreStatePayload }
  | { type: 'BATCH_UPDATE_PRODUCTS'; payload: { toAdd: Product[]; toUpdate: Product[] } }
  | { type: 'SET_LOCAL_PEER_ID'; payload: string }
  | { type: 'UPDATE_PEERS'; payload: PeerInfo[] }
  | { type: 'SET_ROLE'; payload: P2PRole }
  | { type: 'SET_EXPELLED'; payload: boolean }
  | { type: 'SYNC_STATE'; payload: Partial<AppState> }
  | { type: 'SYNC_ENTITIES'; payload: { collection: keyof AppState; items: any[]; deletedIds: string[] } }
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
  peerRole: state.role || 'collaborator',
  action,
  entityId,
  entityType,
  details,
});

const enrich = (state: AppState, item: any) => ({
  isActive: true,
  updatedAt: new Date().toISOString(),
  updatedBy: state.localPeerId || 'local',
  updatedByRole: state.role || 'collaborator',
  ...item,
});

const getTimestamp = (item: any): number => {
  const ts = item.updatedAt || item.timestamp || item.lastSeen || 0;
  return ts ? new Date(ts).getTime() : 0;
};

const mergeCollections = <T extends { id: string }>(local: T[], remote: T[] | undefined): T[] => {
  if (!remote || remote.length === 0) return local;
  if (local.length === 0) return remote;

  const map = new Map<string, T>();
  for (const item of local) {
    map.set(item.id, item);
  }

  for (const remoteItem of remote) {
    const localItem = map.get(remoteItem.id);
    if (!localItem || getTimestamp(remoteItem) > getTimestamp(localItem)) {
      map.set(remoteItem.id, remoteItem);
    }
  }

  return Array.from(map.values());
};

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

    case 'ADD_TEAM_MEMBER':
      newState = { ...state, teamMembers: [...state.teamMembers, action.payload] };
      break;
    case 'UPDATE_TEAM_MEMBER':
      newState = {
        ...state,
        teamMembers: state.teamMembers.map((m) => (m.id === action.payload.id ? action.payload : m)),
      };
      break;
    case 'DELETE_TEAM_MEMBER':
      newState = {
        ...state,
        teamMembers: state.teamMembers.filter((m) => m.id !== action.payload),
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

    case 'SET_EXPELLED':
      return { ...state, isExpelled: action.payload };

    case 'UPDATE_PEER_PERMISSIONS': {
      if (action.payload.targetPeerId === state.localPeerId) {
        return { ...state, permissions: action.payload.permissions };
      }
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === action.payload.targetPeerId ? { ...p, permissions: action.payload.permissions } : p,
        ),
      };
    }

    case 'SYNC_STATE': {
      const p = action.payload;
      return {
        ...state,
        products: mergeCollections(state.products, p.products),
        sales: mergeCollections(state.sales, p.sales),
        clients: mergeCollections(state.clients, p.clients),
        suppliers: mergeCollections(state.suppliers, p.suppliers),
        purchaseOrders: mergeCollections(state.purchaseOrders, p.purchaseOrders),
        auditLogs: mergeCollections(state.auditLogs, p.auditLogs),
        arqueoSessions: mergeCollections(state.arqueoSessions, p.arqueoSessions),
        ocrResults: mergeCollections(state.ocrResults, p.ocrResults),
        peers: mergeCollections(state.peers, p.peers),
        role: p.role || state.role,
        permissions: p.permissions || state.permissions,
      };
    }

    case 'SYNC_ENTITIES': {
      const { collection, items, deletedIds } = action.payload;
      const existingItems = (state[collection] as any[]) || [];
      const updatedIds = new Set(items.map((i) => i.id));
      const deletedIdsSet = new Set(deletedIds);

      const filteredExisting = existingItems.filter((i) => !updatedIds.has(i.id) && !deletedIdsSet.has(i.id));

      return {
        ...state,
        [collection]: [...filteredExisting, ...items],
      };
    }

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
    let details: any;

    if (action.type.includes('IMPORT') || action.type.includes('BATCH')) {
      details = action.payload;
    } else if (action.type.startsWith('UPDATE_') && (action as any).payload?.id) {
      const typeMap: Record<string, keyof AppState> = {
        UPDATE_PRODUCT: 'products',
        UPDATE_CLIENT: 'clients',
        UPDATE_SUPPLIER: 'suppliers',
        UPDATE_PURCHASE_ORDER: 'purchaseOrders',
        UPDATE_ARQUEO_SESSION: 'arqueoSessions',
        UPDATE_OCR_RESULT: 'ocrResults',
      };
      const stateKey = typeMap[action.type];
      if (stateKey) {
        const oldItem = (state[stateKey] as any[])?.find((i) => i.id === (action as any).payload.id);
        if (oldItem) {
          const diff: any = {};
          for (const key in action.payload as any) {
            if ((action.payload as any)[key] !== oldItem[key] && key !== 'updatedAt' && key !== 'updatedBy') {
              diff[key] = { old: oldItem[key], new: (action.payload as any)[key] };
            }
          }
          details = { diff };
        } else {
          details = { payload: action.payload };
        }
      } else {
        details = { payload: action.payload };
      }
    } else if (action.type.startsWith('ADD_') || action.type.startsWith('DELETE_')) {
      details = { payload: action.payload };
    }

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
      details,
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
  const [state, rawDispatch, isLoaded] = usePersistedReducer(appReducer, initialState, 'shelfState');
  const isSyncInitialized = React.useRef(false);
  const stateRef = React.useRef(state);

  // Keep stateRef in sync for the dispatch closure
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize Distributed Backend
  useEffect(() => {
    // Reactive incremental sync
    const unobserve = dbSync.onObserve((collection, items, deletedIds) => {
      rawDispatch({ type: 'SYNC_ENTITIES', payload: { collection, items, deletedIds } });
    });

    // Listen for CRDT updates from other peers (metadata & expulsion)
    dbSync.onChange((_update, origin) => {
      if (origin !== 'local') {
        const remoteState = dbSync.getState(dbSync.localPeerId);
        // We only sync role/permissions/peers from the full state update to avoid heavy react re-renders
        rawDispatch({
          type: 'SYNC_STATE',
          payload: {
            role: remoteState.role,
            permissions: remoteState.permissions,
            peers: remoteState.peers,
          },
        });
      }

      // Expulsion check!
      if (dbSync.localPeerId) {
        const linkedNodes = dbSync.getLinkedNodes();
        const masterId = dbSync.getMasterPeerId();

        if (masterId && masterId !== dbSync.localPeerId && linkedNodes.length > 0) {
          const isLinked = linkedNodes.some((node) => node.id === dbSync.localPeerId);
          if (!isLinked) {
            console.warn('[P2P Mesh] Expelled by Master Node');
            p2pManager.disconnect();
            rawDispatch({ type: 'RESET_DATA' });
            rawDispatch({ type: 'SET_EXPELLED', payload: true });
          }
        }
      }
    });

    // Setup P2P Handlers
    p2pManager.onConnectionChange((_peers) => {
      const remoteState = dbSync.getState(dbSync.localPeerId);
      rawDispatch({ type: 'SYNC_STATE', payload: remoteState });
    });

    // Expose for Playwright testing
    if (typeof window !== 'undefined') {
      (window as any)._p2pManagerForTest = p2pManager;
      (window as any)._dbSyncForTest = dbSync;
    }

    return () => {
      unobserve();
      p2pManager.disconnect();
    };
  }, [rawDispatch]);

  // Populate Yjs CRDT once initial state is loaded from IndexedDB
  useEffect(() => {
    if (isLoaded && !isSyncInitialized.current) {
      dbSync.initWithState(stateRef.current);
      isSyncInitialized.current = true;
    }
  }, [isLoaded]);

  // Start Garbage Collection if Admin/Master
  useEffect(() => {
    if (isLoaded && state.role === 'admin') {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const ONE_HOUR_MS = 60 * 60 * 1000;
      dbSync.startGarbageCollection('auditLogs', THIRTY_DAYS_MS, ONE_HOUR_MS);
    } else {
      dbSync.stopGarbageCollection('auditLogs');
    }
  }, [isLoaded, state.role]);

  // Intercept dispatches to surgically update CRDT without massive JSON.stringify
  const dispatch = useCallback(
    (action: Action) => {
      // 1. Update local React state
      rawDispatch(action);

      // 2. Synchronize to CRDT surgically
      if (!isLoaded) return;
      if (action.type === 'SYNC_STATE' || action.type === 'SYNC_ENTITIES' || action.type === 'RESET_DATA') return;

      const typeStr = action.type;
      const payload = (action as any).payload;
      const currentState = stateRef.current;

      if (typeStr === 'BATCH_UPDATE_PRODUCTS') {
        const { toAdd, toUpdate } = payload;
        toAdd.forEach((p: any) => {
          dbSync.upsertEntity('products', enrich(currentState, p));
        });
        toUpdate.forEach((p: any) => {
          dbSync.upsertEntity('products', enrich(currentState, p));
        });
      } else if (typeStr === 'IMPORT_PRODUCTS') {
        const { products: newProductsData, strategy } = payload;
        const existingSkus = new Map<string, Product>();
        currentState.products.forEach((p) => {
          if (p.sku) existingSkus.set(p.sku, p);
        });

        newProductsData.forEach((newProductData: any) => {
          const sku = newProductData.sku;
          if (sku && existingSkus.has(sku)) {
            if (strategy === 'update') {
              const existingProduct = existingSkus.get(sku);
              if (existingProduct) {
                dbSync.upsertEntity('products', enrich(currentState, { ...existingProduct, ...newProductData }));
              }
            }
          } else {
            dbSync.upsertEntity(
              'products',
              enrich(currentState, {
                id: `${new Date().toISOString()}_${Math.random()}`,
                ...newProductData,
              }),
            );
          }
        });
      } else if (typeStr === 'ADD_SALE') {
        const salePayload = enrich(currentState, payload);
        dbSync.upsertEntity('sales', salePayload);

        // Decrement product quantities in CRDT
        for (const item of payload.items) {
          const product = currentState.products.find((p) => p.id === item.productId);
          if (product) {
            dbSync.upsertEntity(
              'products',
              enrich(currentState, {
                ...product,
                quantity: product.quantity - item.quantity,
              }),
            );
          }
        }
      } else if (typeStr.startsWith('ADD_') || typeStr.startsWith('UPDATE_')) {
        if (payload?.id) {
          const collectionMap: Record<string, keyof AppState> = {
            PRODUCT: 'products',
            SALE: 'sales',
            CLIENT: 'clients',
            SUPPLIER: 'suppliers',
            PURCHASE_ORDER: 'purchaseOrders',
            ARQUEO_SESSION: 'arqueoSessions',
            OCR_RESULT: 'ocrResults',
          };
          for (const [key, collection] of Object.entries(collectionMap)) {
            if (typeStr.includes(key)) {
              dbSync.upsertEntity(collection, payload);
              break;
            }
          }
        }
      } else if (typeStr.startsWith('DELETE_')) {
        const id = typeof payload === 'string' ? payload : payload?.id;
        if (id) {
          const collectionMap: Record<string, keyof AppState> = {
            PRODUCT: 'products',
            SALE: 'sales',
            CLIENT: 'clients',
            SUPPLIER: 'suppliers',
            PURCHASE_ORDER: 'purchaseOrders',
            ARQUEO_SESSION: 'arqueoSessions',
            OCR_RESULT: 'ocrResults',
          };

          for (const [key, collection] of Object.entries(collectionMap)) {
            if (typeStr.includes(key)) {
              const item = (currentState[collection] as any[]).find((i) => i.id === id);
              if (item) {
                dbSync.upsertEntity(collection, {
                  ...item,
                  isActive: false,
                  updatedAt: new Date().toISOString(),
                  updatedBy: currentState.localPeerId || 'local',
                });
              } else {
                dbSync.deleteEntity(collection, id);
              }
              break;
            }
          }
        }
      }
    },
    [rawDispatch, isLoaded],
  );

  // Sync Audit Logs optimally (O(1) comparison on the first element)
  useEffect(() => {
    if (!isLoaded || state.auditLogs.length === 0) return;
    const latestLocal = state.auditLogs[0];
    const latestCRDT = dbSync.getState().auditLogs?.[0];
    if (!latestCRDT || latestLocal.id !== latestCRDT.id) {
      dbSync.upsertEntity('auditLogs', latestLocal);
    }
  }, [state.auditLogs, isLoaded]);

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
