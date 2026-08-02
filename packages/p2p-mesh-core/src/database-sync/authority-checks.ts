import type { P2PRole, PeerPermissions } from '../types';
import { logger } from '../utils/logger';
import type { ConnectionEvent, EntityRecord, LinkedNodeRecord, SyncContext } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Security origin used when surgically reverting unauthorized remote keys. */
export const SECURITY_REVERT_ORIGIN = 'p2p-security-revert';

/** Common local Yjs origins that should never be treated as remote. */
const LOCAL_ORIGINS = new Set(['local', 'shelf-edge-workflow', 'shelf-edge-security-revert', 'shelf-edge-e2e']);

/** Entity maps that participate in remote mutation authz. */
export const SECURED_COLLECTIONS = [
  'products',
  'sales',
  'clients',
  'suppliers',
  'purchaseOrders',
  'arqueoSessions',
  'ocrResults',
  'teamMembers',
  'branches',
  'auditLogs',
  'productChangeHistory',
  'pendingEdits',
  'linkedNodes',
] as const;

/** Collections that contain privilege/role information (admin-only writes). */
export const PRIVILEGE_COLLECTIONS = ['teamMembers', 'linkedNodes', 'pendingEdits', 'auditLogs'] as const;

// ─── Invite Authority ───────────────────────────────────────────────────────

export type InviteAuthorityPermissions = Partial<PeerPermissions> & {
  /** Explicit team management permission (team:manage) */
  canManageTeam?: boolean;
};

/**
 * Who may invite teammates into the P2P mesh.
 * Only ADMIN (or a role with explicit canManageTeam / team:manage) can invite.
 */
export function canInvite(
  role: P2PRole | string | null | undefined,
  permissions?: InviteAuthorityPermissions | null,
): boolean {
  if (!role) return false;
  if (role === 'admin' || role === 'owner') return true;
  if (permissions?.canManageTeam === true) return true;
  return false;
}

// ─── Authority Peer Resolution ──────────────────────────────────────────────

/** Resolve the authority peer ID from metadata. */
export function getAuthorityPeerId(metadata: SyncContext['metadata']): string | null {
  return metadata.get('authorityPeerId') || metadata.get('masterPeerId') || null;
}

/** Check if a given peer is the authority (master) peer. */
export function isAuthorityPeer(
  peerId: string | null | undefined,
  metadata: SyncContext['metadata'],
  linkedNodes: SyncContext['linkedNodes'],
): boolean {
  if (!peerId) return false;
  const masterId = getAuthorityPeerId(metadata);
  if (masterId) return peerId === masterId;
  const node = linkedNodes.get(peerId);
  return !!node?.isMaster;
}

/** Check if the local peer is the authority peer. */
export function isLocalAuthority(
  localPeerId: string | null,
  metadata: SyncContext['metadata'],
  linkedNodes: SyncContext['linkedNodes'],
): boolean {
  if (!localPeerId) return false;
  const masterId = getAuthorityPeerId(metadata);
  if (masterId) return masterId === localPeerId;
  const selfNode = linkedNodes.get(localPeerId);
  return !!selfNode?.isMaster;
}

/** True if the given peer completed PQC handshake (status verified). */
export function isPeerVerified(
  peerId: string | null | undefined,
  ephemeralNodes: SyncContext['ephemeralNodes'],
): boolean {
  if (!peerId) return false;
  return ephemeralNodes.get(peerId)?.status === 'verified';
}

// ─── Default Permissions ────────────────────────────────────────────────────

/** Return the default PeerPermissions for a given role. */
export function getDefaultPermissions(role: P2PRole = 'collaborator'): PeerPermissions {
  if (role === 'admin') {
    return {
      canViewProducts: true,
      canEditProducts: true,
      canViewSales: true,
      canEditSales: true,
      canViewClients: true,
      canEditClients: true,
      canViewSuppliers: true,
      canEditSuppliers: true,
      canViewPurchaseOrders: true,
      canEditPurchaseOrders: true,
      canViewReports: true,
      canViewArqueo: true,
      canViewDashboard: true,
    };
  }

  if (role === 'vendedor') {
    return {
      canViewProducts: true,
      canEditProducts: false,
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
    };
  }

  return {
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
  };
}

