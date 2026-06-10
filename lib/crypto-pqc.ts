import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

/**
 * PQC Key Management
 */

export interface PQCKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Generates an ML-KEM-768 key pair for key encapsulation.
 */
export const generateKEMKeyPair = (): PQCKeyPair => {
  const keys = ml_kem768.keygen();
  return { publicKey: keys.publicKey, secretKey: keys.secretKey };
};

/**
 * Encapsulates a shared secret for a given public key.
 * Returns the ciphertext and the shared secret.
 */
export const encapsulate = (publicKey: Uint8Array): { ciphertext: Uint8Array; sharedSecret: Uint8Array } => {
  const res = ml_kem768.encapsulate(publicKey);
  return { ciphertext: res.cipherText, sharedSecret: res.sharedSecret };
};

/**
 * Decapsulates a ciphertext using a secret key to recover the shared secret.
 */
export const decapsulate = (ciphertext: Uint8Array, secretKey: Uint8Array): Uint8Array => {
  return ml_kem768.decapsulate(ciphertext, secretKey);
};

/**
 * Generates an ML-DSA-65 key pair for digital signatures.
 */
export const generateDSAKeyPair = (): PQCKeyPair => {
  const keys = ml_dsa65.keygen();
  return { publicKey: keys.publicKey, secretKey: keys.secretKey };
};

/**
 * Signs a message using an ML-DSA secret key.
 */
export const sign = (message: Uint8Array, secretKey: Uint8Array): Uint8Array => {
  return ml_dsa65.sign(message, secretKey);
};

/**
 * Verifies an ML-DSA signature.
 */
export const verify = (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean => {
  return ml_dsa65.verify(signature, message, publicKey);
};

/**
 * Utility to convert Uint8Array to Hex string.
 */
export const toHex = (arr: Uint8Array): string =>
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * Utility to convert Hex string to Uint8Array.
 */
export const fromHex = (hex: string): Uint8Array => {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Number.parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
};

// Aliases and additional functions for P2PSyncManager
export const encapsulateSecret = encapsulate;
export const decapsulateSecret = decapsulate;
export const signPayload = sign;
export const verifyPayload = verify;

export const deriveAESKeyFromSharedSecret = async (sharedSecret: Uint8Array): Promise<CryptoKey> => {
  const hash = await crypto.subtle.digest('SHA-256', sharedSecret);
  return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
};

export const encryptWithPQC = async (data: string, key: CryptoKey): Promise<string> => {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
};

export const decryptWithPQC = async (base64: string, key: CryptoKey): Promise<string> => {
  const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
};
