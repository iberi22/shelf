/**
 * Invitation System for P2P Mesh
 */

import { generateUUID } from './crypto';
import { sign, toHex, verify } from './crypto-pqc';

export interface Invitation {
  code: string;
  expiresAt: number;
  maxUses: number;
  uses: number;
  signature: string; // PQC signature from the inviter (Admin)
}

class InvitationManager {
  /**
   * Creates a new invitation code.
   * Requires an admin's PQC secret key for signing.
   */
  public createInvitation(adminSecretKey: Uint8Array, expiresInMs = 3600000): Invitation {
    const code = generateUUID().substring(0, 8).toUpperCase();
    const expiresAt = Date.now() + expiresInMs;
    const maxUses = 1;

    const dataToSign = new TextEncoder().encode(`${code}:${expiresAt}:${maxUses}`);
    const signature = toHex(sign(dataToSign, adminSecretKey));

    return {
      code,
      expiresAt,
      maxUses,
      uses: 0,
      signature,
    };
  }

  /**
   * Verifies an invitation code against an admin's public key.
   */
  public verifyInvitation(invitation: Invitation, adminPublicKey: Uint8Array): boolean {
    if (Date.now() > invitation.expiresAt) return false;
    if (invitation.uses >= invitation.maxUses) return false;

    const dataToVerify = new TextEncoder().encode(`${invitation.code}:${invitation.expiresAt}:${invitation.maxUses}`);
    // PQC verification
    return verify(new TextEncoder().encode(invitation.signature), dataToVerify, adminPublicKey);
  }
}

export const invitationManager = new InvitationManager();
