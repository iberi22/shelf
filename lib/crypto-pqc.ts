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