// ─── Peer Config Mutation Checks ────────────────────────────────────────────

/** Check whether authorityPeerId is allowed to mutate targetPeerId's config. */
export function isPeerConfigMutationAllowed(
  authorityPeerId: string | null | undefined,
  targetPeerId: string,
  metadata: SyncContext['metadata'],
  linkedNodes: SyncContext['linkedNodes'],
): boolean {
  if (!authorityPeerId) return false;
  if (isAuthorityPeer(authorityPeerId, metadata, linkedNodes)) return true;
  return authorityPeerId === targetPeerId && isAuthorityPeer(targetPeerId, metadata, linkedNodes);
}

// ─── Effective Peer Config ──────────────────────────────────────────────────

/** Resolve the effective role, permissions, and master status for a peer. */
export function getEffectivePeerConfig(
  peerId: string | null | undefined,
  ctx: SyncContext,
): {
  role: P2PRole;
  permissions?: PeerPermissions;
  isMaster: boolean;
} {
  if (!peerId) {
    return {
      role: 'collaborator' as P2PRole,
      permissions: undefined as PeerPermissions | undefined,
      isMaster: false,
    };
  }

  const node = ctx.linkedNodes.get(peerId);
  const ephem = ctx.ephemeralNodes.get(peerId);
  const isVerified = ephem?.status === 'verified';
  const isMasterPeer = isAuthorityPeer(peerId, ctx.metadata, ctx.linkedNodes) || !!node?.isMaster;

  if (!node) {
    return {
      role: (ctx.metadata.get('role') || 'collaborator') as P2PRole,
      permissions: undefined,
      isMaster: isMasterPeer && (peerId === ctx.localPeerId || isVerified),
    };
  }

  // Security: Admin/Master roles REQUIRE cryptographic verification
  const canAssumePrivilegedRole =
    peerId === ctx.localPeerId || (isVerified && ephem?.dsaPublicKey === node.dsaPublicKey);

  if (isMasterPeer && canAssumePrivilegedRole) {
    return {
      role: 'admin' as P2PRole,
      permissions: node.permissions,
      isMaster: true,
    };
  }

  const rawRole = node.role || 'collaborator';
  const effectiveRole = rawRole === 'admin' && !canAssumePrivilegedRole ? 'collaborator' : rawRole;

  const defaults = getDefaultPermissions(effectiveRole as P2PRole);
  const explicit = node.permissions;
  const hasExplicit =
    !!explicit &&
    Object.keys(explicit as object).some((key) => (explicit as unknown as Record<string, unknown>)[key] !== undefined);

  return {
    role: effectiveRole as P2PRole,
    permissions: hasExplicit ? { ...defaults, ...explicit } : defaults,
    isMaster: false,
  };
}

// ─── Local Permission Checks ────────────────────────────────────────────────

/**
 * Check if the local peer has permission to mutate a collection.
 * Used by upsertEntity and deleteEntity for local write gating.
 */
export function checkPermissions(ctx: SyncContext, collectionName: string, item?: Partial<EntityRecord>): boolean {
  if (!ctx.localPeerId) return true; // Allow during initialization

  const selfNode = ctx.linkedNodes.get(ctx.localPeerId);
  if (!selfNode) {
    if (getAuthorityPeerId(ctx.metadata) === ctx.localPeerId) return true;

    // Default to strict collaborator restrictions if node is unknown!
    if (collectionName === 'auditLogs') {
      if (item?.action && typeof item.action === 'string' && item.action.includes('PRIVILEGE')) {
        logger.warn('[SECURITY] Blocked malicious audit log from unknown node');
        return false;
      }
      return true;
    }
    return false; // Safest fallback
  }

  const effectiveSelf = getEffectivePeerConfig(ctx.localPeerId, ctx);
  if (effectiveSelf.role === 'admin' || effectiveSelf.isMaster) return true;

  const perms: Partial<PeerPermissions> = effectiveSelf.permissions || {};
  switch (collectionName) {
    case 'products':
      return !!perms.canEditProducts;
    case 'productChangeHistory':
      return !!perms.canEditProducts;
    case 'sales':
      return !!perms.canEditSales;
    case 'clients':
      return !!perms.canEditClients;
    case 'suppliers':
      return !!perms.canEditSuppliers;
    case 'purchaseOrders':
      return !!perms.canEditPurchaseOrders;
    case 'teamMembers':
      return false;
    case 'branches':
      return true; // Allow for now, might need more granular perms later
    case 'arqueoSessions':
      return !!perms.canViewArqueo;
    case 'ocrResults':
      return !!perms.canEditPurchaseOrders;
    case 'auditLogs':
      // Collaborators can only append normal audit logs, block malicious ones
      if (item?.action && typeof item.action === 'string' && item.action.includes('PRIVILEGE')) {
        logger.warn('[SECURITY] Blocked malicious audit log from collaborator');
        return false;
      }
      return true;
    default:
      return false;
  }
}

