import { fromHex, sign, toHex, verify } from 'p2p-mesh-core';

export type MeshRole = 'ADMIN' | 'COLLABORATOR' | 'VIEWER';

export interface MeshSession {
  peerId: string;
  role: MeshRole;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

class AuthMeshManager {
  /**
   * Issues a signed session token for a peer.
   */
  public issueSession(
    peerId: string,
    role: MeshRole,
    adminSecretKey: Uint8Array,
    durationMs = 86400000, // 24 hours
  ): MeshSession {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + durationMs;
    const payload = `${peerId}:${role}:${issuedAt}:${expiresAt}`;

    const signature = toHex(sign(new TextEncoder().encode(payload), adminSecretKey));

    return {
      peerId,
      role,
      issuedAt,
      expiresAt,
      signature,
    };
  }

  /**
   * Verifies a session token using the admin's public key.
   */
  public verifySession(session: MeshSession, adminPublicKey: Uint8Array): boolean {
    if (Date.now() > session.expiresAt) return false;

    const payload = `${session.peerId}:${session.role}:${session.issuedAt}:${session.expiresAt}`;
    return verify(fromHex(session.signature), new TextEncoder().encode(payload), adminPublicKey);
  }

  /**
   * Check if a role has permission for an action.
   * Simple RBAC.
   */
  public canPerformAction(role: MeshRole, action: 'WRITE' | 'READ' | 'MANAGE_USERS'): boolean {
    switch (role) {
      case 'ADMIN':
        return true;
      case 'COLLABORATOR':
        return action === 'WRITE' || action === 'READ';
      case 'VIEWER':
        return action === 'READ';
      default:
        return false;
    }
  }
}

export const authMeshManager = new AuthMeshManager();
