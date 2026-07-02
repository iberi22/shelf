import { EdgeMeshProvider } from 'edge-mesh-react';
import type {
  AppState,
  ArqueoSession,
  AuditEntry,
  Branch,
  Client,
  ImportProductsPayload,
  InventoryConfig,
  InvoiceOCRResult,
  P2PRole,
  PeerInfo,
  Product,
  ProductChangeHistoryEntry,
  PurchaseOrder,
  RestoreStatePayload,
  Sale,
  Supplier,
  TeamMember,
} from 'p2p-mesh-core';
import { dbSync, type PeerPermissions, p2pManager } from 'p2p-mesh-core';
import React, {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import EdgeMeshWorkflowBridge from '../components/EdgeMeshWorkflowBridge';
import usePersistedReducer from '../hooks/usePersistedReducer';
import { DEFAULT_INVENTORY_CONFIG, normalizeInventoryConfig } from '../lib/inventoryConfig';
import { getProductVariants, normalizeProduct } from '../lib/productVariants';

const initialState: AppState = {
  products: [],
  sales: [],
  clients: [],
  suppliers: [],
  purchaseOrders: [],
  auditLogs: [],
  peers: [],
  teamMembers: [],
  branches: [],
  inventoryConfig: DEFAULT_INVENTORY_CONFIG,
  localPeerId: null,
  activeBranch: undefined,
  activeBranchId: undefined,
  role: 'admin',
  arqueoSessions: [],
  ocrResults: [],
  pendingEdits: [],
  productChangeHistory: [],
};

type Action =
  | { type: 'ADD_PRODUCT'; payload: Product }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'DELETE_PRODUCT'; payload: string }
  | { type: 'IMPORT_PRODUCTS'; payload: ImportProductsPayload }
  | { type: 'ADD_SALE'; payload: Sale }
  | { type: 'UPDATE_SALE'; payload: Sale }
  | { type: 'DELETE_SALE'; payload: string }
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
  | { type: 'ADD_BRANCH'; payload: Branch }
  | { type: 'UPDATE_BRANCH'; payload: Branch }
  | { type: 'DELETE_BRANCH'; payload: string }
  | { type: 'RESTORE_STATE'; payload: RestoreStatePayload }
  | { type: 'BATCH_UPDATE_PRODUCTS'; payload: { toAdd: Product[]; toUpdate: Product[] } }
  | { type: 'SET_LOCAL_PEER_ID'; payload: string }
  | { type: 'UPDATE_PEERS'; payload: PeerInfo[] }
  | { type: 'SET_ROLE'; payload: P2PRole }
  | { type: 'SET_EXPELLED'; payload: boolean }
  | { type: 'SYNC_STATE'; payload: Partial<AppState> }
  | { type: 'SYNC_ENTITIES'; payload: { collection: keyof AppState; items: unknown[]; deletedIds: string[] } }
  | { type: 'RECOVER_ITEM'; payload: { type: AuditEntry['entityType']; id: string } }
  | { type: 'ADD_ARQUEO_SESSION'; payload: ArqueoSession }
  | { type: 'UPDATE_ARQUEO_SESSION'; payload: ArqueoSession }
  | { type: 'ADD_OCR_RESULT'; payload: InvoiceOCRResult }
  | { type: 'UPDATE_OCR_RESULT'; payload: InvoiceOCRResult }
  | { type: 'UPDATE_PEER_PERMISSIONS'; payload: { targetPeerId: string; permissions: PeerPermissions } }
  | { type: 'UPDATE_PEER_CONFIG'; payload: { targetPeerId: string; role: P2PRole; permissions?: PeerPermissions } }
  | { type: 'UPDATE_INVENTORY_CONFIG'; payload: InventoryConfig }
  | { type: 'RESTORE_PRODUCT_VERSION'; payload: { productId: string; historyId: string } }
  | { type: 'SET_ACTIVE_BRANCH'; payload: string | null }
  | { type: 'CLEAR_AUDIT_LOGS'; payload?: { beforeDate: string } }
  | { type: 'RESET_DATA' };

