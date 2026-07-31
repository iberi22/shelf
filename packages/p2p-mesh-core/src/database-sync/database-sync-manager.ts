import * as Y from 'yjs';
import type {
  AppState,
  ArqueoSession,
  AuditEntry,
  Branch,
  Client,
  EntityEditProposal,
  InventoryConfig,
  InvoiceOCRResult,
  P2PRole,
  PeerInfo,
  PeerPermissions,
  Product,
  ProductChangeHistoryEntry,
  PurchaseOrder,
  Sale,
  Supplier,
  TeamMember,
} from '../types';
import { logger } from '../utils/logger';
import type { ConnectionEvent, EntityRecord, LinkedNodeRecord, SyncContext } from './types';

// Re-export types from sub-modules so the barrel export works
export type { ConnectionEvent, EntityRecord, LinkedNodeRecord, SyncEntityRecord } from './types';

import {
  checkPermissions as _checkPermissions,
  checkRemotePermissions as _checkRemotePermissions,
  getAuthorityPeerId as _getAuthorityPeerId,
  getEffectivePeerConfig as _getEffectivePeerConfig,
  isAuthorityPeer as _isAuthorityPeer,
  isLocalAuthority as _isLocalAuthority,
  isPeerConfigMutationAllowed as _isPeerConfigMutationAllowed,
  isPeerVerified as _isPeerVerified,
  isRemotePeerOrigin as _isRemotePeerOrigin,
  isTrustedRemoteWriter as _isTrustedRemoteWriter,
  getDefaultPermissions,
} from './authority-checks';

import {
  checkHostHealth as _checkHostHealth,
  getLinkedNodes as _getLinkedNodes,
  getMasterPeerId as _getMasterPeerId,
  getPeerHistory as _getPeerHistory,
  logConnectionEvent as _logConnectionEvent,
  promoteSuccessor as _promoteSuccessor,
  removeLinkedNode as _removeLinkedNode,
  selectSuccessor as _selectSuccessor,
  setMasterPeerId as _setMasterPeerId,
  updateEphemeralNode as _updateEphemeralNode,
  updateLinkedNode as _updateLinkedNode,
  updatePeerConfig as _updatePeerConfig,
} from './connection-tracking';

import {
  deleteEntity as _deleteEntity,
  getInventoryConfig as _getInventoryConfig,
  getState as _getState,
  initWithState as _initWithState,
  resolvePendingEdit as _resolvePendingEdit,
  setInventoryConfig as _setInventoryConfig,
  startGarbageCollection as _startGarbageCollection,
  stopGarbageCollection as _stopGarbageCollection,
  upsertEntity as _upsertEntity,
  buildCollectionMap,
  getMapForCollection,
  isBranchScoped,
} from './entity-managers';

import {
  applyUpdate as _applyUpdate,
  getDiff as _getDiff,
  getLocalUpdate as _getLocalUpdate,
  getStateVector as _getStateVector,
  registerObservers,
  revertUnauthorizedPrivilegeMaps,
  revertUnauthorizedRemoteChanges,
  snapshotCollectionMaps,
  snapshotPrivilegeMaps,
} from './merge-engine';

/**
 * Distributed Database Manager using Yjs (CRDT)
 * Optimized to use Y.Map for better entity management and eventual consistency merging.
 */
