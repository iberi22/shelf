import * as Y from 'yjs';
import type { AppState, ArqueoSession, InvoiceOCRResult, Product } from './types';
import { logger } from './utils/logger';

/**
 * Distributed Database Manager using Yjs (CRDT)
 * Optimized to use Y.Map for better entity management and eventual consistency merging.
 */
class DatabaseSyncManager {
  public doc: Y.Doc;
  private products: Y.Map<Product>;
  private sales: Y.Map<any>;
  private clients: Y.Map<any>;
  private suppliers: Y.Map<any>;
  private purchaseOrders: Y.Map<any>;
  private auditLogs: Y.Map<any>;
  private arqueoSessions: Y.Map<ArqueoSession>;
  private ocrResults: Y.Map<InvoiceOCRResult>;
  private metadata: Y.Map<any>;
  private linkedNodes: Y.Map<any>;
  public localPeerId: string | null = null;
  /**
   * Guards against premature YJS_UPDATE broadcasts.
   * Set to true only after initWithState() completes.
   */
  public isReady: boolean = false;

  constructor() {
    this.doc = new Y.Doc();
    this.products = this.doc.getMap('products');
    this.sales = this.doc.getMap('sales');
    this.clients = this.doc.getMap('clients');
    this.suppliers = this.doc.getMap('suppliers');
    this.purchaseOrders = this.doc.getMap('purchaseOrders');
    this.auditLogs = this.doc.getMap('auditLogs');
    this.arqueoSessions = this.doc.getMap('arqueoSessions');
    this.ocrResults = this.doc.getMap('ocrResults');
    this.metadata = this.doc.getMap('metadata');
    this.linkedNodes = this.doc.getMap('linkedNodes');
  }

  private checkPermissions(collectionName: string, item?: any): boolean {
    if (!this.localPeerId) return true; // Allow during initialization
    
    const selfNode = this.linkedNodes.get(this.localPeerId);
    if (!selfNode) {
      if (this.metadata.get('masterPeerId') === this.localPeerId) return true;
      if (this.metadata.get('role') === 'admin' || this.metadata.get('role') === 'master') return true;
      
      // Default to strict collaborator restrictions if node is unknown!
      if (collectionName === 'auditLogs') {
        if (item && item.action && typeof item.action === 'string' && item.action.includes('PRIVILEGE')) {
          logger.warn(`[SECURITY] Blocked malicious audit log from unknown node`);
          return false;
        }
        return true;
      }
      return false; // Safest fallback
    }
    
    if (selfNode.role === 'admin' || selfNode.role === 'master') return true;
    
    const perms = selfNode.permissions || {};
    switch (collectionName) {
      case 'products': return !!perms.canEditProducts;
      case 'sales': return !!perms.canEditSales;
      case 'clients': return !!perms.canEditClients;
      case 'suppliers': return !!perms.canEditSuppliers;
      case 'purchaseOrders': return !!perms.canEditPurchaseOrders;
      case 'arqueoSessions': return !!perms.canViewArqueo;
      case 'ocrResults': return !!perms.canEditPurchaseOrders;
      case 'auditLogs': 
        // Collaborators can only append normal audit logs, block malicious ones
        if (item && item.action && typeof item.action === 'string' && item.action.includes('PRIVILEGE')) {
          logger.warn(`[SECURITY] Blocked malicious audit log from collaborator`);
          return false;
        }
        return true;
      default: return false;
    }
  }

  /**
   * Helper to perform surgical inserts or updates on a Y.Map
   */
  public upsertEntity<T extends { id: string }>(collectionName: keyof AppState, item: T) {
    if (!this.checkPermissions(collectionName, item)) {
      logger.warn(`[SECURITY] Unauthorized mutation attempt on ${collectionName}`);
      return;
    }

    const yMap = this.getMapForCollection(collectionName);
    if (!yMap) return;

    const getTs = (obj: any) => {
      const ts = obj.updatedAt || obj.timestamp || obj.lastSeen || 0;
      return ts ? new Date(ts).getTime() : 0;
    };

    this.doc.transact(() => {
      const existing = yMap.get(item.id);
      if (!existing || getTs(item) > getTs(existing)) {
        yMap.set(item.id, item);
      }
    }, 'local');
  }

  /**
   * Helper to perform surgical deletes (soft deletes or physical if needed)
   */
  public deleteEntity(collectionName: keyof AppState, id: string) {
    if (!this.checkPermissions(collectionName)) {
      logger.warn(`[SECURITY] Unauthorized deletion attempt on ${collectionName}`);
      return;
    }

    const yMap = this.getMapForCollection(collectionName);
    if (!yMap) return;

    this.doc.transact(() => {
      yMap.delete(id);
    }, 'local');
  }

