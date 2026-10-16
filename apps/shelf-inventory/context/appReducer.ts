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
import { dbSync, type PeerPermissions } from 'p2p-mesh-core';
import { DEFAULT_INVENTORY_CONFIG, normalizeInventoryConfig } from '../lib/inventoryConfig';
import { getProductVariants, normalizeProduct } from '../lib/productVariants';

export const initialState: AppState = {
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

export type Action =
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

export const createAuditEntry = (
  state: AppState,
  action: string,
  entityId?: string,
  entityType?: AuditEntry['entityType'],
  details?: unknown,
): AuditEntry => ({
  id: `${Date.now()}_${crypto.randomUUID()}`,
  timestamp: new Date().toISOString(),
  peerId: state.localPeerId || 'local',
  peerRole: state.role || 'collaborator',
  action,
  entityId,
  entityType,
  details,
});

export const createAuditEntryFromAction = (state: AppState, action: Action): AuditEntry => {
  const typeStr = action.type;
  let details: unknown;

  if (typeStr.includes('IMPORT') || typeStr.includes('BATCH')) {
    details = (action as { payload: any }).payload;
  } else if (typeStr.startsWith('UPDATE_') && hasPayloadWithId(action)) {
    const typeMap: Record<string, keyof AppState> = {
      UPDATE_PRODUCT: 'products',
      UPDATE_SALE: 'sales',
      UPDATE_CLIENT: 'clients',
      UPDATE_SUPPLIER: 'suppliers',
      UPDATE_PURCHASE_ORDER: 'purchaseOrders',
      UPDATE_ARQUEO_SESSION: 'arqueoSessions',
      UPDATE_OCR_RESULT: 'ocrResults',
    };
    const stateKey = typeMap[typeStr as keyof typeof typeMap];
    if (stateKey) {
      const collection = getCollection(state, stateKey) as Array<Record<string, unknown>>;
      const oldItem = collection.find((i) => i.id === (action.payload as { id: string }).id);
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
  } else if (typeStr.startsWith('ADD_') || typeStr.startsWith('DELETE_')) {
    details = { payload: (action as { payload: any }).payload };
  }

  const entityId = hasPayloadWithId(action)
    ? (action.payload as { id: string }).id
    : hasStringPayload(action)
      ? action.payload
      : undefined;

  return createAuditEntry(
    state,
    typeStr,
    entityId,
    typeStr.toLowerCase().includes('product')
      ? 'product'
      : typeStr.toLowerCase().includes('sale')
        ? 'sale'
        : typeStr.toLowerCase().includes('client')
          ? 'client'
          : typeStr.toLowerCase().includes('supplier')
            ? 'supplier'
            : typeStr.toLowerCase().includes('purchase')
              ? 'purchaseOrder'
              : undefined,
    details,
  );
};

export const enrich = <T>(state: AppState, item: T) => ({
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
export const getCollection = <K extends keyof AppState>(state: AppState, key: K): Array<Record<string, unknown>> => {
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

export const normalizeProductsCollection = (products: Product[] | undefined): Product[] =>
  (products || []).map((product) => normalizeProduct(product));

export const createProductHistoryEntry = (
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

export const pushProductHistory = (
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

export type AppSync = typeof dbSync;

export const syncInventoryStockChanges = (
  state: AppState,
  baseProducts: Product[],
  items: Array<{ productId: string; productVariantId?: string; quantity: number }>,
  direction: 1 | -1,
  sync: AppSync = dbSync,
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
      sync.upsertEntity('products', nextProduct);
    }
  }

  return nextProducts;
};

export const mergeCollections = <T extends { id: string }>(local: T[], remote: T[] | undefined): T[] => {
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

export const appReducer = (state: AppState, action: Action, sync: AppSync = dbSync): AppState => {
  switch (action.type) {
    case 'ADD_PRODUCT':
    case 'UPDATE_PRODUCT':
    case 'DELETE_PRODUCT':
    case 'BATCH_UPDATE_PRODUCTS':
    case 'IMPORT_PRODUCTS':
    case 'UPDATE_SALE':
    case 'DELETE_SALE':
    case 'ADD_SALE':
    case 'ADD_CLIENT':
    case 'UPDATE_CLIENT':
    case 'DELETE_CLIENT':
    case 'ADD_SUPPLIER':
    case 'UPDATE_SUPPLIER':
    case 'DELETE_SUPPLIER':
    case 'ADD_PURCHASE_ORDER':
    case 'UPDATE_PURCHASE_ORDER':
    case 'DELETE_PURCHASE_ORDER':
    case 'ADD_TEAM_MEMBER':
    case 'UPDATE_TEAM_MEMBER':
    case 'DELETE_TEAM_MEMBER':
    case 'ADD_BRANCH':
    case 'UPDATE_BRANCH':
    case 'DELETE_BRANCH':
    case 'ADD_ARQUEO_SESSION':
    case 'UPDATE_ARQUEO_SESSION':
    case 'ADD_OCR_RESULT':
    case 'UPDATE_OCR_RESULT':
    case 'RECOVER_ITEM':
      // CRDT mutation actions are now handled reactively via SYNC_ENTITIES
      return state;

    case 'SET_LOCAL_PEER_ID':
      return { ...state, localPeerId: action.payload };

    case 'UPDATE_PEERS':
      return { ...state, peers: action.payload };

    case 'SET_ROLE':
      if (action.payload === 'admin' && !sync.isLocalAuthority()) {
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
        const normalizedRole = role === 'admin' && !sync.isLocalAuthority() ? 'collaborator' : role;
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

    case 'SET_ACTIVE_BRANCH':
      sync.activeBranchId = action.payload || undefined;
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
};
