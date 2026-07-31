/**
 * Permission and authority-check helpers for the P2P mesh.
 *
 * Pure functions extracted from P2PManager. Each takes explicit
 * parameters instead of reading `this` — the class delegates to these.
 */
import { dbSync } from '../database-sync';
import type { P2PRole } from '../types';
import type { SyncMessage } from './sync-types';

// ─── Authority helpers ──────────────────────────────────────────────────────

/**
 * Determine if the local node should be treated as the CRDT authority.
 * Checks: dbSync local authority → master peer ID match → bootstrap admin.
 */
export function isLocalAuthorityPeer(localPeerId: string | null, role: P2PRole): boolean {
  if (!localPeerId) return false;
  // Prefer CRDT authority (masterPeerId / linkedNodes.isMaster)
  if (dbSync.isLocalAuthority()) return true;
  const masterId = dbSync.getMasterPeerId();
  if (masterId) return masterId === localPeerId;
  // Bootstrap: UI admin with no master yet is treated as authority locally
  // without mutating masterPeerId
  if (role === 'admin') {
    return true;
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
 * Accept authority messages only from the mesh master.
 * Bootstrap: if master is not yet known on this node (Yjs metadata lag or
 * standalone self-master), adopt the first PQC-verified authority sender as master.
 */
export function isAuthorizedAuthoritySender(fromPeerId: string): boolean {
  const masterId = dbSync.getMasterPeerId();
  if (masterId && masterId !== dbSync.localPeerId) {
    return fromPeerId === masterId;
  }
  if (dbSync.isAuthorityPeerId(fromPeerId)) return true;
  if (dbSync.isPeerVerified(fromPeerId)) {
    // Mesh bootstrap — first verified authority peer becomes master
    dbSync.setMasterPeerId(fromPeerId);
    dbSync.updateLinkedNode(fromPeerId, { role: 'admin', isMaster: true }, fromPeerId);
    return true;
  }
  return false;
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
