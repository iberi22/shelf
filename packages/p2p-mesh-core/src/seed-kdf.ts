/**
 * Seed v2: salted, stretched, domain-separated derivation of the PQC identity
 * keys and the data key from a recovery phrase.
 *
 *   m       = PBKDF2-SHA512(NFKD(phrase), salt 'swal-seed/v2', 210000, 64B)
 *   dsaSeed = HKDF-SHA256(m, 'swal-seed/v2|ml-dsa-65', 32)
 *   kemSeed = HKDF-SHA256(m, 'swal-seed/v2|ml-kem-768', 64)
 *   dataKey = HKDF-SHA256(m, 'swal-seed/v2|data', 32)
 *
 * Also holds the cross-signed key rotation used to migrate v1 identities.
 */
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { fromHex, type PQCKeyPair, toHex } from './crypto-pqc';

export const SEED_KDF_MARKER_KEY = 'shelf_seed_kdf';
export const SEED_KDF_V2 = 'v2';
export const SEED_V2_SALT = 'swal-seed/v2';
export const SEED_V2_ITERATIONS = 210_000;

const enc = new TextEncoder();

export interface SeedV2Keys {
  dsaSeed: Uint8Array;
  kemSeed: Uint8Array;
  dataKey: Uint8Array;
  dsa: PQCKeyPair;
  kem: PQCKeyPair;
}

export const normalizePhrase = (phrase: string): string =>
  phrase.normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' ');

const hkdf = async (m: Uint8Array, info: string, bytes: number): Promise<Uint8Array> => {
  const base = await crypto.subtle.importKey('raw', m as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) },
    base,
    bytes * 8,
  );
  return new Uint8Array(bits);
};

export const deriveSeedV2 = async (phrase: string): Promise<SeedV2Keys> => {
  const pw = await crypto.subtle.importKey('raw', enc.encode(normalizePhrase(phrase)), 'PBKDF2', false, ['deriveBits']);
  const m = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-512', salt: enc.encode(SEED_V2_SALT), iterations: SEED_V2_ITERATIONS },
      pw,
      512,
    ),
  );
  const dsaSeed = await hkdf(m, 'swal-seed/v2|ml-dsa-65', 32);
  const kemSeed = await hkdf(m, 'swal-seed/v2|ml-kem-768', 64);
  const dataKey = await hkdf(m, 'swal-seed/v2|data', 32);
  const d = ml_dsa65.keygen(dsaSeed);
  const k = ml_kem768.keygen(kemSeed);
  return {
    dsaSeed,
    kemSeed,
    dataKey,
    dsa: { publicKey: d.publicKey, secretKey: d.secretKey },
    kem: { publicKey: k.publicKey, secretKey: k.secretKey },
  };
};

// ─── Cross-signed key rotation ──────────────────────────────────────────────

export interface KeyRotation {
  type: 'KEY_ROTATION';
  oldDsaPublicKey: string;
  newDsaPublicKey: string;
  /** Signed by the OLD key over the NEW public key. */
  oldSignature: string;
  /** Signed by the NEW key over the OLD public key. */
  newSignature: string;
}

const stmt = (label: string, pub: string) => enc.encode(`swal-seed/v2|rotation|${label}|${pub}`);

export const createKeyRotation = (oldDsa: PQCKeyPair, newDsa: PQCKeyPair): KeyRotation => {
  const oldPub = toHex(oldDsa.publicKey);
  const newPub = toHex(newDsa.publicKey);
  return {
    type: 'KEY_ROTATION',
    oldDsaPublicKey: oldPub,
    newDsaPublicKey: newPub,
    oldSignature: toHex(ml_dsa65.sign(stmt('new', newPub), oldDsa.secretKey)),
    newSignature: toHex(ml_dsa65.sign(stmt('old', oldPub), newDsa.secretKey)),
  };
};

/**
 * A peer accepts the new key only when BOTH signatures verify and the old key
 * is the one it already trusts.
 */
export const verifyKeyRotation = (rot: KeyRotation, trustedOldDsaPublicKey: string): boolean => {
  try {
    if (rot.oldDsaPublicKey !== trustedOldDsaPublicKey) return false;
    return (
      ml_dsa65.verify(fromHex(rot.oldSignature), stmt('new', rot.newDsaPublicKey), fromHex(rot.oldDsaPublicKey)) &&
      ml_dsa65.verify(fromHex(rot.newSignature), stmt('old', rot.oldDsaPublicKey), fromHex(rot.newDsaPublicKey))
    );
  } catch {
    return false;
  }
};