export class DatabaseSyncManager {
  public doc: Y.Doc;
  private products: Y.Map<Product>;
  private sales: Y.Map<Sale>;
  private clients: Y.Map<Client>;
  private suppliers: Y.Map<Supplier>;
  private purchaseOrders: Y.Map<PurchaseOrder>;
  private auditLogs: Y.Map<AuditEntry>;
  private arqueoSessions: Y.Map<ArqueoSession>;
  private ocrResults: Y.Map<InvoiceOCRResult>;
  private teamMembers: Y.Map<TeamMember>;
  private branches: Y.Map<Branch>;
  private metadata: Y.Map<string>;
  private linkedNodes: Y.Map<LinkedNodeRecord>;
  private pendingEdits: Y.Map<EntityEditProposal>;
  private productChangeHistory: Y.Map<ProductChangeHistoryEntry>;
  private ephemeralNodes: Map<string, Partial<LinkedNodeRecord>> = new Map();
  private peerHistory: Map<string, ConnectionEvent[]> = new Map();
  public localPeerId: string | null = null;
  public activeBranchId: string | undefined = undefined;
  private readyCallbacks: (() => void)[] = [];
  private failoverHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private hostFailoverCallbacks: ((payload: { successorId: string; previousMasterId: string | null }) => void)[] = [];
  /**
   * Guards against premature YJS_UPDATE broadcasts.
   * Set to true only after initWithState() completes.
   */
  public isReady: boolean = false;
  /** Role override set by p2pManager to sync the effective peer role into database-sync */
  public masterRole: string | null = null;
  private gcIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  /** Internal collection lookup (for extracted functions). */
  private _collections: Record<string, Y.Map<any>>;

  /** Build the SyncContext for extracted functions. */
  private _ctx(): SyncContext {
    return {
      doc: this.doc,
      localPeerId: this.localPeerId,
      activeBranchId: this.activeBranchId,
      isReady: this.isReady,
      masterRole: this.masterRole,
      metadata: this.metadata,
      linkedNodes: this.linkedNodes,
      ephemeralNodes: this.ephemeralNodes,
      peerHistory: this.peerHistory,
    };
  }

  private getAuthorityPeerId(): string | null {
    return _getAuthorityPeerId(this.metadata);
  }

  public isLocalAuthority(): boolean {
    return _isLocalAuthority(this.localPeerId, this.metadata, this.linkedNodes);
  }

  /** True if peer completed PQC handshake (status verified). */
  public isPeerVerified(peerId?: string | null): boolean {
    return _isPeerVerified(peerId, this.ephemeralNodes);
  }

  /** Public authority check for mesh transport guards. */
  public isAuthorityPeerId(peerId?: string | null): boolean {
    return this.isAuthorityPeer(peerId);
  }

  private isAuthorityPeer(peerId?: string | null): boolean {
    return _isAuthorityPeer(peerId, this.metadata, this.linkedNodes);
  }

  private isPeerConfigMutationAllowed(authorityPeerId: string | null | undefined, targetPeerId: string): boolean {
    return _isPeerConfigMutationAllowed(authorityPeerId, targetPeerId, this.metadata, this.linkedNodes);
  }

  private getEffectivePeerConfig(peerId?: string | null) {
    return _getEffectivePeerConfig(peerId, this._ctx());
  }

  private isBranchScoped(collectionName: string): boolean {
    return isBranchScoped(collectionName);
  }

  constructor() {
    this.doc = new Y.Doc();
    this._collections = buildCollectionMap(this.doc);
    this.products = this._collections.products;
    this.sales = this._collections.sales;
    this.clients = this._collections.clients;
    this.suppliers = this._collections.suppliers;
    this.purchaseOrders = this._collections.purchaseOrders;
    this.auditLogs = this._collections.auditLogs;
    this.arqueoSessions = this._collections.arqueoSessions;
    this.ocrResults = this._collections.ocrResults;
    this.teamMembers = this._collections.teamMembers;
    this.branches = this._collections.branches;
    this.metadata = this._collections.pendingEdits; // Will be overwritten below
    this.linkedNodes = this._collections.linkedNodes;
    this.pendingEdits = this._collections.pendingEdits;
    this.productChangeHistory = this._collections.productChangeHistory;

    // Fix metadata (buildCollectionMap doesn't include metadata)
    this.metadata = this.doc.getMap('metadata');
  }

  private checkPermissions(collectionName: string, item?: Partial<EntityRecord>): boolean {
    return _checkPermissions(this._ctx(), collectionName, item);
  }

