import type * as Y from 'yjs';
import type { AppState, EntityEditProposal, InventoryConfig } from '../types';
import { logger } from '../utils/logger';
import { checkPermissions, getDefaultPermissions, getEffectivePeerConfig, isLocalAuthority } from './authority-checks';
import type { EntityRecord, SyncContext, SyncEntityRecord } from './types';

// ─── Branch Scoping ─────────────────────────────────────────────────────────

/** Collections that are scoped to a branch (multi-branch mode). */
const BRANCH_SCOPED_COLLECTIONS = new Set([
  'products',
  'sales',
  'arqueoSessions',
  'ocrResults',
  'purchaseOrders',
  'productChangeHistory',
  'pendingEdits',
]);

/** True if the collection should be scoped by activeBranchId. */
export function isBranchScoped(collectionName: string): boolean {
  return BRANCH_SCOPED_COLLECTIONS.has(collectionName);
}

// ─── Collection → Y.Map Resolution ──────────────────────────────────────────

/** Map a collection name to its underlying Y.Map instance. */
export function getMapForCollection(
  doc: Y.Doc,
  collection: string,
  collections: Record<string, Y.Map<any>>,
): Y.Map<EntityRecord> | null {
  // Handle the special "peers" alias
  if (collection === 'peers') {
    return collections.linkedNodes as unknown as Y.Map<EntityRecord>;
  }

  const map = collections[collection];
  return map ? (map as unknown as Y.Map<EntityRecord>) : null;
}

/** Build the collection map lookup table from a Y.Doc. */
export function buildCollectionMap(doc: Y.Doc): Record<string, Y.Map<any>> {
  return {
    products: doc.getMap('products'),
    sales: doc.getMap('sales'),
    clients: doc.getMap('clients'),
    suppliers: doc.getMap('suppliers'),
    purchaseOrders: doc.getMap('purchaseOrders'),
    auditLogs: doc.getMap('auditLogs'),
    arqueoSessions: doc.getMap('arqueoSessions'),
    ocrResults: doc.getMap('ocrResults'),
    teamMembers: doc.getMap('teamMembers'),
    branches: doc.getMap('branches'),
    pendingEdits: doc.getMap('pendingEdits'),
    productChangeHistory: doc.getMap('productChangeHistory'),
    linkedNodes: doc.getMap('linkedNodes'),
  };
}

// ─── Inventory Config ───────────────────────────────────────────────────────

/** Parse inventoryConfig from metadata. */
export function getInventoryConfig(metadata: SyncContext['metadata']): InventoryConfig | undefined {
  const raw = metadata.get('inventoryConfig');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as InventoryConfig;
  } catch (error) {
    logger.warn('[SYNC] Failed to parse inventoryConfig metadata', error);
    return undefined;
  }
}

/** Set inventoryConfig in metadata (authority-only). */
export function setInventoryConfig(
  ctx: SyncContext,
  config: InventoryConfig,
  collections?: Record<string, Y.Map<any>>,
): void {
  if (!isLocalAuthority(ctx.localPeerId, ctx.metadata, ctx.linkedNodes)) {
    logger.warn(`[SECURITY] Blocked unauthorized inventory config update from ${ctx.localPeerId}`);
    return;
  }

  ctx.doc.transact(() => {
    ctx.metadata.set('inventoryConfig', JSON.stringify(config));
  }, 'local');
}

// ─── Entity CRUD ────────────────────────────────────────────────────────────

/**
 * Surgical insert or update on a Y.Map collection, with merge resolution
 * for collaborator product edits.
 */