// ─── Remote Permission Checks ───────────────────────────────────────────────

/**
 * True when the origin represents a remote peer (string peer id).
 * Local/system origins (null, undefined, objects, security revert) are trusted.
 */
export function isRemotePeerOrigin(origin: unknown, localPeerId: string | null): origin is string {
  if (typeof origin !== 'string') return false;
  if (origin === SECURITY_REVERT_ORIGIN) return false;
  if (localPeerId && origin === localPeerId) return false;
  if (LOCAL_ORIGINS.has(origin)) return false;
  return true;
}

/**
 * Post-merge permission check for a remote peer mutating a collection key.
 * Mirrors local `checkPermissions` canEdit* matrix so membership alone is not enough.
 */
export function checkRemotePermissions(
  peerId: string,
  collectionName: string,
  ctx: SyncContext,
  item?: Partial<EntityRecord>,
): boolean {
  if (isAuthorityPeer(peerId, ctx.metadata, ctx.linkedNodes)) return true;

  const effective = getEffectivePeerConfig(peerId, ctx);
  if (effective.role === 'admin' || effective.isMaster) return true;

  const isPrivilegeEscalationAudit =
    collectionName === 'auditLogs' && typeof item?.action === 'string' && item.action.includes('PRIVILEGE');

  // Privilege maps: non-admins cannot mutate
  if (collectionName === 'teamMembers' || collectionName === 'linkedNodes' || collectionName === 'pendingEdits') {
    return false;
  }
  if (isPrivilegeEscalationAudit) {
    return false;
  }

  const perms: Partial<PeerPermissions> = effective.permissions || {};
  switch (collectionName) {
    case 'products':
    case 'productChangeHistory':
      return !!perms.canEditProducts;
    case 'sales':
      return !!perms.canEditSales;
    case 'clients':
      return !!perms.canEditClients;
    case 'suppliers':
      return !!perms.canEditSuppliers;
    case 'purchaseOrders':
    case 'ocrResults':
      return !!perms.canEditPurchaseOrders;
    case 'arqueoSessions':
      return !!perms.canViewArqueo;
    case 'branches':
      // Branch topology remains admin-only for remote writers
      return false;
    case 'auditLogs':
      // Non-admins may append normal audit entries (not PRIVILEGE — handled above)
      return true;
    default:
      return false;
  }
}

// ─── Trust Check ────────────────────────────────────────────────────────────

/**
 * True if peer is a known mesh participant (not a random inject source).
 * Includes `connected` ephemeral peers so CRDT can flow during PQC handshake
 * before status flips to `verified` (avoids multi-peer race drops).
 */
export function isTrustedRemoteWriter(peerId: string, ctx: SyncContext): boolean {
  if (isAuthorityPeer(peerId, ctx.metadata, ctx.linkedNodes)) return true;
  if (ctx.linkedNodes.has(peerId)) return true;
  if (ctx.ephemeralNodes.has(peerId)) return true;
  const effective = getEffectivePeerConfig(peerId, ctx);
  if (effective.role === 'admin' || effective.isMaster) return true;
  return false;
}
