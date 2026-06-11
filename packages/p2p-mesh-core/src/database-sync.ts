import * as Y from 'yjs';
import type { AppState, ArqueoSession, InvoiceOCRResult, Product } from './types';

/**
 * Distributed Database Manager using Yjs (CRDT)
 * Optimized to use Y.Map for better entity management.
 */
class DatabaseSyncManager {
  public doc: Y.Doc;
  private products: Y.Map<Product>;
  private sales: Y.Array<any>;
  private clients: Y.Array<any>;
  private suppliers: Y.Array<any>;
  private purchaseOrders: Y.Array<any>;
  private auditLogs: Y.Array<any>;
  private arqueoSessions: Y.Map<ArqueoSession>;
  private ocrResults: Y.Map<InvoiceOCRResult>;
  private metadata: Y.Map<any>;

  constructor() {
    this.doc = new Y.Doc();
    this.products = this.doc.getMap('products');
    this.sales = this.doc.getArray('sales');
    this.clients = this.doc.getArray('clients');
    this.suppliers = this.doc.getArray('suppliers');
    this.purchaseOrders = this.doc.getArray('purchaseOrders');
    this.auditLogs = this.doc.getArray('auditLogs');
    this.arqueoSessions = this.doc.getMap('arqueoSessions');
    this.ocrResults = this.doc.getMap('ocrResults');
    this.metadata = this.doc.getMap('metadata');
  }

  /**
   * Syncs the local AppState into the Yjs Doc.
   */
  public initWithState(state: AppState) {
    this.doc.transact(() => {
      // Entities (Map)
      for (const product of state.products) {
        this.products.set(product.id, product);
      }

      if (state.arqueoSessions) {
        for (const session of state.arqueoSessions) {
          this.arqueoSessions.set(session.id, session);
        }
      }

      if (state.ocrResults) {
        for (const result of state.ocrResults) {
          this.ocrResults.set(result.id, result);
        }
      }

      // Arrays (Simplified for this version)
      this.sales.delete(0, this.sales.length);
      this.sales.push(state.sales);

      this.clients.delete(0, this.clients.length);
      this.clients.push(state.clients);

      this.suppliers.delete(0, this.suppliers.length);
      this.suppliers.push(state.suppliers);

      this.purchaseOrders.delete(0, this.purchaseOrders.length);
      this.purchaseOrders.push(state.purchaseOrders);

      this.auditLogs.delete(0, this.auditLogs.length);
      this.auditLogs.push(state.auditLogs);

      this.metadata.set('role', state.role);
    }, 'local');
  }

  /**
   * Returns the current state derived from the Yjs Doc.
   */
  public getState(): Partial<AppState> {
    return {
      products: Array.from(this.products.values()),
      sales: this.sales.toArray(),
      clients: this.clients.toArray(),
      suppliers: this.suppliers.toArray(),
      purchaseOrders: this.purchaseOrders.toArray(),
      auditLogs: this.auditLogs.toArray(),
      arqueoSessions: Array.from(this.arqueoSessions.values()),
      ocrResults: Array.from(this.ocrResults.values()),
      role: this.metadata.get('role'),
    };
  }

  /**
   * Syncs products map from a local array.
   */
  public syncProducts(products: Product[]) {
    this.doc.transact(() => {
      // Add or update
      for (const p of products) {
        const existing = this.products.get(p.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
          this.products.set(p.id, p);
        }
      }
      // Handle deletions
      const currentIds = new Set(products.map((p) => p.id));
      for (const id of this.products.keys()) {
        if (!currentIds.has(id)) {
          this.products.delete(id);
        }
      }
    }, 'local');
  }

  public syncArqueoSessions(sessions: ArqueoSession[]) {
    this.doc.transact(() => {
      for (const s of sessions) {
        const existing = this.arqueoSessions.get(s.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(s)) {
          this.arqueoSessions.set(s.id, s);
        }
      }
      const currentIds = new Set(sessions.map((s) => s.id));
      for (const id of this.arqueoSessions.keys()) {
        if (!currentIds.has(id)) {
          this.arqueoSessions.delete(id);
        }
      }
    }, 'local');
  }

  public syncOCRResults(results: InvoiceOCRResult[]) {
    this.doc.transact(() => {
      for (const r of results) {
        const existing = this.ocrResults.get(r.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(r)) {
          this.ocrResults.set(r.id, r);
        }
      }
      const currentIds = new Set(results.map((r) => r.id));
      for (const id of this.ocrResults.keys()) {
        if (!currentIds.has(id)) {
          this.ocrResults.delete(id);
        }
      }
    }, 'local');
  }

  public syncSales(sales: any[]) {
    this.doc.transact(() => {
      this.sales.delete(0, this.sales.length);
      this.sales.push(sales);
    }, 'local');
  }

  public syncClients(clients: any[]) {
    this.doc.transact(() => {
      this.clients.delete(0, this.clients.length);
      this.clients.push(clients);
    }, 'local');
  }

  public syncSuppliers(suppliers: any[]) {
    this.doc.transact(() => {
      this.suppliers.delete(0, this.suppliers.length);
      this.suppliers.push(suppliers);
    }, 'local');
  }

  public syncPurchaseOrders(purchaseOrders: any[]) {
    this.doc.transact(() => {
      this.purchaseOrders.delete(0, this.purchaseOrders.length);
      this.purchaseOrders.push(purchaseOrders);
    }, 'local');
  }

  public syncAuditLogs(auditLogs: any[]) {
    this.doc.transact(() => {
      this.auditLogs.delete(0, this.auditLogs.length);
      this.auditLogs.push(auditLogs);
    }, 'local');
  }

  /**
   * Applies an update from a remote peer.
   */
  public applyUpdate(update: Uint8Array) {
    Y.applyUpdate(this.doc, update);
  }

  /**
   * Generates a state vector to synchronize with other peers.
   */
  public getLocalUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Observes changes in the document and triggers a callback.
   */
  public onChange(callback: (update: Uint8Array) => void) {
    this.doc.on('update', (update, origin) => {
      if (origin !== 'local') {
        callback(update);
      }
    });
  }
}

export const dbSync = new DatabaseSyncManager();
