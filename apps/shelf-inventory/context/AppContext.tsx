import { EdgeMeshProvider } from 'edge-mesh-react';
import type { AppState, AuditEntry, InventoryConfig, Product, PurchaseOrder, Sale } from 'p2p-mesh-core';
import { dbSync, p2pManager } from 'p2p-mesh-core';
import React, {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import EdgeMeshTransportBinder from '../components/EdgeMeshTransportBinder';
import EdgeMeshWorkflowBridge from '../components/EdgeMeshWorkflowBridge';
import type { PersistStorage } from '../hooks/persistStorage';
import usePersistedReducer from '../hooks/usePersistedReducer';
import { useReactiveProducts } from '../hooks/useReactiveProducts';
import { useReactiveSales } from '../hooks/useReactiveSales';
import { cloudAuthProvider } from '../lib/cloudAuth';
import { CloudSyncProvider } from '../lib/cloudSync';
import { normalizeInventoryConfig } from '../lib/inventoryConfig';
import { normalizeProduct } from '../lib/productVariants';
import { scheduleXavierInventorySync } from '../lib/xavier';

import {
  type Action,
  appReducer,
  createAuditEntryFromAction,
  createProductHistoryEntry,
  enrich,
  getCollection,
  initialState,
  syncInventoryStockChanges,
} from './appReducer';

export type { Action };
export { appReducer, initialState };

interface AppContextType {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode; storage?: PersistStorage; sync?: typeof dbSync }> = ({
  children,
  storage,
  sync = dbSync,
}) => {
  const boundReducer = React.useCallback((s: AppState, a: Action) => appReducer(s, a, sync), [sync]);
  const [reducerState, rawDispatch, isLoaded] = usePersistedReducer(boundReducer, initialState, 'shelfState', {
    storage,
  });
  const isSyncInitialized = React.useRef(false);
  const stateRef = React.useRef<AppState>(reducerState);
  // SHELF-208: CloudSyncProvider owns the shared Yjs doc (Supabase backup) and
  // is created lazily once the persisted state has been loaded.
  const cloudSyncRef = React.useRef<CloudSyncProvider | null>(null);

  // SHELF-103 — Unidirectional reactive pattern (CRDT-only mutations).
  // products/sales are a READ-ONLY projection of the shared Yjs doc: these
  // hooks subscribe directly to the sync CRDT maps, so any local or remote
  // mutation applied to the CRDT (dispatch → sync → Yjs map) reflects
  // instantly. No component sets these collections via setState directly.
  const reactiveProducts = useReactiveProducts({ doc: sync.doc });
  const reactiveSales = useReactiveSales({ doc: sync.doc });

  // Once the CRDT has produced data for a collection, trust the reactive
  // projection unconditionally (also when the map is later emptied). Before
  // hydration / `sync.initWithState`, fall back to the reducer projection
  // to avoid an empty-list flash on app start.
  const reactiveProductsReady = React.useRef(false);
  const reactiveSalesReady = React.useRef(false);
  useEffect(() => {
    if (!reactiveProductsReady.current && reactiveProducts.length > 0) {
      reactiveProductsReady.current = true;
    }
    if (!reactiveSalesReady.current && reactiveSales.length > 0) {
      reactiveSalesReady.current = true;
    }
  }, [reactiveProducts, reactiveSales]);

  const state: AppState = useMemo(() => {
    if (!isLoaded) return reducerState;
    const products =
      reactiveProductsReady.current || reactiveProducts.length > 0 ? reactiveProducts : reducerState.products;
    const sales = reactiveSalesReady.current || reactiveSales.length > 0 ? reactiveSales : reducerState.sales;
    if (products === reducerState.products && sales === reducerState.sales) return reducerState;
    return { ...reducerState, products, sales };
  }, [isLoaded, reducerState, reactiveProducts, reactiveSales]);

  // Keep stateRef in sync for the dispatch closure
  useEffect(() => {
    stateRef.current = state;
    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      window.__shelfAppStateForTest = state;
    }
  }, [state]);

  // Phase B+C+E: shared Y.Doc + single PeerJS via P2PManagerTransport.
  // Wire path: legacy YJS_UPDATE until all peers dual-ready, then EDGE_MESH_ENVELOPE SYNC
  // (p2pManager.yjsWireMode=envelope-when-ready + setEdgeYjsRelay). relayLocalYjs stays false
  // so EdgeMesh does not double-subscribe; host calls mesh.broadcastYjsUpdate via the relay.
  const edgeMeshConfig = useMemo(() => {
    if (!state.localPeerId) return null;
    return {
      nodoId: state.localPeerId as import('edge-mesh').NodoId,
      yDoc: sync.doc as unknown as import('edge-mesh').EdgeMeshConfig['yDoc'],
      storageBackend: 'mem' as const,
      requireAuthz: true,
      defaultSyncNamespace: 'global',
      relayLocalYjs: false,
    };
  }, [state.localPeerId, sync.doc]);

  // Initialize Distributed Backend
  useEffect(() => {
    // Reactive incremental sync
    const unobserve = sync.onObserve((collection: keyof AppState, items: unknown[], deletedIds: string[]) => {
      rawDispatch({ type: 'SYNC_ENTITIES', payload: { collection, items, deletedIds } });
      // Best-effort Xavier memory summary on product sync (DoD app/shelf/instance/{id})
      if (collection === 'products') {
        const s = stateRef.current;
        scheduleXavierInventorySync({
          products: items.length,
          sales: s.sales?.length ?? 0,
          clients: s.clients?.length ?? 0,
          suppliers: s.suppliers?.length ?? 0,
          purchaseOrders: s.purchaseOrders?.length ?? 0,
          action: 'SYNC_ENTITIES',
        });
      }
    });

    // Listen for CRDT updates from other peers (metadata & expulsion)
    sync.onChange((_update: any, _origin: any) => {
      const remoteState = sync.getState(sync.localPeerId);
      // Only dispatch metadata updates here; entities are handled granularly by onObserve
      rawDispatch({
        type: 'SYNC_STATE',
        payload: {
          inventoryConfig: remoteState.inventoryConfig,
          role: remoteState.role,
          permissions: remoteState.permissions,
        },
      });

      // Expulsion check — with grace period to avoid false positives during init
      if (sync.localPeerId && isSyncInitialized.current) {
        const linkedNodes = sync.getLinkedNodes();
        const masterId = sync.getMasterPeerId();

        if (masterId && masterId !== sync.localPeerId && linkedNodes.length > 0) {
          const myNode = linkedNodes.find((node: any) => node.id === sync.localPeerId);
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
      const remoteState = sync.getState(sync.localPeerId);
      rawDispatch({
        type: 'SYNC_STATE',
        payload: remoteState,
      });
    });

    // Initialize P2P node immediately at app startup (not deferred to Settings page)
    p2pManager.init();

    // Poll until localPeerId is available, then store it in state
    const peerIdInterval = setInterval(() => {
      if (p2pManager.localPeerId) {
        rawDispatch({ type: 'SET_LOCAL_PEER_ID', payload: p2pManager.localPeerId });
        clearInterval(peerIdInterval);
      }
    }, 500);

    // Expose for Playwright testing — SOLO en builds de test (nunca en producción)
    if (import.meta.env.VITE_TEST_MODE === 'true' && typeof window !== 'undefined') {
      window._p2pManagerForTest = p2pManager;
      window._dbSyncForTest = sync;
    }

    return () => {
      clearInterval(peerIdInterval);
      unobserve();
      p2pManager.disconnect();
    };
  }, [rawDispatch, sync.getState, sync]);

  // Populate Yjs CRDT once initial state is loaded from IndexedDB
  useEffect(() => {
    if (isLoaded && !isSyncInitialized.current) {
      sync.initWithState(stateRef.current);
      isSyncInitialized.current = true;
    }
  }, [isLoaded, sync.initWithState]);

  // SHELF-208 — Wire cloud sync (Supabase) + cloud auth (Firebase) into the app
  // once the CRDT is hydrated so the first push contains the full inventory state.
  // Both providers self-disable when their env vars are missing:
  //  - CloudSyncProvider.start() runs an immediate sync when online (queued and
  //    replayed otherwise) and registers the online/offline listeners that
  //    flush queued pushes when connectivity returns.
  //  - cloudAuthProvider.restoreSession() re-attaches the Firebase session and
  //    syncLocalToCloud() performs a best-effort local→cloud backup (both no-op
  //    without VITE_FIREBASE_CONFIG).
  useEffect(() => {
    if (!isLoaded) return;
    if (!cloudSyncRef.current) {
      cloudSyncRef.current = new CloudSyncProvider(sync.doc);
    }
    const cloudSync = cloudSyncRef.current;
    if (cloudSync.isConfigured()) {
      cloudSync.start();
    }
    if (cloudAuthProvider.isConfigured()) {
      cloudAuthProvider.restoreSession();
      void cloudAuthProvider.syncLocalToCloud().catch(() => {});
    }
    return () => {
      cloudSync.stop();
    };
  }, [isLoaded, sync.doc]);

  // Start Garbage Collection if Admin/Master
  useEffect(() => {
    if (isLoaded && state.role === 'admin') {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const ONE_HOUR_MS = 60 * 60 * 1000;
      sync.startGarbageCollection('auditLogs', THIRTY_DAYS_MS, ONE_HOUR_MS);
    } else {
      sync.stopGarbageCollection('auditLogs');
    }
  }, [isLoaded, state.role, sync.startGarbageCollection, sync.stopGarbageCollection]);

  // Intercept dispatches to surgically update CRDT without massive JSON.stringify
  const dispatch = useCallback(
    (action: Action) => {
      // 1. Synchronize to CRDT surgically
      if (!isLoaded) {
        rawDispatch(action);
        return;
      }

      if (
        action.type === 'SYNC_STATE' ||
        action.type === 'SYNC_ENTITIES' ||
        action.type === 'RESET_DATA' ||
        action.type === 'RESTORE_STATE'
      ) {
        rawDispatch(action);
        return;
      }

      const typeStr = action.type;
      const payload = 'payload' in action ? (action as { payload: unknown }).payload : undefined;
      type Payload = unknown;
      const p = payload as Payload;
      const currentState = stateRef.current;

      // Unidirectional Pattern: CRDT-bound actions should NOT use rawDispatch directly.
      // They rely on onObserve/onChange to update React state reactively.
      const mutationActions = ['ADD', 'UPDATE', 'DELETE', 'IMPORT', 'BATCH', 'RECOVER', 'RESTORE_PRODUCT'];
      const isCrdtAction = mutationActions.some((prefix) => typeStr.startsWith(prefix));
      const isLocalOnly = [
        'SET_LOCAL_PEER_ID',
        'UPDATE_PEERS',
        'SET_ROLE',
        'SET_EXPELLED',
        'UPDATE_PEER_PERMISSIONS',
        'UPDATE_PEER_CONFIG',
        'SET_ACTIVE_BRANCH',
      ].includes(typeStr);

      if (isLocalOnly) {
        rawDispatch(action);
      }

      // Metadata handling
      if (typeStr === 'UPDATE_INVENTORY_CONFIG') {
        sync.setInventoryConfig(normalizeInventoryConfig(p as InventoryConfig));
        return;
      }

      if (typeStr === 'SET_ACTIVE_BRANCH') {
        const branchId = p as string | null;
        if (branchId !== undefined) {
          p2pManager.setActiveBranch(branchId || '');
        }
        return;
      }

      if (!isCrdtAction) return;

      // Audit Log Generation
      const auditEntry = createAuditEntryFromAction(currentState, action);
      sync.upsertEntity('auditLogs', auditEntry);

      const syncProductHistoryEntry = (product: Product | undefined, sourceAction: string) => {
        if (!product) return;
        sync.upsertEntity('productChangeHistory', createProductHistoryEntry(currentState, product, sourceAction));
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
          sync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
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
          sync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
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
                sync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
              }
            }
          } else {
            const upsertPayload: Record<string, unknown> = {
              isActive: true,
              updatedAt: new Date().toISOString(),
              updatedBy: currentState.localPeerId || 'local',
              updatedByRole: currentState.role || 'collaborator',
              id: `${new Date().toISOString()}_${crypto.randomUUID()}`,
              ...newProductData,
            };
            sync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
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
          sync.upsertEntity('products', upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
        }
      } else if (typeStr === 'ADD_SALE') {
        const saleP = p as Sale;
        const salePayload = enrich(currentState, saleP);
        sync.upsertEntity('sales', salePayload);
        syncInventoryStockChanges(currentState, currentState.products, saleP.items || [], -1, sync);
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
          syncInventoryStockChanges(currentState, adjustedProducts, saleP.items || [], -1, sync);
        }
        sync.upsertEntity('sales', enrich(currentState, saleP));
      } else if (typeStr === 'DELETE_SALE') {
        const saleId = p as string;
        const deletedSale = currentState.sales.find((sale) => sale.id === saleId);
        if (deletedSale) {
          syncInventoryStockChanges(currentState, currentState.products, deletedSale.items || [], 1, sync);
        }
        const sale = currentState.sales.find((s) => s.id === saleId);
        if (sale) {
          sync.upsertEntity('sales', {
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
          syncInventoryStockChanges(currentState, currentState.products, poP.items || [], 1, sync);
        }
        sync.upsertEntity('purchaseOrders', enrich(currentState, poP));
      } else if (typeStr === 'ADD_TEAM_MEMBER' || typeStr === 'UPDATE_TEAM_MEMBER') {
        const teamP = p as { id: string };
        if (teamP?.id) {
          sync.upsertEntity('teamMembers', teamP);
        }
      } else if (typeStr === 'DELETE_TEAM_MEMBER') {
        if (p) {
          sync.deleteEntity('teamMembers', p as string);
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
          sync.upsertEntity(collection, {
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
          sync.deleteEntity('auditLogs', log.id);
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
                      branchId: (addUpdateP as { branchId?: string }).branchId || undefined,
                    };
              sync.upsertEntity(collection, syncPayload as Parameters<typeof dbSync.upsertEntity>[1]);
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
                sync.upsertEntity(collection, upsertPayload as Parameters<typeof dbSync.upsertEntity>[1]);
              } else {
                sync.deleteEntity(collection, id);
              }
              break;
            }
          }
        }
      }
    },
    [rawDispatch, isLoaded, sync.upsertEntity, sync.setInventoryConfig, sync.deleteEntity],
  );

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <EdgeMeshProvider config={edgeMeshConfig}>
        <EdgeMeshTransportBinder />
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
