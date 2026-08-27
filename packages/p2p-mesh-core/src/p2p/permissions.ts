/**
 * Permission and authority-check helpers for the P2P mesh.
 *
 * Pure functions extracted from P2PManager. Each takes explicit
 * parameters instead of reading `this` — the class delegates to these.
 */
import { dbSync } from '../database-sync';
import { verifyAdminClaim } from '../database-sync/authority-checks';
import type { P2PRole } from '../types';
import { logger } from '../utils/logger';
import type { SyncMessage } from './sync-types';

// ─── Audit helpers (SHELF-104 / SHELF-105) ──────────────────────────────────

type AuditEntryInput = {
  action: string;
  peerId: string;
  details?: Record<string, unknown>;
};

/** Append an audit entry to the CRDT auditLogs collection (best-effort). */
function writeAuditEntry({ action, peerId, details }: AuditEntryInput): void {
  try {
    dbSync.upsertEntity('auditLogs', {
      id: `p2p-${action.toLowerCase().replace(/_/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      peerId,
      action,
      details: details || {},
    } as any);
  } catch (err) {
    logger.warn(`[SECURITY] Failed to write audit entry ${action}:`, err);
  }
}

/**
 * Record an admin-promotion attempt (success or failure). SHELF-104 requires
 * an audit trail for every promotion attempt so abuses are traceable.
 */
export function logAdminPromotionAttempt(opts: {
  fromPeerId: string;
  targetPeerId?: string;
  granted: boolean;
  reason: string;
}): void {
  const { fromPeerId, targetPeerId, granted, reason } = opts;
  writeAuditEntry({
    action: 'ADMIN_PROMOTION_ATTEMPT',
    peerId: fromPeerId,
    details: {
      targetPeerId: targetPeerId || null,
      outcome: granted ? 'granted' : 'rejected',
      reason,
    },
  });
  if (granted) {
    logger.log(`[SECURITY] Admin promotion granted for ${fromPeerId} (${reason})`);
  } else {
    logger.warn(`[SECURITY] Admin promotion rejected for ${fromPeerId}: ${reason}`);
  }
}

/** Record a role downgrade event for audit (SHELF-105). */
export function logRoleDowngrade(opts: { peerId: string; fromRole: P2PRole; toRole: P2PRole; reason: string }): void {
  const { peerId, fromRole, toRole, reason } = opts;
  writeAuditEntry({
    action: 'ROLE_DOWNGRADE',
    peerId,
    details: { fromRole, toRole, reason },
  });
  logger.warn(`[SECURITY] Role downgrade: ${peerId} ${fromRole} -> ${toRole} (${reason})`);
}

// ─── Authority helpers ──────────────────────────────────────────────────────

/**
 * Resolve the effective role for a peer that is (or may be) offline.
 *
 * SHELF-105: disconnected nodes never keep admin. The admin role is only
 * allowed when the node IS the CRDT authority (masterPeerId matches).
 * Anyone else with a stored admin role is downgraded to `readonly`.
 */
export function getOfflineRole(localPeerId: string | null, storedRole: P2PRole): P2PRole {
  if (!localPeerId) return 'readonly';

  const masterId = dbSync.getMasterPeerId();
  if (masterId === localPeerId) {
    // The CRDT authority master keeps its role (admin stays admin).
    return storedRole;
  }

  if (storedRole === 'admin') {
    logRoleDowngrade({
      peerId: localPeerId,
      fromRole: 'admin',
      toRole: 'readonly',
      reason: `not the CRDT authority (master=${masterId || 'none'})`,
    });
    return 'readonly';
  }
  return storedRole;
}

/**
 * Determine if the local node should be treated as the CRDT authority.
 * Checks: dbSync local authority → master peer ID match → bootstrap admin.
 *
 * SHELF-105: a disconnected/offline node can NEVER claim authority (deny,
 * never promote). The admin role is only honored for the CRDT authority
 * master; a node that is part of a mesh but has no known master (offline
 * fallback) is denied instead of promoted.
 */
export function isLocalAuthorityPeer(localPeerId: string | null, role: P2PRole, isConnected: boolean = true): boolean {
  if (!localPeerId) return false;

  // SHELF-105: disconnected peers must not claim authority/admin.
  if (!isConnected) {
    if (role === 'admin') {
      logRoleDowngrade({
        peerId: localPeerId,
        fromRole: 'admin',
        toRole: 'readonly',
        reason: 'peer disconnected',
      });
    }
    return false;
  }

  // Prefer CRDT authority (masterPeerId / linkedNodes.isMaster)
  if (dbSync.isLocalAuthority()) return true;
  const masterId = dbSync.getMasterPeerId();
  if (masterId) return masterId === localPeerId;

  // Bootstrap: UI admin with no master yet is treated as authority locally
  // without mutating masterPeerId — but ONLY for a genuine standalone node
  // (no other mesh peers known). SHELF-105: no blind role promotion.
  if (role === 'admin') {
    const hasOtherPeers = dbSync.getLinkedNodes().some((n) => n.id !== localPeerId);
    if (!hasOtherPeers) return true;
    logger.warn(
      `[SECURITY] SHELF-105: denied admin authority claim for ${localPeerId} (mesh peers present, master unknown)`,
    );
    return false;
  }
  return false;
}

/** Check if a message is an authority-gated type (admin/role/permissions). */
export function isAuthorityMessage(message: SyncMessage): boolean {
  return (
    message.type === 'PROMOTE_ADMIN' || message.type === 'CHANGE_ROLE' || message.type === 'UPDATE_PEER_PERMISSIONS'
  );
}

/**
 * Accept authority messages only from a PQC-verified, ML-DSA-signed sender.
 *
 * SHELF-104: remote authority claims ALWAYS require crypto verification:
 *   1. peer completed the PQC handshake (ephemeral status `verified`),
 *   2. the admin-claim signature verifies with ML-DSA-65
 *      (`verifyAdminClaim(fromPeerId, signature, dsaPublicKey)`),
 *   3. the claim public key matches the key registered in the CRDT record.
 *
 * Established mesh: only the master may send. Bootstrap: the FIRST verified,
 * correctly-signed authority peer is adopted as master — unverified or
 * unsigned claims are rejected even during bootstrap, and a remote peer can
 * never take over from an existing local master.
 */
export function isAuthorizedAuthoritySender(
  fromPeerId: string,
  signature?: string | null,
  dsaPublicKey?: string | null,
): boolean {
  // Local node always trusts its own messages (the outgoing authority gate is
  // enforced separately in sendTo via isLocalAuthorityPeer).
  if (dbSync.localPeerId && fromPeerId === dbSync.localPeerId) {
    return true;
  }

  const masterId = dbSync.getMasterPeerId();

  if (!isRemoteAuthorityClaimCryptoValid(fromPeerId, signature, dsaPublicKey)) {
    logAdminPromotionAttempt({
      fromPeerId,
      granted: false,
      reason: 'missing/invalid ML-DSA admin claim or PQC handshake not verified',
    });
    return false;
  }

  // Established mesh: only the master may issue authority messages.
  if (masterId && masterId !== dbSync.localPeerId) {
    const ok = fromPeerId === masterId;
    if (!ok) {
      logAdminPromotionAttempt({
        fromPeerId,
        granted: false,
        reason: `not the mesh master (master=${masterId})`,
      });
    }
    return ok;
  }

  // Already an authority peer (crypto-verified) — authorization holds.
  if (dbSync.isAuthorityPeerId(fromPeerId)) {
    logAdminPromotionAttempt({ fromPeerId, granted: true, reason: 'existing authority peer (crypto-verified)' });
    return true;
  }

  // Bootstrap (no master known on this node): adopt the first verified,
  // signed authority sender as master — never an unverified/unsigned claim.
  if (!masterId) {
    dbSync.setMasterPeerId(fromPeerId);
    dbSync.updateLinkedNode(fromPeerId, { role: 'admin', isMaster: true }, fromPeerId);
    logAdminPromotionAttempt({
      fromPeerId,
      granted: true,
      reason: 'bootstrap: PQC-verified admin claim adopted as master',
    });
    return true;
  }

  // Local node is already master: refuse remote authority takeover.
  logAdminPromotionAttempt({
    fromPeerId,
    granted: false,
    reason: `local node is master (${masterId}); refusing remote authority takeover`,
  });
  return false;
}

/**
 * SHELF-104: remote authority claims require a completed PQC handshake,
 * a valid ML-DSA admin-claim signature, and a claim public key bound to the
 * peer's CRDT-registered DSA key.
 */
function isRemoteAuthorityClaimCryptoValid(
  fromPeerId: string,
  signature?: string | null,
  dsaPublicKey?: string | null,
): boolean {
  if (!dbSync.isPeerVerified(fromPeerId)) return false;
  if (!verifyAdminClaim(fromPeerId, signature, dsaPublicKey)) return false;
  const node = dbSync.getLinkedNodes().find((n) => n.id === fromPeerId);
  if (node?.dsaPublicKey && node.dsaPublicKey !== dsaPublicKey) return false;
  return true;
}

// ─── Encryption policy helpers ──────────────────────────────────────────────

/** Types that are always encrypted (authority / recovery). */
const ALWAYS_SENSITIVE_TYPES = new Set([
  'PROMOTE_ADMIN',
  'CHANGE_ROLE',
  'UPDATE_PEER_PERMISSIONS',
  'RECOVERY_APPROVED',
]);

/** Types that are encrypted only when dual-ready (YJS / envelope). */
const YJS_SENSITIVE_TYPES = new Set(['YJS_UPDATE', 'YJS_SYNC_REQUEST', 'EDGE_MESH_ENVELOPE']);

/**
 * Authority/recovery always; YJS only after mutual ENCRYPTION_READY.
 */
export function shouldEncryptMessage(
  peerId: string,
  message: SyncMessage,
  dualReadyEncryption: Set<string>,
  encryptYjsWhenDualReady: boolean,
): boolean {
  if (ALWAYS_SENSITIVE_TYPES.has(message.type)) {
    return true;
  }
  if (YJS_SENSITIVE_TYPES.has(message.type)) {
    return encryptYjsWhenDualReady && dualReadyEncryption.has(peerId);
  }
  return false;
}

/**
 * Check if a message type is sensitive (for logging / filtering).
 * Authority/recovery types always sensitive; YJS uses dual-ready path.
 */
export function isSensitive(message: SyncMessage): boolean {
  return ALWAYS_SENSITIVE_TYPES.has(message.type) || YJS_SENSITIVE_TYPES.has(message.type);
}