  /**
   * Helper to perform surgical inserts or updates on a Y.Map
   */
  public upsertEntity<
    T extends {
      id: string;
      lastSeen?: string;
      action?: string;
      timestamp?: string;
      updatedAt?: string;
      updatedBy?: string;
      __baseUpdatedAt?: string;
    },
  >(collectionName: keyof AppState, item: T) {
    _upsertEntity(this._ctx(), collectionName, item as any, this._collections, this.activeBranchId);
  }

  /**
   * Helper to perform surgical deletes (soft deletes or physical if needed)
   */
  public deleteEntity(collectionName: keyof AppState, id: string) {
    _deleteEntity(this._ctx(), collectionName, id, this._collections, this.activeBranchId);
  }

  /**
   * Admin-only function to resolve a pending edit
   */
  public resolvePendingEdit(proposalId: string, resolution: 'approve' | 'reject', mergedData?: any) {
    _resolvePendingEdit(this._ctx(), proposalId, resolution, mergedData, this._collections, this.activeBranchId);
  }

  private getMapForCollection(collection: string): Y.Map<EntityRecord> | null {
    return getMapForCollection(this.doc, collection, this._collections);
  }

  /**
   * Syncs the local AppState into the Yjs Doc.
   */
  public initWithState(state: AppState) {
    _initWithState(this._ctx(), state, this._collections);

    // Mark as ready AFTER the initial state has been fully loaded into Y.Doc.
    // This prevents the on('update') handler in p2p.ts from broadcasting
    // empty state before the CRDT has been populated.
    this.isReady = true;
    for (const callback of this.readyCallbacks) {
      callback();
    }

    // Start failover monitoring heartbeat (every 30s)
    if (this.failoverHeartbeatTimer) {
      clearInterval(this.failoverHeartbeatTimer);
    }
    this.failoverHeartbeatTimer = setInterval(() => {
      if (this.localPeerId) {
        // 1. Update our own lastSeen to signal we are active
        this.updateLinkedNode(this.localPeerId, {
          status: 'verified', // If heartbeat is running, we are effectively active
        });

        // 2. Check if host has timed out and execute failover if needed
        this._checkHostHealth();
      }
    }, 30000);
  }

  public onReady(callback: () => void) {
    this.readyCallbacks.push(callback);
    if (this.isReady) {
      callback();
    }
    return () => {
      this.readyCallbacks = this.readyCallbacks.filter((cb) => cb !== callback);
    };
  }

