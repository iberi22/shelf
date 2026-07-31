import { logger } from '../utils/logger';
import { getDefaultPermissions, isAuthorityPeer, isPeerConfigMutationAllowed } from './authority-checks';
import type { ConnectionEvent, LinkedNodeRecord, SyncContext } from './types';

// ─── Connection Event History ───────────────────────────────────────────────

/** Log a connection event for a peer (capped at 100 entries). */
export function logConnectionEvent(
  peerHistory: SyncContext['peerHistory'],
  peerId: string,
  eventType: ConnectionEvent['eventType'],
): void {
  const history = peerHistory.get(peerId) || [];
  const event: ConnectionEvent = {
    peerId,
    eventType,
    timestamp: Date.now(),
  };

  history.push(event);
  if (history.length > 100) {
    history.shift();
  }
  peerHistory.set(peerId, history);

  logger.debug(`[SYNC] Logged connection event for ${peerId}: ${eventType}`);
}

/** Retrieve connection event history for a peer. */
export function getPeerHistory(peerHistory: SyncContext['peerHistory'], peerId: string): ConnectionEvent[] {
  return peerHistory.get(peerId) || [];
}

// ─── Ephemeral Node Updates ─────────────────────────────────────────────────

/** Update the ephemeral (in-memory, non-CRDT) state for a peer. */
export function updateEphemeralNode(ctx: SyncContext, peerId: string, info: Partial<LinkedNodeRecord>): void {
  const existing = ctx.ephemeralNodes.get(peerId);

  if (info.status && info.status !== existing?.status) {
    if (info.status === 'verified') {
      logConnectionEvent(ctx.peerHistory, peerId, 'verified');
    } else if (info.status === 'offline') {
      logConnectionEvent(ctx.peerHistory, peerId, 'disconnected');
      logConnectionEvent(ctx.peerHistory, peerId, 'offline');
    } else if (info.status === 'connected') {
      if (existing?.status === 'offline') {
        logConnectionEvent(ctx.peerHistory, peerId, 'reconnected');
      } else {
        logConnectionEvent(ctx.peerHistory, peerId, 'connected');
      }
    }
  }

  ctx.ephemeralNodes.set(peerId, {
    ...(existing || {}),
    ...info,
    lastSeen: new Date().toISOString(),
  });

  // We intentionally don't wrap this in a Yjs transaction to avoid broadcasting status changes.
}

// ─── Linked Nodes (CRDT-backed peers) ──────────────────────────────────────

/** Merge CRDT-linked nodes with ephemeral state into a unified view. */
export function getLinkedNodes(ctx: SyncContext): LinkedNodeRecord[] {
  const crdtPeers = Array.from(ctx.linkedNodes.values());
  const peersMap = new Map<string, LinkedNodeRecord>();

  for (const p of crdtPeers) {
    peersMap.set(p.id, { ...p, ...(ctx.ephemeralNodes.get(p.id) || {}) });
  }

  for (const [id, ephem] of ctx.ephemeralNodes.entries()) {
    if (!peersMap.has(id)) {
      peersMap.set(id, {
        id,
        role: 'collaborator',
        ...ephem,
        lastSeen: ephem.lastSeen || new Date().toISOString(),
      });
    }
  }

  return Array.from(peersMap.values());
}

/**
 * Update a linked (CRDT-persisted) peer node with connection event tracking
 * and permission-gated role/permission changes.
 */
