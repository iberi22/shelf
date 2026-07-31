/**
 * Post-quantum cryptography helpers for the P2P handshake.
 *
 * Pure functions extracted from P2PManager — key generation, signing,
 * and verification. These have no dependency on the class instance.
 */
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { decapsulate, encapsulate, fromHex, generateDSAKeyPair, generateKEMKeyPair, toHex } from '../crypto-pqc';

// ─── Key management ─────────────────────────────────────────────────────────

export type PQCKeys = { publicKey: Uint8Array; secretKey: Uint8Array };

/**
 * Load PQC keys from localStorage or generate fresh ones.
 * Used once at class construction time for both KEM and DSA keypairs.
 */
export function loadOrGenerateKeys(type: 'kem' | 'dsa'): PQCKeys {
  if (typeof localStorage !== 'undefined') {
    const pubKey = localStorage.getItem(`shelf_${type}_public_key`);
    const secKey = localStorage.getItem(`shelf_${type}_secret_key`);
    if (pubKey && secKey) {
      return {
        publicKey: fromHex(pubKey),
        secretKey: fromHex(secKey),
      };
    }
  }

  const keys = type === 'kem' ? generateKEMKeyPair() : generateDSAKeyPair();

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`shelf_${type}_public_key`, toHex(keys.publicKey));
    localStorage.setItem(`shelf_${type}_secret_key`, toHex(keys.secretKey));
  }

  return keys;
}

// ─── Signing / verification ─────────────────────────────────────────────────

/** Sign a message with the local DSA secret key. */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ml_dsa65.sign(message, secretKey);
}

/** Verify a DSA signature against a hex-encoded public key. */
export function verify(signature: Uint8Array, message: Uint8Array, publicKeyHex: string): boolean {
  return ml_dsa65.verify(signature, message, fromHex(publicKeyHex));
}

// ─── Re-exports for convenience ─────────────────────────────────────────────
// Sub-modules that only need a few helpers can import from here.

export { decapsulate, encapsulate, fromHex, toHex };