  public onHostFailover(callback: (payload: { successorId: string; previousMasterId: string | null }) => void) {
    this.hostFailoverCallbacks.push(callback);
    return () => {
      this.hostFailoverCallbacks = this.hostFailoverCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Returns the current state derived from the Yjs Doc.
   */
  public getState(localPeerId?: string | null): Partial<AppState> {
    return _getState(this._ctx(), this._collections, () => this.getLinkedNodes(), localPeerId);
  }

  public getInventoryConfig(): InventoryConfig | undefined {
    return _getInventoryConfig(this.metadata);
  }

  private logConnectionEvent(peerId: string, eventType: ConnectionEvent['eventType']) {
    _logConnectionEvent(this.peerHistory, peerId, eventType);
  }

  public getPeerHistory(peerId: string): ConnectionEvent[] {
    return _getPeerHistory(this.peerHistory, peerId);
  }

  public setInventoryConfig(config: InventoryConfig) {
    _setInventoryConfig(this._ctx(), config);
  }

  public getMasterPeerId(): string | null {
    return _getMasterPeerId(this._ctx());
  }

  public forceHostFailover() {
    const currentMasterId = this.getMasterPeerId();
    const successorId = _selectSuccessor(this._ctx());
    if (successorId) {
      _promoteSuccessor(this._ctx(), successorId, currentMasterId, this.hostFailoverCallbacks);
      logger.log(`[FAILOVER] Manual host failover triggered. New host: ${successorId}`);
    } else {
      logger.error('[FAILOVER] No suitable successor found for manual failover.');
    }
  }

  /**
   * Designate mesh master. Reassignment to a different peer is blocked once a master exists.
   * Idempotent when peerId is already master (safe re-assert before authority messages).
   */
  public setMasterPeerId(peerId: string) {
    _setMasterPeerId(this._ctx(), peerId);
  }

  public getLinkedNodes(): LinkedNodeRecord[] {
    return _getLinkedNodes(this._ctx());
  }

  public updateLinkedNode(
    peerId: string,
    info: Partial<LinkedNodeRecord>,
    authorityPeerId: string | null = this.localPeerId,
  ) {
    _updateLinkedNode(this._ctx(), peerId, info, authorityPeerId);
  }

  private getDefaultPermissions(role: P2PRole = 'collaborator'): PeerPermissions {
    return getDefaultPermissions(role);
  }

  public updateEphemeralNode(peerId: string, info: Partial<LinkedNodeRecord>) {
    _updateEphemeralNode(this._ctx(), peerId, info);
  }

  public updatePeerConfig(
    peerId: string,
    role: P2PRole,
    permissions?: PeerPermissions,
    authorityPeerId: string | null = this.localPeerId,
  ) {
    _updatePeerConfig(this._ctx(), peerId, role, permissions, authorityPeerId);
  }

  private selectSuccessor(): string | null {
    return _selectSuccessor(this._ctx());
  }

  private promoteSuccessor(successorId: string, previousMasterId: string | null) {
    _promoteSuccessor(this._ctx(), successorId, previousMasterId, this.hostFailoverCallbacks);
  }

  private _checkHostHealth() {
    _checkHostHealth(this._ctx(), this.hostFailoverCallbacks);
  }

  public removeLinkedNode(peerId: string, authorityPeerId: string | null = this.localPeerId) {
    _removeLinkedNode(this._ctx(), peerId, authorityPeerId);
  }

  /**
   * Starts periodic garbage collection for a collection.
   * Only nodes with 'admin' or 'master' role will execute the deletion.
   */
  public startGarbageCollection(collectionName: string, maxAgeMs: number, checkIntervalMs: number = 60000) {
    _startGarbageCollection(
      this._ctx(),
      collectionName,
      maxAgeMs,
      this._collections,
      this.gcIntervals,
      this.masterRole,
      checkIntervalMs,
    );
  }

  public stopGarbageCollection(collectionName: string) {
    _stopGarbageCollection(this.gcIntervals, collectionName);
  }

  /**
   * Sync methods.
   * Note: The massive array sync methods (syncProducts, syncSales, etc.) have been removed
   * in favor of surgical atomic updates via upsertEntity and deleteEntity.
   */

  /**
   * Applies an update from a remote peer.
   */
  public syncLayer: any = null;

  public setSyncLayer(layer: any) {
    this.syncLayer = layer;
  }

  public onEnvelope(callback: (envelope: any) => void) {
    // This is a placeholder for the callback used in P2PSyncManager
  }

  public applyUpdate(update: Uint8Array, origin?: unknown) {
    _applyUpdate(this._ctx(), update, origin);
  }

  /**
   * Generates a state vector to synchronize with other peers.
   */
  public getLocalUpdate(): Uint8Array {
    return _getLocalUpdate(this.doc);
  }

  public getStateVector(): Uint8Array {
    return _getStateVector(this.doc);
  }

  public getDiff(remoteStateVector: Uint8Array): Uint8Array {
    return _getDiff(this.doc, remoteStateVector);
  }

  /**
   * Observes changes in the document and triggers a callback.
   * Passes the origin so consumers can distinguish local vs remote updates.
   */
  public onChange(callback: (update: Uint8Array, origin: unknown) => void) {
    this.doc.on('update', (update, origin) => {
      callback(update, origin);
    });
  }

  /**
   * High-level observer for granular entity updates.
   * Useful for reactive UI updates without full state reconstruction.
   */
  public onObserve(
    callback: (collection: keyof AppState, items: EntityRecord[], deletedIds: string[]) => void,
  ): () => void {
    return registerObservers(this._collections, (col, items, deletedIds) => {
      callback(col as keyof AppState, items, deletedIds);
    });
  }
}

export const dbSync = new DatabaseSyncManager();