export function updateLinkedNode(
  ctx: SyncContext,
  peerId: string,
  info: Partial<LinkedNodeRecord>,
  authorityPeerId: string | null = ctx.localPeerId,
): void {
  const existing = ctx.linkedNodes.get(peerId);

  if (info.status && info.status !== existing?.status) {
    if (info.status === 'verified') {
      logConnectionEvent(ctx.peerHistory, peerId, 'verified');
    } else if (info.status === 'offline') {
      logConnectionEvent(ctx.peerHistory, peerId, 'disconnected');
      logConnectionEvent(ctx.peerHistory, peerId, 'offline');
    } else if (info.status === 'connected') {
      if (existing?.status === 'offline') {
        logConnectionEvent(ctx.peerHistory, peerId, 'reconnected');
      } else {
        logConnectionEvent(ctx.peerHistory, peerId, 'connected');
      }
    }
  }

  ctx.doc.transact(() => {
    const existingRecord = existing || ({} as LinkedNodeRecord);
    const { id: _existingId, ...existingWithoutId } = existingRecord;
    const canEditPeerConfig = isPeerConfigMutationAllowed(authorityPeerId, peerId, ctx.metadata, ctx.linkedNodes);
    const nextRole = canEditPeerConfig && info.role ? info.role : existingRecord.role || 'collaborator';
    const nextPermissions =
      canEditPeerConfig && info.permissions
        ? info.permissions
        : existingRecord.permissions || getDefaultPermissions(nextRole);
    const nextDsaPublicKey = canEditPeerConfig && info.dsaPublicKey ? info.dsaPublicKey : existingRecord.dsaPublicKey;
    const nextIsMaster =
      peerId === authorityPeerId
        ? typeof info.isMaster === 'boolean'
          ? info.isMaster
          : existingRecord.isMaster || false
        : false;
    const safeInfo = canEditPeerConfig
      ? info
      : (({ role: _role, permissions: _permissions, isMaster: _isMaster, ...rest }) => rest)(info || {});

    const nextConnectedAt = existingRecord.connectedAt || new Date().toISOString();
    let nextVerifiedAt = existingRecord.verifiedAt;
    if ((info.status === 'verified' || existingRecord.status === 'verified') && !nextVerifiedAt) {
      nextVerifiedAt = new Date().toISOString();
    }

    ctx.linkedNodes.set(peerId, {
      ...existingWithoutId,
      ...safeInfo,
      id: peerId,
      permissions: nextPermissions,
      role: nextRole,
      dsaPublicKey: nextDsaPublicKey,
      isMaster: nextIsMaster,
      lastSeen: new Date().toISOString(),
      connectedAt: nextConnectedAt,
      verifiedAt: nextVerifiedAt,
    });
  }, 'local');
}

/** Update a peer's role and permissions in the CRDT-linked nodes. */
export function updatePeerConfig(
  ctx: SyncContext,
  peerId: string,
  role: import('../types').P2PRole,
  permissions?: import('../types').PeerPermissions,
  authorityPeerId: string | null = ctx.localPeerId,
): void {
  if (!isPeerConfigMutationAllowed(authorityPeerId, peerId, ctx.metadata, ctx.linkedNodes)) {
    logger.warn(`[SECURITY] Blocked unauthorized peer config update for ${peerId}`);
    return;
  }

  ctx.doc.transact(() => {
    const existing = ctx.linkedNodes.get(peerId) || ({} as LinkedNodeRecord);
    const { id: _existingConfigId, ...existingConfigWithoutId } = existing;
    const existingEphemeral = ctx.ephemeralNodes.get(peerId) || {};
    const nextRole = role;
    const nextPermissions = permissions || getDefaultPermissions(nextRole);

    ctx.linkedNodes.set(peerId, {
      ...existingEphemeral,
      ...existingConfigWithoutId,
      id: peerId,
      role: nextRole,
      permissions: nextPermissions,
      isMaster: peerId === authorityPeerId ? existing.isMaster || false : false,
      lastSeen: new Date().toISOString(),
    });
  }, 'local');
}

/** Remove a peer from the CRDT-linked nodes (authority-gated). */
export function removeLinkedNode(
  ctx: SyncContext,
  peerId: string,
  authorityPeerId: string | null = ctx.localPeerId,
): void {
  if (!isPeerConfigMutationAllowed(authorityPeerId, peerId, ctx.metadata, ctx.linkedNodes)) {
    logger.warn(`[SECURITY] Blocked unauthorized peer removal for ${peerId} by ${authorityPeerId}`);
    return;
  }

  ctx.doc.transact(() => {
    ctx.linkedNodes.delete(peerId);
  }, 'local');
}

// ─── Failover / Successor Selection ─────────────────────────────────────────