const createAuditEntry = (
  state: AppState,
  action: string,
  entityId?: string,
  entityType?: AuditEntry['entityType'],
  details?: unknown,
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

const enrich = <T,>(state: AppState, item: T) => ({
  isActive: true,
  updatedAt: new Date().toISOString(),
  updatedBy: state.localPeerId || 'local',
  updatedByRole: state.role || 'collaborator',
  ...item,
});

const getTimestamp = (item: Record<string, unknown>): number => {
  const ts = item.updatedAt || item.timestamp || item.lastSeen || 0;
  return ts ? new Date(ts as string | number).getTime() : 0;
};

/** Helper: extract items from an array property on AppState */
const getCollection = <K extends keyof AppState>(state: AppState, key: K): Array<Record<string, unknown>> => {
  const col = state[key];
  return Array.isArray(col) ? (col as unknown as Array<Record<string, unknown>>) : [];
};

/** Type guard: action has a payload with an `.id` string */
function hasPayloadWithId(action: Action): action is Action & { payload: { id: string } } {
  return (
    'payload' in action &&
    typeof (action as { payload: unknown }).payload === 'object' &&
    (action as { payload: Record<string, unknown> }).payload !== null &&
    typeof (action as { payload: Record<string, unknown> }).payload.id === 'string'
  );
}

/** Type guard: payload is a string (used for delete actions) */
function hasStringPayload(action: Action): action is Action & { payload: string } {
  return 'payload' in action && typeof (action as { payload: unknown }).payload === 'string';
}

const normalizeProductsCollection = (products: Product[] | undefined): Product[] =>
  (products || []).map((product) => normalizeProduct(product));

const createProductHistoryEntry = (
  state: AppState,
  product: Product,
  sourceAction: string,
): ProductChangeHistoryEntry => {
  const snapshot = normalizeProduct(product);
  const snapshotStamp = snapshot.updatedAt || new Date().toISOString();
  const stableStamp = snapshotStamp.replace(/[^a-zA-Z0-9]/g, '');

  return {
    id: `history_${snapshot.id}_${sourceAction}_${stableStamp}`,
    productId: snapshot.id,
    snapshot,
    sourceAction,
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: state.localPeerId || 'local',
    updatedByRole: state.role || 'collaborator',
  };
};

const pushProductHistory = (
  state: AppState,
  history: ProductChangeHistoryEntry[] | undefined,
  entry: ProductChangeHistoryEntry,
): ProductChangeHistoryEntry[] => {
  const limit = normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG).productHistoryLimit;
  const existing = history || [];
  const nextForProduct = [
    entry,
    ...existing.filter((item) => item.productId === entry.productId && item.id !== entry.id),
  ]
    .sort(
      (a, b) =>
        getTimestamp(b as unknown as Record<string, unknown>) - getTimestamp(a as unknown as Record<string, unknown>),
    )
    .slice(0, limit);
  const nextForProductIds = new Set(nextForProduct.map((item) => item.id));
  const otherProducts = existing.filter(
    (item) => item.productId !== entry.productId && !nextForProductIds.has(item.id),
  );

  return [...nextForProduct, ...otherProducts];
};

const updateInventoryQuantity = (
  state: AppState,
  products: Product[],
  productId: string,
  productVariantId: string | undefined,
  delta: number,
): Product[] => {
  const index = products.findIndex((product) => product.id === productId);
  if (index === -1) return products;

  const currentProduct = normalizeProduct(products[index]);
  const variants = getProductVariants(currentProduct);
  const targetVariantId =
    productVariantId && variants.some((variant) => variant.id === productVariantId)
      ? productVariantId
      : variants[0]?.id;

  const nextVariants = variants.map((variant) =>
    variant.id === targetVariantId
      ? {
          ...variant,
          quantity: Math.max(0, variant.quantity + delta),
          updatedAt: new Date().toISOString(),
          updatedBy: state.localPeerId || 'local',
        }
      : variant,
  );

  const nextProduct = normalizeProduct({
    ...currentProduct,
    variants: nextVariants,
  });

  return [...products.slice(0, index), enrich(state, nextProduct), ...products.slice(index + 1)];
};

const syncInventoryStockChanges = (
  state: AppState,
  baseProducts: Product[],
  items: Array<{ productId: string; productVariantId?: string; quantity: number }>,
  direction: 1 | -1,
) => {
  let nextProducts = [...baseProducts];
  const touchedProductIds = new Set<string>();

  for (const item of items) {
    nextProducts = updateInventoryQuantity(
      state,
      nextProducts,
      item.productId,
      item.productVariantId,
      direction * item.quantity,
    );
    touchedProductIds.add(item.productId);
  }

  for (const productId of touchedProductIds) {
    const nextProduct = nextProducts.find((product) => product.id === productId);
    if (nextProduct) {
      dbSync.upsertEntity('products', nextProduct);
    }
  }

  return nextProducts;
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
    if (
      !localItem ||
      getTimestamp(remoteItem as Record<string, unknown>) > getTimestamp(localItem as Record<string, unknown>)
    ) {
      map.set(remoteItem.id, remoteItem);
    }
  }

  return Array.from(map.values());
};