export function upsertEntity<T extends EntityRecord & SyncEntityRecord>(
  ctx: SyncContext,
  collectionName: keyof AppState,
  item: T,
  collections: Record<string, Y.Map<any>>,
  activeBranchId: string | undefined,
): void {
  if (!checkPermissions(ctx, collectionName, item)) {
    logger.warn(`[SECURITY] Unauthorized mutation attempt on ${collectionName}`);
    return;
  }

  const yMap = getMapForCollection(ctx.doc, collectionName, collections);
  if (!yMap) return;
  const { __baseUpdatedAt, ...persistableItem } = item as T & SyncEntityRecord;

  // MERGE RESOLUTION SYSTEM
  // If a collaborator edits a product, we route it to pendingEdits for the admin to approve.
  if (collectionName === 'products' && ctx.localPeerId && ctx.isReady) {
    const effectiveSelf = getEffectivePeerConfig(ctx.localPeerId, ctx);
    const isAdmin = effectiveSelf.role === 'admin' || effectiveSelf.isMaster;
    const autoApplyProductUpdates = Boolean(getInventoryConfig(ctx.metadata)?.autoApplyProductUpdates);

    if (!isAdmin && !autoApplyProductUpdates) {
      const originalData = yMap.get(item.id);
      const hasConcurrentChange =
        !!originalData?.updatedAt &&
        !!__baseUpdatedAt &&
        originalData.updatedAt !== __baseUpdatedAt &&
        originalData.updatedBy !== item.updatedBy;

      if (originalData && hasConcurrentChange) {
        const proposalId = `prop-${Date.now()}-${ctx.localPeerId}`;
        const proposal: EntityEditProposal = {
          id: proposalId,
          entityId: item.id,
          collectionName: collectionName,
          proposedData: persistableItem,
          originalData: originalData,
          peerId: ctx.localPeerId,
          timestamp: new Date().toISOString(),
          status: 'pending',
        };

        ctx.doc.transact(
          () => {
            collections.pendingEdits.set(proposalId, proposal as any);
          },
          { origin: 'local', branchId: activeBranchId },
        );

        logger.log(`[MERGE] Conflicting collaborator edit on ${item.id} routed to pendingEdits`);
        return;
      }
    }
  }

  const branchId = (item as any).branchId || (isBranchScoped(collectionName) ? activeBranchId : undefined);

  const existing = yMap.get(item.id);
  const nowTs = (item as any).updatedAt || new Date().toISOString();
  const existingTimestamps = (existing as any)?._fieldTimestamps || {};
  const fieldTimestamps: Record<string, string> = { ...existingTimestamps };

  for (const [key, value] of Object.entries(persistableItem)) {
    if (['id', 'updatedAt', 'updatedBy', '__baseUpdatedAt', '_fieldTimestamps'].includes(key)) continue;
    if (existing === undefined || (existing as any)[key] !== value || !fieldTimestamps[key]) {
      fieldTimestamps[key] = nowTs;
    }
  }

  const persistableWithTimestamps = {
    ...persistableItem,
    _fieldTimestamps: fieldTimestamps,
  };

  ctx.doc.transact(
    () => {
      yMap.set(item.id, persistableWithTimestamps as any);
    },
    { origin: 'local', branchId },
  );
}

/** Surgical delete (physical) on a Y.Map collection. */
export function deleteEntity(
  ctx: SyncContext,
  collectionName: keyof AppState,
  id: string,
  collections: Record<string, Y.Map<any>>,
  activeBranchId: string | undefined,
): void {
  if (!checkPermissions(ctx, collectionName)) {
    logger.warn(`[SECURITY] Unauthorized deletion attempt on ${collectionName}`);
    return;
  }

  const yMap = getMapForCollection(ctx.doc, collectionName, collections);
  if (!yMap) return;

  const branchId = isBranchScoped(collectionName) ? activeBranchId : undefined;

  ctx.doc.transact(
    () => {
      yMap.delete(id);
    },
    { origin: 'local', branchId },
  );
}

/** Admin-only function to resolve a pending edit proposal. */
export function resolvePendingEdit(
  ctx: SyncContext,
  proposalId: string,
  resolution: 'approve' | 'reject',
  mergedData: any,
  collections: Record<string, Y.Map<any>>,
  activeBranchId: string | undefined,
): void {
  const effectiveSelf = getEffectivePeerConfig(ctx.localPeerId, ctx);
  const isAdmin = effectiveSelf.role === 'admin' || effectiveSelf.isMaster;

  if (!isAdmin) {
    logger.warn(`[SECURITY] Unauthorized attempt to resolve pending edit by ${ctx.localPeerId}`);
    return;
  }

  const proposal = collections.pendingEdits.get(proposalId);
  if (!proposal) return;

  const branchId = isBranchScoped(proposal.collectionName)
    ? (proposal.proposedData as any).branchId || activeBranchId
    : undefined;

  ctx.doc.transact(
    () => {
      if (resolution === 'approve') {
        const finalData = mergedData || proposal.proposedData;
        const collectionMap = getMapForCollection(ctx.doc, proposal.collectionName, collections);
        if (collectionMap) {
          // We temporarily bypass the upsertEntity hook by setting it directly to the map
          collectionMap.set(proposal.entityId, finalData as any);
        }
      }

      // Always remove the proposal once resolved
      collections.pendingEdits.delete(proposalId);
    },
    { origin: 'local', branchId },
  );

  logger.log(`[MERGE] Proposal ${proposalId} resolved as ${resolution}`);
}

// ─── State Init ─────────────────────────────────────────────────────────────