/** Select the best successor for host failover based on deterministic criteria. */
export function selectSuccessor(ctx: SyncContext): string | null {
  const nodes = getLinkedNodes(ctx);
  const currentMasterId = getMasterPeerId(ctx);

  // Candidates must be online and not the current master
  const candidates = nodes.filter((node) => node.id !== currentMasterId && node.status !== 'offline');

  if (candidates.length === 0) return null;

  // Sort deterministically:
  // 1. Status: Prefer 'verified' over 'connected'
  // 2. verifiedAt: Earliest first (longest verified uptime)
  // 3. connectedAt: Earliest first (longest connection)
  // 4. id: Lexicographical fallback
  candidates.sort((a, b) => {
    if (a.status === 'verified' && b.status !== 'verified') return -1;
    if (a.status !== 'verified' && b.status === 'verified') return 1;

    if (a.verifiedAt && b.verifiedAt) {
      const timeA = new Date(a.verifiedAt).getTime();
      const timeB = new Date(b.verifiedAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
    } else if (a.verifiedAt) {
      return -1;
    } else if (b.verifiedAt) {
      return 1;
    }

    if (a.connectedAt && b.connectedAt) {
      const timeA = new Date(a.connectedAt).getTime();
      const timeB = new Date(b.connectedAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
    }

    return a.id.localeCompare(b.id);
  });

  return candidates[0].id;
}

/** Promote a successor to master, demoting the previous master. */
export function promoteSuccessor(
  ctx: SyncContext,
  successorId: string,
  previousMasterId: string | null,
  hostFailoverCallbacks: ((payload: { successorId: string; previousMasterId: string | null }) => void)[],
): void {
  ctx.doc.transact(() => {
    // Update global metadata
    ctx.metadata.set('authorityPeerId', successorId);
    ctx.metadata.set('masterPeerId', successorId);

    // Update the successor's role and master status
    const existingSuccessor = ctx.linkedNodes.get(successorId) || ({} as LinkedNodeRecord);
    ctx.linkedNodes.set(successorId, {
      ...existingSuccessor,
      id: successorId,
      isMaster: true,
      role: 'admin',
      permissions: getDefaultPermissions('admin'),
      lastSeen: new Date().toISOString(),
    });

    // Demote the previous master if present
    if (previousMasterId && previousMasterId !== successorId) {
      const existingOldMaster = ctx.linkedNodes.get(previousMasterId);
      if (existingOldMaster) {
        ctx.linkedNodes.set(previousMasterId, {
          ...existingOldMaster,
          isMaster: false,
          lastSeen: existingOldMaster.lastSeen,
        });
      }
    }
  }, 'local');

  logger.log(`[FAILOVER] Host failover completed. New host: ${successorId} (Previous: ${previousMasterId})`);

  // Emit event to local listeners
  for (const cb of hostFailoverCallbacks) {
    cb({ successorId, previousMasterId });
  }
}

/** Check if the current master has timed out and trigger failover if needed. */
export function checkHostHealth(
  ctx: SyncContext,
  hostFailoverCallbacks: ((payload: { successorId: string; previousMasterId: string | null }) => void)[],
): void {
  const currentMasterId = getMasterPeerId(ctx);
  if (!currentMasterId || currentMasterId === ctx.localPeerId) return;

  const masterNode = ctx.linkedNodes.get(currentMasterId);
  const lastSeenStr = masterNode?.lastSeen;

  if (lastSeenStr) {
    const lastSeen = new Date(lastSeenStr).getTime();
    const now = Date.now();

    if (now - lastSeen > 60000) {
      logger.warn(`[FAILOVER] Master ${currentMasterId} offline for ${now - lastSeen}ms. Initiating failover.`);

      const successorId = selectSuccessor(ctx);
      if (successorId) {
        if (successorId === ctx.localPeerId) {
          promoteSuccessor(ctx, successorId, currentMasterId, hostFailoverCallbacks);
        }
      } else {
        logger.error('[FAILOVER] No suitable successor found for failover.');
      }
    }
  }
}

// ─── Master Peer Resolution ─────────────────────────────────────────────────

/** Resolve the current master peer ID from metadata + linkedNodes fallback. */
export function getMasterPeerId(ctx: SyncContext): string | null {
  const authorityPeerId = ctx.metadata.get('authorityPeerId');
  if (authorityPeerId) {
    return authorityPeerId;
  }
  for (const node of ctx.linkedNodes.values()) {
    if (node.isMaster) return node.id;
  }
  return ctx.metadata.get('masterPeerId') || null;
}

/** Designate mesh master with authorization guards. */
export function setMasterPeerId(ctx: SyncContext, peerId: string): void {
  const currentMaster = getMasterPeerId(ctx);
  if (currentMaster && currentMaster !== peerId && currentMaster !== ctx.localPeerId) {
    logger.warn(`[SECURITY] Blocked unauthorized master reassignment to ${peerId}`);
    return;
  }

  ctx.doc.transact(() => {
    ctx.metadata.set('authorityPeerId', peerId);
    ctx.metadata.set('masterPeerId', peerId);
    // Keep linkedNodes.isMaster coherent for getMasterPeerId() fallback walk
    const existing = ctx.linkedNodes.get(peerId);
    const isSelf = !!ctx.localPeerId && peerId === ctx.localPeerId;
    if (existing || isSelf) {
      ctx.linkedNodes.set(peerId, {
        ...(existing || { id: peerId, role: 'admin' as import('../types').P2PRole }),
        id: peerId,
        role: 'admin',
        isMaster: true,
        lastSeen: new Date().toISOString(),
      });
    }
    for (const [id, node] of ctx.linkedNodes.entries()) {
      if (id !== peerId && node.isMaster) {
        ctx.linkedNodes.set(id, { ...node, isMaster: false });
      }
    }
  }, 'local');
}