  private getMapForCollection(collection: string): Y.Map<any> | null {
    switch (collection) {
      case 'products': return this.products;
      case 'sales': return this.sales;
      case 'clients': return this.clients;
      case 'suppliers': return this.suppliers;
      case 'purchaseOrders': return this.purchaseOrders;
      case 'auditLogs': return this.auditLogs;
      case 'arqueoSessions': return this.arqueoSessions;
      case 'ocrResults': return this.ocrResults;
      case 'peers': return this.linkedNodes;
      default: return null;
    }
  }

  /**
   * Syncs the local AppState into the Yjs Doc.
   */
  public initWithState(state: AppState) {
    this.doc.transact(() => {
      const mergeAndSync = <T extends { id: string }>(collectionName: keyof AppState, array: T[] = []) => {
        if (array) {
          for (const item of array) {
            this.upsertEntity(collectionName, item);
          }
        }
      };

      mergeAndSync('products', state.products);
      mergeAndSync('arqueoSessions', state.arqueoSessions);
      mergeAndSync('ocrResults', state.ocrResults);
      mergeAndSync('sales', state.sales);
      mergeAndSync('clients', state.clients);
      mergeAndSync('suppliers', state.suppliers);
      mergeAndSync('purchaseOrders', state.purchaseOrders);
      mergeAndSync('auditLogs', state.auditLogs);

      if (state.peers && state.peers.length > 0) {
        for (const peer of state.peers) {
          this.upsertEntity('peers' as any, peer); // Special case for peers/linkedNodes
        }
      }
    }, 'local');

    // Mark as ready AFTER the initial state has been fully loaded into Y.Doc.
    // This prevents the on('update') handler in p2p.ts from broadcasting
    // empty state before the CRDT has been populated.
    this.isReady = true;
  }

  /**
   * Returns the current state derived from the Yjs Doc.
   */
  public getState(localPeerId?: string | null): Partial<AppState> {
    const peers = Array.from(this.linkedNodes.values());
    const effectiveLocalId = localPeerId || this.localPeerId;

    let resolvedRole: any = 'collaborator';
    let resolvedPermissions: any = undefined;

    if (effectiveLocalId) {
      const selfNode = this.linkedNodes.get(effectiveLocalId);
      if (selfNode) {
        resolvedRole = selfNode.role;
        resolvedPermissions = selfNode.permissions;
      } else {
        const masterId = this.metadata.get('masterPeerId');
        if (masterId === effectiveLocalId) {
          resolvedRole = 'admin';
        }
      }
    } else {
      resolvedRole = this.metadata.get('role') || 'collaborator';
    }

    return {
      products: Array.from(this.products.values()),
      sales: Array.from(this.sales.values()),
      clients: Array.from(this.clients.values()),
      suppliers: Array.from(this.suppliers.values()),
      purchaseOrders: Array.from(this.purchaseOrders.values()),
      auditLogs: Array.from(this.auditLogs.values()),
      arqueoSessions: Array.from(this.arqueoSessions.values()),
      ocrResults: Array.from(this.ocrResults.values()),
      role: resolvedRole,
      permissions: resolvedPermissions,
      peers: peers,
    };
  }

  public getMasterPeerId(): string | null {
    for (const node of this.linkedNodes.values()) {
      if (node.isMaster) return node.id;
    }
    return this.metadata.get('masterPeerId') || null;
  }

  public setMasterPeerId(peerId: string) {
    this.doc.transact(() => {
      this.metadata.set('masterPeerId', peerId);
    }, 'local');
  }

  public getLinkedNodes(): any[] {
    return Array.from(this.linkedNodes.values());
  }

  public updateLinkedNode(peerId: string, info: any) {
    this.doc.transact(() => {
      const existing = this.linkedNodes.get(peerId) || {};
      this.linkedNodes.set(peerId, {
        id: peerId,
        permissions: {
          canViewProducts: true,
          canEditProducts: true,
          canViewSales: true,
          canEditSales: true,
          canViewClients: true,
          canEditClients: true,
          canViewSuppliers: false,
          canEditSuppliers: false,
          canViewPurchaseOrders: false,
          canEditPurchaseOrders: false,
          canViewReports: false,
          canViewArqueo: false,
          canViewDashboard: false,
        },
        ...existing,
        ...info, // Info will override existing, allowing us to force role and isMaster
        lastSeen: new Date().toISOString(),
      });
    }, 'local');
  }