const appReducer = (state: AppState, action: Action): AppState => {
  let newState: AppState;

  switch (action.type) {
    case 'ADD_PRODUCT': {
      const enriched = enrich(state, normalizeProduct(action.payload));
      newState = { ...state, products: [...state.products, enriched] };
      break;
    }
    case 'UPDATE_PRODUCT': {
      const previousProduct = state.products.find((p) => p.id === action.payload.id);
      const enriched = enrich(state, normalizeProduct(action.payload));
      newState = {
        ...state,
        products: state.products.map((p) => (p.id === action.payload.id ? enriched : p)),
        productChangeHistory: previousProduct
          ? pushProductHistory(
              state,
              state.productChangeHistory,
              createProductHistoryEntry(state, previousProduct, 'UPDATE_PRODUCT'),
            )
          : state.productChangeHistory,
      };
      break;
    }
    case 'DELETE_PRODUCT': {
      const previousProduct = state.products.find((p) => p.id === action.payload);
      const deletedItem = {
        ...previousProduct,
        isActive: false,
        updatedAt: new Date().toISOString(),
        updatedBy: state.localPeerId || 'local',
      };
      newState = {
        ...state,
        products: state.products.map((p) => (p.id === action.payload ? (deletedItem as Product) : p)),
        productChangeHistory: previousProduct
          ? pushProductHistory(
              state,
              state.productChangeHistory,
              createProductHistoryEntry(state, previousProduct, 'DELETE_PRODUCT'),
            )
          : state.productChangeHistory,
      };
      break;
    }

    case 'BATCH_UPDATE_PRODUCTS': {
      const { toAdd, toUpdate } = action.payload;
      const enrichedToAdd = toAdd.map((p) => enrich(state, normalizeProduct(p)));
      const enrichedToUpdate = toUpdate.map((p) => enrich(state, normalizeProduct(p)));
      const updatedIds = new Set(enrichedToUpdate.map((p) => p.id));
      const updatedProducts = state.products.map((p) => {
        if (updatedIds.has(p.id)) {
          return enrichedToUpdate.find((up) => up.id === p.id) || p;
        }
        return p;
      });
      const nextHistory = toUpdate.reduce((history, product) => {
        const previousProduct = state.products.find((p) => p.id === product.id);
        return previousProduct
          ? pushProductHistory(
              state,
              history,
              createProductHistoryEntry(state, previousProduct, 'BATCH_UPDATE_PRODUCTS'),
            )
          : history;
      }, state.productChangeHistory);
      newState = { ...state, products: [...updatedProducts, ...enrichedToAdd], productChangeHistory: nextHistory };
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
              const updatedProduct = enrich(state, normalizeProduct({ ...existingProduct, ...newProductData }));
              productsToUpdate.set(updatedProduct.id, updatedProduct);
            }
          }
        } else {
          const productId = `${new Date().toISOString()}_${Math.random()}`;
          productsToAdd.push(
            enrich(
              state,
              normalizeProduct({
                id: productId,
                isActive: true,
                updatedBy: state.localPeerId || 'local',
                updatedAt: new Date().toISOString(),
                ...newProductData,
              } as Product),
            ) as Product,
          );
        }
      });

      let nextHistory = state.productChangeHistory;
      const updatedProductList = state.products.map((p) => {
        if (productsToUpdate.has(p.id)) {
          const updated = productsToUpdate.get(p.id);
          nextHistory = pushProductHistory(state, nextHistory, createProductHistoryEntry(state, p, 'IMPORT_PRODUCTS'));
          return updated || p;
        }
        return p;
      });

      newState = { ...state, products: [...updatedProductList, ...productsToAdd], productChangeHistory: nextHistory };
      break;
    }

    case 'UPDATE_SALE': {
      const oldSale = state.sales.find((s) => s.id === action.payload.id);
      if (!oldSale) {
        return state;
      }

      // Restore quantities from old sale items
      let updatedProducts = state.products;
      for (const oldItem of oldSale.items) {
        updatedProducts = updateInventoryQuantity(
          state,
          updatedProducts,
          oldItem.productId,
          oldItem.productVariantId,
          oldItem.quantity,
        );
      }

      // Deduct quantities from new sale items
      for (const newItem of action.payload.items) {
        updatedProducts = updateInventoryQuantity(
          state,
          updatedProducts,
          newItem.productId,
          newItem.productVariantId,
          -newItem.quantity,
        );
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
        products: updatedProducts,
        sales: state.sales.map((s) => (s.id === action.payload.id ? salePayload : s)),
      };
      break;
    }

    case 'DELETE_SALE': {
      const deletedSale = state.sales.find((s) => s.id === action.payload);
      let productsAfterDelete = state.products;

      // Restore quantities when soft-deleting a sale
      if (deletedSale) {
        for (const item of deletedSale.items) {
          productsAfterDelete = updateInventoryQuantity(
            state,
            productsAfterDelete,
            item.productId,
            item.productVariantId,
            item.quantity,
          );
        }
      }

      newState = {
        ...state,
        products: productsAfterDelete,
        sales: state.sales.map((s) =>
          s.id === action.payload
            ? { ...s, isActive: false, updatedAt: new Date().toISOString(), updatedBy: state.localPeerId || 'local' }
            : s,
        ),
      };
      break;
    }

    case 'ADD_SALE': {
      let newProducts = [...state.products];
      for (const item of action.payload.items) {
        newProducts = updateInventoryQuantity(
          state,
          newProducts,
          item.productId,
          item.productVariantId,
          -item.quantity,
        );
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
        products = [...state.products];
        for (const poItem of newPO.items) {
          products = updateInventoryQuantity(
            state,
            products,
            poItem.productId,
            poItem.productVariantId,
            poItem.quantity,
          );
        }
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
    case 'ADD_BRANCH':
      newState = { ...state, branches: [...state.branches, enrich(state, action.payload)] };
      break;
    case 'UPDATE_BRANCH':
      newState = {
        ...state,
        branches: state.branches.map((b) => (b.id === action.payload.id ? enrich(state, action.payload) : b)),
      };
      break;
    case 'DELETE_BRANCH':
      newState = {
        ...state,
        branches: state.branches.map((b) =>
          b.id === action.payload ? { ...b, isActive: false } : b,
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
      if (action.payload === 'admin' && !dbSync.isLocalAuthority()) {
        return state;
      }
      return { ...state, role: action.payload };

    case 'SET_EXPELLED':
      return { ...state, isExpelled: action.payload };






    case 'UPDATE_PEER_PERMISSIONS': {
      if (action.payload.targetPeerId === state.localPeerId) {
        return {
          ...state,
          permissions: action.payload.permissions,
          peers: state.peers.map((p) =>
            p.id === action.payload.targetPeerId ? { ...p, permissions: action.payload.permissions } : p,
          ),
        };
      }
      return {
        ...state,
        peers: state.peers.map((p) =>
          p.id === action.payload.targetPeerId ? { ...p, permissions: action.payload.permissions } : p,
        ),
      };
    }

    case 'UPDATE_PEER_CONFIG': {
      const { targetPeerId, role, permissions } = action.payload;
      if (targetPeerId === state.localPeerId) {
        const normalizedRole = role === 'admin' && !dbSync.isLocalAuthority() ? 'collaborator' : role;
        return {
          ...state,
          role: normalizedRole,
          permissions: permissions || state.permissions,
          peers: state.peers.map((p) =>
            p.id === targetPeerId ? { ...p, role: normalizedRole, permissions: permissions || p.permissions } : p,
          ),
        };
      }

      const peerExists = state.peers.some((p) => p.id === targetPeerId);
      const peers = peerExists
        ? state.peers.map((p) =>
            p.id === targetPeerId ? { ...p, role, permissions: permissions || p.permissions } : p,
          )
        : [
            ...state.peers,
            {
              id: targetPeerId,
              role,
              permissions,
              lastSeen: new Date().toISOString(),
            },
          ];

      return { ...state, peers };
    }

    case 'UPDATE_INVENTORY_CONFIG': {
      return {
        ...state,
        inventoryConfig: normalizeInventoryConfig(action.payload),
      };
    }

    case 'RESTORE_PRODUCT_VERSION': {
      const historyEntry = state.productChangeHistory.find((entry) => entry.id === action.payload.historyId);
      if (!historyEntry || historyEntry.productId !== action.payload.productId) return state;

      const currentProduct = state.products.find((product) => product.id === action.payload.productId);
      const restoredProduct: Product = {
        ...normalizeProduct(historyEntry.snapshot),
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: state.localPeerId || 'local',
        updatedByRole: state.role || 'collaborator',
      };

      return {
        ...state,
        products: state.products.map((product) =>
          product.id === action.payload.productId ? restoredProduct : product,
        ),
        productChangeHistory: currentProduct
          ? pushProductHistory(
              state,
              state.productChangeHistory,
              createProductHistoryEntry(state, currentProduct, 'RESTORE_PRODUCT_VERSION'),
            )
          : state.productChangeHistory,
      };
    }

    case 'SYNC_STATE': {
      const p = action.payload;
      return {
        ...state,
        products: mergeCollections(
          normalizeProductsCollection(state.products),
          normalizeProductsCollection(p.products),
        ),
        sales: mergeCollections(state.sales, p.sales),
        clients: mergeCollections(state.clients, p.clients),
        suppliers: mergeCollections(state.suppliers, p.suppliers),
        purchaseOrders: mergeCollections(state.purchaseOrders, p.purchaseOrders),
        auditLogs: mergeCollections(state.auditLogs, p.auditLogs),
        arqueoSessions: mergeCollections(state.arqueoSessions, p.arqueoSessions),
        ocrResults: mergeCollections(state.ocrResults, p.ocrResults),
        teamMembers: mergeCollections(state.teamMembers, p.teamMembers),
        branches: mergeCollections(state.branches, p.branches),
        productChangeHistory: mergeCollections(state.productChangeHistory, p.productChangeHistory),
        inventoryConfig: normalizeInventoryConfig(p.inventoryConfig || state.inventoryConfig),
        peers: mergeCollections(state.peers, p.peers),
        role: p.role || state.role,
        permissions: p.permissions || state.permissions,
        pendingEdits: p.pendingEdits || state.pendingEdits || [],
      };
    }

    case 'SYNC_ENTITIES': {
      const { collection, items, deletedIds } = action.payload;
      const updatedIds = new Set(items.map((i: unknown) => (i as Record<string, unknown>).id as string));
      const deletedIdsSet = new Set(deletedIds);

      const existingItems = getCollection(state, collection);
      const filteredExisting = existingItems.filter(
        (i) => !updatedIds.has(i.id as string) && !deletedIdsSet.has(i.id as string),
      );

      const nextItems = collection === 'products' ? normalizeProductsCollection(items as Product[]) : items;

      return {
        ...state,
        [collection]: [...filteredExisting, ...nextItems],
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



    case 'SET_ACTIVE_BRANCH':
      dbSync.activeBranchId = action.payload || null;
      return { ...state, activeBranch: action.payload || undefined, activeBranchId: action.payload || undefined };



    case 'RESTORE_STATE':
      return {
        ...initialState,
        ...action.payload,
        products: normalizeProductsCollection(action.payload.products),
        productChangeHistory: action.payload.productChangeHistory || [],
        inventoryConfig: normalizeInventoryConfig(action.payload.inventoryConfig || initialState.inventoryConfig),
      };

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
  const mutationActions = ['ADD', 'UPDATE', 'DELETE', 'IMPORT', 'BATCH', 'RECOVER', 'RESTORE_PRODUCT'];
  if (mutationActions.some((prefix) => action.type.startsWith(prefix))) {
    let details: unknown;

    if (action.type.includes('IMPORT') || action.type.includes('BATCH')) {
      details = action.payload;
    } else if (action.type.startsWith('UPDATE_') && hasPayloadWithId(action)) {
      const typeMap: Record<string, keyof AppState> = {
        UPDATE_PRODUCT: 'products',
        UPDATE_SALE: 'sales',
        UPDATE_CLIENT: 'clients',
        UPDATE_SUPPLIER: 'suppliers',
        UPDATE_PURCHASE_ORDER: 'purchaseOrders',
        UPDATE_ARQUEO_SESSION: 'arqueoSessions',
        UPDATE_OCR_RESULT: 'ocrResults',
      };
      const stateKey = typeMap[action.type];
      if (stateKey) {
        const collection = getCollection(state, stateKey) as Array<Record<string, unknown>>;
        const oldItem = collection.find((i) => i.id === action.payload.id);
        if (oldItem && 'id' in oldItem) {
          const diff: Record<string, { old: unknown; new: unknown }> = {};
          const payload = action.payload as Record<string, unknown>;
          const oldRecord = oldItem as Record<string, unknown>;
          for (const key in payload) {
            if (payload[key] !== oldRecord[key] && key !== 'updatedAt' && key !== 'updatedBy') {
              diff[key] = { old: oldRecord[key], new: payload[key] };
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

    const entityId = hasPayloadWithId(action)
      ? action.payload.id
      : hasStringPayload(action)
        ? action.payload
        : undefined;

    const auditEntry = createAuditEntry(
      state,
      action.type,
      entityId,
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
    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      window.__shelfAppStateForTest = state;
    }
  }, [state]);

  const edgeMeshConfig = useMemo(() => {
    if (!state.localPeerId) return null;
    return {
      localPeerId: state.localPeerId,
      transport: {
        send: (to: string, data: Uint8Array) =>
          p2pManager.sendTo(to, { type: 'EDGE_MESH_SYNC', payload: data } as unknown as Parameters<
            typeof p2pManager.sendTo
          >[1]),
        broadcast: (data: Uint8Array) =>
          p2pManager.broadcast({ type: 'EDGE_MESH_SYNC', payload: data } as unknown as Parameters<
            typeof p2pManager.broadcast
          >[0]),
        onMessage: (callback: (from: string, data: Uint8Array) => void) => {
          p2pManager.onMessage((msg: unknown, from: string) => {
            const typedMsg = msg as { type: string; payload: Uint8Array };
            if (typedMsg.type === 'EDGE_MESH_SYNC') {
              callback(from, typedMsg.payload);
            }
          });
        },
        onPeerConnect: (_callback: (peerId: string) => void) => {
          // Simplified, ideally p2pManager should expose this cleanly
        },
        onPeerDisconnect: (_callback: (peerId: string) => void) => {
          // Simplified
        },
      },
    };
  }, [state.localPeerId]);

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
        // Only dispatch metadata updates here; entities are handled granularly by onObserve
        rawDispatch({
          type: 'SYNC_STATE',
          payload: {
            inventoryConfig: remoteState.inventoryConfig,
            role: remoteState.role,
            permissions: remoteState.permissions,
          },
        });
      }

      // Expulsion check — with grace period to avoid false positives during init
      if (dbSync.localPeerId && isSyncInitialized.current) {
        const linkedNodes = dbSync.getLinkedNodes();
        const masterId = dbSync.getMasterPeerId();

        if (masterId && masterId !== dbSync.localPeerId && linkedNodes.length > 0) {
          const myNode = linkedNodes.find((node) => node.id === dbSync.localPeerId);
          const isExplicitlyExpelled =
            myNode && 'status' in myNode && (myNode as { status: string }).status === 'expelled';
          const isMissing = !myNode;

          // Only expel if explicitly marked as expelled, not just missing from linkedNodes
          if (isExplicitlyExpelled) {
            console.warn('[P2P Mesh] Expelled by Master Node');
            p2pManager.disconnect();
            rawDispatch({ type: 'RESET_DATA' });
            rawDispatch({ type: 'SET_EXPELLED', payload: true });
          } else if (isMissing) {
            // Unexpcted absence — request full state to re-sync, don't wipe
            console.log('[P2P Mesh] Peer not in linkedNodes yet (stale sync). Requesting state refresh...');
            p2pManager.broadcast({ type: 'REQUEST_FULL_STATE', payload: {} } as unknown as Parameters<
              typeof p2pManager.broadcast
            >[0]);
          }
        }
      }
    });

    // Setup P2P Handlers
    p2pManager.onConnectionChange((_peers) => {
      const remoteState = dbSync.getState(dbSync.localPeerId);
      rawDispatch({
        type: 'SYNC_STATE',
        payload: remoteState,
      });
    });

    // Expose for Playwright testing
    if (typeof window !== 'undefined') {
      window._p2pManagerForTest = p2pManager;
      window._dbSyncForTest = dbSync;
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
      const payload = 'payload' in action ? (action as { payload: unknown }).payload : undefined;
      type Payload = unknown;
      const p = payload as Payload;
      const currentState = stateRef.current;
      const syncProductHistoryEntry = (product: Product | undefined, sourceAction: string) => {
        if (!product) return;
        dbSync.upsertEntity('productChangeHistory', createProductHistoryEntry(currentState, product, sourceAction));
      };

      if (typeStr === 'BATCH_UPDATE_PRODUCTS') {
        const { toAdd, toUpdate } = p as { toAdd: Record<string, unknown>[]; toUpdate: Record<string, unknown>[] };
        toAdd.forEach((item: Record<string, unknown>) => {
          const upsertPayload: Record<string, unknown> = {
            isActive: true,
            updatedAt: new Date().toISOString(),
            updatedBy: currentState.localPeerId || 'local',
            updatedByRole: currentState.role || 'collaborator',
            ...item,
          };
          dbSync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
        });
        toUpdate.forEach((item: Record<string, unknown>) => {
          const baseProduct = currentState.products.find((product) => product.id === item.id);
          syncProductHistoryEntry(baseProduct, 'BATCH_UPDATE_PRODUCTS');
          const upsertPayload: Record<string, unknown> = {
            isActive: true,
            updatedAt: new Date().toISOString(),
            updatedBy: currentState.localPeerId || 'local',
            updatedByRole: currentState.role || 'collaborator',
            ...item,
            __baseUpdatedAt: baseProduct?.updatedAt,
          };
          dbSync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
        });
      } else if (typeStr === 'IMPORT_PRODUCTS') {
        const { products: newProductsData, strategy } = p as {
          products: Record<string, unknown>[];
          strategy: string;
        };
        const existingSkus = new Map<string, Product>();
        currentState.products.forEach((product) => {
          if (product.sku) existingSkus.set(product.sku, product);
        });

        newProductsData.forEach((newProductData: Record<string, unknown>) => {
          const sku = newProductData.sku as string | undefined;
          if (sku && existingSkus.has(sku)) {
            if (strategy === 'update') {
              const existingProduct = existingSkus.get(sku);
              if (existingProduct) {
                syncProductHistoryEntry(existingProduct, 'IMPORT_PRODUCTS');
                const upsertPayload: Record<string, unknown> = {
                  ...existingProduct,
                  isActive: true,
                  updatedAt: new Date().toISOString(),
                  updatedBy: currentState.localPeerId || 'local',
                  updatedByRole: currentState.role || 'collaborator',
                  ...newProductData,
                  __baseUpdatedAt: existingProduct.updatedAt,
                };
                dbSync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
              }
            }
          } else {
            const upsertPayload: Record<string, unknown> = {
              isActive: true,
              updatedAt: new Date().toISOString(),
              updatedBy: currentState.localPeerId || 'local',
              updatedByRole: currentState.role || 'collaborator',
              id: `${new Date().toISOString()}_${Math.random()}`,
              ...newProductData,
            };
            dbSync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
          }
        });
      } else if (typeStr === 'RESTORE_PRODUCT_VERSION') {
        const restorePayload = p as { historyId: string; productId: string };
        const historyEntry = currentState.productChangeHistory.find((entry) => entry.id === restorePayload.historyId);
        const currentProduct = currentState.products.find((product) => product.id === restorePayload.productId);
        if (historyEntry && currentProduct) {
          syncProductHistoryEntry(currentProduct, 'RESTORE_PRODUCT_VERSION');
          const upsertPayload: Record<string, unknown> = {
            ...normalizeProduct(historyEntry.snapshot),
            isActive: true,
            updatedAt: new Date().toISOString(),
            updatedBy: currentState.localPeerId || 'local',
            updatedByRole: currentState.role || 'collaborator',
            __baseUpdatedAt: currentProduct.updatedAt,
          };
          dbSync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
        }
      } else if (typeStr === 'ADD_SALE') {
        const saleP = p as Sale;
        const salePayload = enrich(currentState, saleP);
        dbSync.upsertEntity('sales', salePayload);
        syncInventoryStockChanges(currentState, currentState.products, saleP.items || [], -1);
      } else if (typeStr === 'UPDATE_SALE') {
        const saleP = p as Sale;
        const oldSale = currentState.sales.find((sale) => sale.id === saleP.id);
        if (oldSale) {
          const adjustedProducts = syncInventoryStockChanges(
            currentState,
            currentState.products,
            oldSale.items || [],
            1,
          );
          syncInventoryStockChanges(currentState, adjustedProducts, saleP.items || [], -1);
        }
        dbSync.upsertEntity('sales', enrich(currentState, saleP));
      } else if (typeStr === 'DELETE_SALE') {
        const saleId = p as string;
        const deletedSale = currentState.sales.find((sale) => sale.id === saleId);
        if (deletedSale) {
          syncInventoryStockChanges(currentState, currentState.products, deletedSale.items || [], 1);
        }
        const sale = currentState.sales.find((s) => s.id === saleId);
        if (sale) {
          dbSync.upsertEntity('sales', {
            ...sale,
            isActive: false,
            updatedAt: new Date().toISOString(),
            updatedBy: currentState.localPeerId || 'local',
          });
        }
      } else if (typeStr === 'UPDATE_PURCHASE_ORDER') {
        const poP = p as PurchaseOrder;
        const oldPO = currentState.purchaseOrders.find((po) => po.id === poP.id);
        if (oldPO?.status === 'pending' && poP.status === 'received') {
          syncInventoryStockChanges(currentState, currentState.products, poP.items || [], 1);
        }
        dbSync.upsertEntity('purchaseOrders', enrich(currentState, poP));
      } else if (typeStr === 'ADD_TEAM_MEMBER' || typeStr === 'UPDATE_TEAM_MEMBER') {
        const teamP = p as { id: string };
        if (teamP?.id) {
          dbSync.upsertEntity('teamMembers', teamP);
        }
      } else if (typeStr === 'DELETE_TEAM_MEMBER') {
        if (p) {
          dbSync.deleteEntity('teamMembers', p as string);
        }
      } else if (typeStr === 'RECOVER_ITEM') {
        const recoverP = p as { type?: string; id?: string };
        const { type, id } = recoverP || {};
        const collectionMap: Record<string, keyof AppState> = {
          product: 'products',
          sale: 'sales',
          client: 'clients',
          supplier: 'suppliers',
          purchaseOrder: 'purchaseOrders',
        };
        const collection = type ? collectionMap[type] : undefined;
        const item = collection
          ? (getCollection(currentState, collection) as Array<Record<string, unknown>>).find((entry) => entry.id === id)
          : null;
        if (collection && item) {
          dbSync.upsertEntity(collection, {
            ...item,
            isActive: true,
            updatedAt: new Date().toISOString(),
            updatedBy: currentState.localPeerId || 'local',
          } as unknown as Parameters<typeof dbSync.upsertEntity>[1]);
        }
      } else if (typeStr === 'CLEAR_AUDIT_LOGS') {
        const clearP = p as { beforeDate?: string };
        const beforeDate = clearP?.beforeDate ? new Date(clearP.beforeDate).getTime() : null;
        const logsToDelete = currentState.auditLogs.filter((log) => {
          if (beforeDate === null) return true;
          return new Date(log.timestamp).getTime() < beforeDate;
        });
        logsToDelete.forEach((log: AuditEntry) => {
          dbSync.deleteEntity('auditLogs', log.id);
        });
      } else if (typeStr.startsWith('ADD_') || typeStr.startsWith('UPDATE_')) {
        const addUpdateP = p as { id: string };
        if (addUpdateP?.id) {
          const collectionMap: Record<string, keyof AppState> = {
            PRODUCT: 'products',
            SALE: 'sales',
            CLIENT: 'clients',
            SUPPLIER: 'suppliers',
            PURCHASE_ORDER: 'purchaseOrders',
            ARQUEO_SESSION: 'arqueoSessions',
            OCR_RESULT: 'ocrResults',
            TEAM_MEMBER: 'teamMembers',
            BRANCH: 'branches',
          };
          for (const [key, collection] of Object.entries(collectionMap)) {
            if (typeStr.includes(key)) {
              if (collection === 'products' && typeStr === 'UPDATE_PRODUCT') {
                syncProductHistoryEntry(
                  currentState.products.find((product) => product.id === addUpdateP.id),
                  'UPDATE_PRODUCT',
                );
              }
              const syncPayload: Record<string, unknown> =
                collection === 'products'
                  ? {
                      ...normalizeProduct(addUpdateP as unknown as Product),
                      isActive: true,
                      updatedAt: new Date().toISOString(),
                      updatedBy: currentState.localPeerId || 'local',
                      updatedByRole: currentState.role || 'collaborator',
                      __baseUpdatedAt: currentState.products.find((product) => product.id === addUpdateP.id)?.updatedAt,
                    }
                  : {
                      ...addUpdateP,
                      isActive: true,
                      updatedAt: new Date().toISOString(),
                      updatedBy: currentState.localPeerId || 'local',
                      updatedByRole: currentState.role || 'collaborator',
                      branchId: (addUpdateP as any).branchId || undefined,
                    };
              dbSync.upsertEntity(collection, syncPayload as Parameters<typeof dbSync.upsertEntity>[1]);
              break;
            }
          }
        }
      } else if (typeStr.startsWith('DELETE_')) {
        const deleteP = p as { id?: string } | string;
        const id = typeof deleteP === 'string' ? deleteP : deleteP?.id;
        if (id) {
          const collectionMap: Record<string, keyof AppState> = {
            PRODUCT: 'products',
            SALE: 'sales',
            CLIENT: 'clients',
            SUPPLIER: 'suppliers',
            PURCHASE_ORDER: 'purchaseOrders',
            ARQUEO_SESSION: 'arqueoSessions',
            OCR_RESULT: 'ocrResults',
            TEAM_MEMBER: 'teamMembers',
            BRANCH: 'branches',
          };

          for (const [key, collection] of Object.entries(collectionMap)) {
            if (typeStr.includes(key)) {
              const items = getCollection(currentState, collection) as Array<Record<string, unknown>>;
              const item = items.find((i) => i.id === id);
              if (item) {
                if (collection === 'products' && typeStr === 'DELETE_PRODUCT') {
                  syncProductHistoryEntry(item as unknown as Product, 'DELETE_PRODUCT');
                }
                const upsertPayload: Record<string, unknown> = {
                  ...item,
                  isActive: false,
                  updatedAt: new Date().toISOString(),
                  updatedBy: currentState.localPeerId || 'local',
                };
                dbSync.upsertEntity(collection, upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
              } else {
                dbSync.deleteEntity(collection, id);
              }
              break;
            }
          }
        }
      } else if (typeStr === 'SET_ACTIVE_BRANCH') {
        const branchId = p as string | null;
        if (branchId !== undefined) {
          p2pManager.setActiveBranch(branchId || '');
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

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <EdgeMeshProvider config={edgeMeshConfig}>
        <EdgeMeshWorkflowBridge state={state} dispatch={rawDispatch} isLoaded={isLoaded} />
        {children}
      </EdgeMeshProvider>
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useApp = useAppContext;