/** Sync local AppState into the Yjs Doc. */
export function initWithState(ctx: SyncContext, state: AppState, collections: Record<string, Y.Map<any>>): void {
  ctx.doc.transact(() => {
    const mergeAndSync = <T extends { id: string }>(collectionName: keyof AppState, array: T[] = []) => {
      if (array) {
        for (const item of array) {
          upsertEntity(ctx, collectionName, item as any, collections, ctx.activeBranchId);
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
    mergeAndSync('teamMembers', state.teamMembers);
    mergeAndSync('branches', state.branches);
    mergeAndSync('productChangeHistory', state.productChangeHistory);

    if (state.pendingEdits) {
      for (const edit of state.pendingEdits) {
        collections.pendingEdits.set(edit.id, edit as any);
      }
    }

    ctx.metadata.set('inventoryConfig', JSON.stringify(state.inventoryConfig));

    if (state.peers && state.peers.length > 0) {
      for (const peer of state.peers) {
        upsertEntity(ctx, 'peers', peer as any, collections, ctx.activeBranchId);
      }
    }
  }, 'local');
}

// ─── State Get ──────────────────────────────────────────────────────────────

/** Extract current AppState snapshot from the Yjs Doc. */
export function getState(
  ctx: SyncContext,
  collections: Record<string, Y.Map<any>>,
  getLinkedNodesFn: () => import('./types').LinkedNodeRecord[],
  localPeerId?: string | null,
): Partial<AppState> {
  const peers = getLinkedNodesFn();
  const effectiveLocalId = localPeerId || ctx.localPeerId;

  let resolvedRole: import('../types').P2PRole = 'collaborator';
  let resolvedPermissions: import('../types').PeerPermissions | undefined;

  if (effectiveLocalId) {
    const masterId = getMasterPeerIdForState(ctx);
    const effectiveSelf = getEffectivePeerConfig(effectiveLocalId, ctx);

    // If we are the original host, we always retain admin privileges
    if (masterId === effectiveLocalId) {
      resolvedRole = 'admin';
    } else if (effectiveSelf.role) {
      resolvedRole = effectiveSelf.role;
      resolvedPermissions = effectiveSelf.permissions;
    } else {
      resolvedRole = 'collaborator';
    }
  } else {
    resolvedRole = 'admin';
  }

  return {
    products: Array.from(collections.products.values()),
    sales: Array.from(collections.sales.values()),
    clients: Array.from(collections.clients.values()),
    suppliers: Array.from(collections.suppliers.values()),
    purchaseOrders: Array.from(collections.purchaseOrders.values()),
    auditLogs: Array.from(collections.auditLogs.values()),
    arqueoSessions: Array.from(collections.arqueoSessions.values()),
    ocrResults: Array.from(collections.ocrResults.values()),
    teamMembers: Array.from(collections.teamMembers.values()),
    branches: Array.from(collections.branches.values()),
    inventoryConfig: getInventoryConfig(ctx.metadata),
    role: resolvedRole,
    permissions: resolvedPermissions,
    peers: peers,
    pendingEdits: Array.from(collections.pendingEdits.values()) as EntityEditProposal[],
    productChangeHistory: Array.from(
      collections.productChangeHistory.values(),
    ) as import('../types').ProductChangeHistoryEntry[],
  };
}

/** Local helper to avoid circular import with connection-tracking. */
function getMasterPeerIdForState(ctx: SyncContext): string | null {
  const authorityPeerId = ctx.metadata.get('authorityPeerId');
  if (authorityPeerId) return authorityPeerId;
  for (const node of ctx.linkedNodes.values()) {
    if (node.isMaster) return node.id;
  }
  return ctx.metadata.get('masterPeerId') || null;
}

// ─── Garbage Collection ─────────────────────────────────────────────────────

/** Start periodic garbage collection for a collection. */
export function startGarbageCollection(
  ctx: SyncContext,
  collectionName: string,
  maxAgeMs: number,
  collections: Record<string, Y.Map<any>>,
  gcIntervals: Map<string, ReturnType<typeof setInterval>>,
  masterRole: string | null,
  checkIntervalMs: number = 60000,
): void {
  if (gcIntervals.has(collectionName)) {
    clearInterval(gcIntervals.get(collectionName)!);
  }

  const interval = setInterval(() => {
    // Resolve role: prefer explicit masterRole (set by p2pManager), then linkedNodes, then metadata
    let role: string | null = masterRole;
    if (!role) {
      const selfNode = ctx.localPeerId ? ctx.linkedNodes.get(ctx.localPeerId) : null;
      role = selfNode?.role || ctx.metadata.get('role') || null;
      if (!role && ctx.localPeerId && ctx.metadata.get('masterPeerId') === ctx.localPeerId) {
        role = 'admin';
      }
    }

    // Guard: only admin/master peers execute cleanup
    if (role !== 'admin' && role !== 'master') {
      return;
    }

    logger.debug(`[GC] Running cleanup for ${collectionName} (role: ${role})`);

    const yMap = getMapForCollection(ctx.doc, collectionName, collections);
    if (!yMap) return;

    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, item] of yMap.entries()) {
      if (item?.timestamp) {
        const itemTime = new Date(item.timestamp).getTime();
        if (now - itemTime > maxAgeMs) {
          keysToDelete.push(key);
        }
      }
    }

    if (keysToDelete.length > 0) {
      ctx.doc.transact(() => {
        for (const key of keysToDelete) {
          yMap.delete(key);
        }
      }, 'local');
      logger.log(`[GC] Purged ${keysToDelete.length} old items from ${collectionName}`);
    }
  }, checkIntervalMs);

  gcIntervals.set(collectionName, interval);
}

/** Stop garbage collection for a collection. */
export function stopGarbageCollection(
  gcIntervals: Map<string, ReturnType<typeof setInterval>>,
  collectionName: string,
): void {
  if (gcIntervals.has(collectionName)) {
    clearInterval(gcIntervals.get(collectionName)!);
    gcIntervals.delete(collectionName);
  }
}