  public updatePeerConfig(peerId: string, role: string, permissions: any) {
    this.doc.transact(() => {
      const existing = this.linkedNodes.get(peerId);
      if (existing) {
        this.linkedNodes.set(peerId, {
          ...existing,
          role,
          permissions,
          isMaster: role === 'admin' ? false : false // Or true if we support multiple masters, but typically we keep the original master
        });
      }
    }, 'local');
  }

  public removeLinkedNode(peerId: string) {
    this.doc.transact(() => {
      this.linkedNodes.delete(peerId);
    }, 'local');
  }

  /** Role override set by p2pManager to sync the effective peer role into database-sync */
  public masterRole: string | null = null;

  private gcIntervals: Map<string, any> = new Map();

  /**
   * Starts periodic garbage collection for a collection.
   * Only nodes with 'admin' or 'master' role will execute the deletion.
   */
  public startGarbageCollection(collectionName: string, maxAgeMs: number, checkIntervalMs: number = 60000) {
    if (this.gcIntervals.has(collectionName)) {
      clearInterval(this.gcIntervals.get(collectionName));
    }

    const interval = setInterval(() => {
      // Resolve role: prefer explicit masterRole (set by p2pManager), then linkedNodes, then metadata
      let role = this.masterRole;
      if (!role) {
        const selfNode = this.localPeerId ? this.linkedNodes.get(this.localPeerId) : null;
        role = selfNode?.role || this.metadata.get('role') || null;
        if (!role && this.localPeerId && this.metadata.get('masterPeerId') === this.localPeerId) {
          role = 'admin';
        }
      }

      // Guard: only admin/master peers execute cleanup
      if (role !== 'admin' && role !== 'master') {
        return;
      }

      logger.debug(`[GC] Running cleanup for ${collectionName} (role: ${role})`);

      const yMap = this.getMapForCollection(collectionName);
      if (!yMap) return;

      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, item] of yMap.entries()) {
        if (item && item.timestamp) {
          const itemTime = new Date(item.timestamp).getTime();
          if (now - itemTime > maxAgeMs) {
            keysToDelete.push(key);
          }
        }
      }

      if (keysToDelete.length > 0) {
        this.doc.transact(() => {
          for (const key of keysToDelete) {
            yMap.delete(key);
          }
        }, 'local');
        logger.log(`[GC] Purged ${keysToDelete.length} old items from ${collectionName}`);
      }
    }, checkIntervalMs);

    this.gcIntervals.set(collectionName, interval);
  }

  public stopGarbageCollection(collectionName: string) {
    if (this.gcIntervals.has(collectionName)) {
      clearInterval(this.gcIntervals.get(collectionName));
      this.gcIntervals.delete(collectionName);
    }
  }

  /**
   * Sync methods.
   * Note: The massive array sync methods (syncProducts, syncSales, etc.) have been removed
   * in favor of surgical atomic updates via upsertEntity and deleteEntity.
   */

  /**
   * Applies an update from a remote peer.
   */
  public applyUpdate(update: Uint8Array, origin?: any) {
    Y.applyUpdate(this.doc, update, origin);
  }

  /**
   * Generates a state vector to synchronize with other peers.
   */
  public getLocalUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Observes changes in the document and triggers a callback.
   * Passes the origin so consumers can distinguish local vs remote updates.
   */
  public onChange(callback: (update: Uint8Array, origin: any) => void) {
    this.doc.on('update', (update, origin) => {
      callback(update, origin);
    });
  }

  /**
   * High-level observer for granular entity updates.
   * Useful for reactive UI updates without full state reconstruction.
   */
  public onObserve(callback: (collection: keyof AppState, items: any[], deletedIds: string[]) => void): () => void {
    const collections: (keyof AppState)[] = [
      'products',
      'sales',
      'clients',
      'suppliers',
      'purchaseOrders',
      'auditLogs',
      'arqueoSessions',
      'ocrResults',
    ];

    const observers = collections.map((col) => {
      const yMap = this.getMapForCollection(col);
      if (!yMap) return null;

      const observer = (event: Y.YMapEvent<any>) => {
        if (event.transaction.origin !== 'local') {
          const items: any[] = [];
          const deletedIds: string[] = [];

          event.changes.keys.forEach((change, key) => {
            if (change.action === 'add' || change.action === 'update') {
              const item = yMap.get(key);
              if (item) items.push(item);
            } else if (change.action === 'delete') {
              deletedIds.push(key);
            }
          });

          if (items.length > 0 || deletedIds.length > 0) {
            callback(col, items, deletedIds);
          }
        }
      };

      yMap.observe(observer);
      return { yMap, observer };
    });

    return () => {
      observers.forEach((obs) => {
        if (obs) obs.yMap.unobserve(obs.observer);
      });
    };
  }
}

export const dbSync = new DatabaseSyncManager();
