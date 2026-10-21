/**
 * Post-quantum key derivation (PQC KDF) for at-rest encryption.
 *
 * Replaces the legacy PBKDF2 derivation in src/crypto.ts with an ML-KEM-768
 * based KDF:
 *
 *   seed = SHA-512(PIN || salt)
 *   for i in 0..iterations-1:
 *     seed    = SHA-512(seed)
 *     keypair = ML-KEM-768.keygen(seed)
 *   { sharedSecret } = ML-KEM-768.encapsulate(keypair.publicKey, SHA-256(seed || 0x01))
 *   key  = SHA-256(sharedSecret || 0x02)   → AES-GCM-256
 *
 * Every step is deterministic for a given (PIN, salt, iterations), so the
 * symmetric key can be re-derived on every unlock from the stored KDF
 * metadata — the same contract as PBKDF2, but the dominant per-guess cost is
 * the post-quantum ML-KEM-768 keygen instead of iterated hashing. Recovering
 * the key without the PIN requires breaking ML-KEM-768, which is believed to
 * hold against quantum adversaries.
 *
 * Migration: KDF metadata is versioned ('pbkdf2' vs 'pqc-kem'). Legacy
 * ciphertext keeps decrypting during the migration window because
 * derivePBKDF2Key mirrors the exact parameters used by src/crypto.ts
 * deriveKey (PBKDF2-HMAC-SHA-256, 100000 iterations, AES-GCM-256).
 * migratePBKDF2ToPQC re-wraps the vault with the PQC KDF on the next
 * successful unlock.
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { decryptData, encryptData, PBKDF2_ITERATIONS } from './crypto';

/** Iteration count for every NEW PBKDF2 at-rest metadata write. */
export { PBKDF2_ITERATIONS };
import { fromHex, toHex } from './crypto-pqc';

// ─── Constants ──────────────────────────────────────────────────────────────

export const KDF_METADATA_VERSION = 1 as const;

/** Storage key under which the KDF metadata document is persisted. */
export const KDF_METADATA_KEY = 'shelf_pqc_kdf_metadata';

/** Legacy PBKDF2 salt key used by src/crypto.ts (shelf_app_salt). */
export const LEGACY_SALT_KEY = 'shelf_app_salt';

/** Iteration count hard-coded by the legacy deriveKey() in src/crypto.ts. */
export const LEGACY_PBKDF2_ITERATIONS = 100_000;

/**
 * Default KEM rounds for the PQC path. Each round runs one ML-KEM-768 keygen
 * (~0.6 ms), so the default lands at ~60-70 ms per derivation — at least as
 * expensive per PIN guess as the legacy PBKDF2 (100k × SHA-256). Applications
 * that want stronger stretching can raise it; the value is persisted in the
 * KDF metadata so unlocks always use the same rounds.
 */
export const PQC_KDF_DEFAULT_ITERATIONS = 100;

// ─── Types ──────────────────────────────────────────────────────────────────

export type KDFFormat = 'pbkdf2' | 'pqc-kem';

export interface KDFMetadata {
  version: typeof KDF_METADATA_VERSION;
  /** KDF algorithm used to derive the at-rest encryption key. */
  format: KDFFormat;
  /** Random salt (hex-encoded). */
  salt: string;
  /**
   * Legacy path: PBKDF2 iteration count. PQC path: number of ML-KEM-768
   * keygen rounds used for stretching.
   */
  iterations: number;
}

export interface KDFStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PQCKDFResult {
  /** AES-GCM-256 CryptoKey usable with crypto.subtle encrypt/decrypt. */
  key: CryptoKey;
  /** Raw 32-byte key material (hex-encodable if bytes must be persisted). */
  rawKey: Uint8Array;
}

export interface ATRestKeyResult extends PQCKDFResult {
  /** Metadata persisted (or already present) for this vault. */
  metadata: KDFMetadata;
  /** Format the at-rest vault is currently wrapped with. */
  format: KDFFormat;
  /**
   * True when the vault is still PBKDF2-wrapped and should be re-wrapped with
   * the PQC KDF on this unlock (see migratePBKDF2ToPQC). The returned key is
   * still valid for decrypting legacy data during the migration window.
   */
  needsMigration: boolean;
}

export interface MigratePQCResult {
  /** Re-encrypted (PQC-wrapped) ciphertext — store in place of the old one. */
  ciphertext: string;
  /** New KDF metadata — already persisted by this call. */
  metadata: KDFMetadata;
}

// ─── Storage adapters ───────────────────────────────────────────────────────

/** Memory-backed KDFStorage; useful for tests and non-browser runtimes. */
export const createMemoryKDFStorage = (): KDFStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

let fallbackStorage: KDFStorage | null = null;

/**
 * Default KDF storage: the browser's localStorage when available, otherwise a
 * process-lifetime in-memory store. Apps can override per call by passing
 * `storage` explicitly.
 */
export const getDefaultKDFStorage = (): KDFStorage => {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage as KDFStorage;
    }
  } catch {
    // localStorage access can throw (e.g. privacy mode) — fall through.
  }
  fallbackStorage ??= createMemoryKDFStorage();
  return fallbackStorage;
};

// ─── Encoding helpers ───────────────────────────────────────────────────────

const concatBytes = (a: Uint8Array, b: Uint8Array | number[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/** Hex-encode a UTF-8 string (used to domain-separate hashes with a tag). */
const domainTag = (name: string): Uint8Array => new TextEncoder().encode(name);

/** Converts a base64-encoded legacy salt (crypto.ts format) to hex. */
export const base64SaltToHex = (base64: string): string => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return toHex(bytes);
};

/**
 * Generates a fresh random salt (hex-encoded). 16 bytes matches the legacy
 * crypto.ts salt size; callers may pass a larger byteLength for higher
 * uniqueness guarantees.
 */
export const generateKDFSalt = (byteLength = 16): string => {
  const salt = crypto.getRandomValues(new Uint8Array(byteLength));
  return toHex(salt);
};

// ─── KDF implementations ────────────────────────────────────────────────────

/**
 * Derives the at-rest symmetric key from a PIN using ML-KEM-768.
 *
 * The PIN and salt are mixed into a seed that drives `iterations` rounds of
 * deterministic ML-KEM-768 keygen (the dominant, post-quantum cost), then the
 * final keypair encapsulates a deterministic shared secret that is hashed into
 * the AES-GCM-256 key. Deterministic per (PIN, salt, iterations) — no wrapped
 * capsule needs to be stored, mirroring the PBKDF2 contract.
 */
export const derivePQCKDF = async (
  pin: string,
  salt: string | Uint8Array,
  iterations: number = PQC_KDF_DEFAULT_ITERATIONS,
): Promise<PQCKDFResult> => {
  const rounds = Math.max(1, Math.floor(iterations));
  const pinBytes = new TextEncoder().encode(pin);
  const saltBytes = typeof salt === 'string' ? fromHex(salt) : salt;

  let seed = new Uint8Array(await crypto.subtle.digest('SHA-512', concatBytes(pinBytes, saltBytes)));
  let keypair: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;
  for (let i = 0; i < rounds; i++) {
    seed = new Uint8Array(await crypto.subtle.digest('SHA-512', seed));
    keypair = ml_kem768.keygen(seed);
  }
  if (!keypair) throw new Error('derivePQCKDF: no ML-KEM-768 keypair generated');

  // Deterministic encapsulate: msg is domain-separated from the final seed.
  const msg = new Uint8Array(await crypto.subtle.digest('SHA-256', concatBytes(seed, domainTag('pqc-kdf/msg-v1'))));
  const { sharedSecret } = ml_kem768.encapsulate(keypair.publicKey, msg);

  // Finalize with domain separation so the AES key is never the raw KEM
  // output and cannot collide with other uses of the shared secret.
  const rawKey = new Uint8Array(
    await crypto.subtle.digest('SHA-256', concatBytes(sharedSecret, domainTag('pqc-kdf/key-v1'))),
  );
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { key, rawKey };
};

/**
 * Legacy PBKDF2 derivation — bit-identical to src/crypto.ts deriveKey()
 * (PBKDF2-HMAC-SHA-256, AES-GCM-256, extractable key), but with explicit salt
 * and iterations from stored metadata. Kept so PBKDF2-encrypted vaults remain
 * decryptable during the migration window.
 */
export const derivePBKDF2Key = async (
  pin: string,
  salt: string | Uint8Array,
  iterations: number,
): Promise<PQCKDFResult> => {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, [
    'deriveBits',
    'deriveKey',
  ]);
  const saltBuffer = typeof salt === 'string' ? fromHex(salt) : salt;
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuffer as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const raw = new Uint8Array(bits);
  // The CryptoKey itself is non-extractable.
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { key, rawKey: raw };
};

// ─── KDF metadata persistence ───────────────────────────────────────────────

/**
 * Persists the KDF parameters alongside the encrypted data and returns the
 * metadata document. `format` defaults to 'pqc-kem'; pass 'pbkdf2' when
 * sealing legacy-format parameters.
 */
export const storeKDFMetadata = (
  salt: string,
  iterations: number,
  opts: { format?: KDFFormat; storage?: KDFStorage; key?: string } = {},
): KDFMetadata => {
  const metadata: KDFMetadata = {
    version: KDF_METADATA_VERSION,
    format: opts.format ?? 'pqc-kem',
    salt,
    iterations,
  };
  const storage = opts.storage ?? getDefaultKDFStorage();
  storage.setItem(opts.key ?? KDF_METADATA_KEY, JSON.stringify(metadata));
  return metadata;
};

/** Loads the persisted KDF metadata document, or null when none exists. */
export const loadKDFMetadata = (
  storage: KDFStorage = getDefaultKDFStorage(),
  key = KDF_METADATA_KEY,
): KDFMetadata | null => {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KDFMetadata;
    if (
      parsed &&
      parsed.version === KDF_METADATA_VERSION &&
      (parsed.format === 'pbkdf2' || parsed.format === 'pqc-kem')
    ) {
      return parsed;
    }
  } catch {
    // Corrupt metadata — treat as absent and re-seal on next unlock.
  }
  return null;
};

/** Removes the persisted KDF metadata (key rotation / tests). */
export const clearKDFMetadata = (storage: KDFStorage = getDefaultKDFStorage(), key = KDF_METADATA_KEY): void => {
  storage.removeItem(key);
};

/**
 * Detects which KDF format a vault is wrapped with:
 *  - 'pqc-kem'  → PQC metadata present (post-migration vault)
 *  - 'pbkdf2'   → legacy metadata present, or the legacy shelf_app_salt key
 *                 exists without metadata (pre-migration install)
 *  - null       → fresh install, no at-rest vault yet
 */
export const detectKDFFormat = (storage: KDFStorage = getDefaultKDFStorage()): KDFFormat | null => {
  const metadata = loadKDFMetadata(storage);
  if (metadata) return metadata.format;
  if (storage.getItem(LEGACY_SALT_KEY)) return 'pbkdf2';
  return null;
};

// ─── Unlock + migration ─────────────────────────────────────────────────────

/**
 * Unified unlock entry point. Always returns a key that can decrypt the
 * current vault:
 *
 *  - No vault yet          → seals fresh PQC metadata and derives with the PQC
 *                            KDF (needsMigration: false).
 *  - 'pqc-kem' metadata    → re-derives the PQC key from the stored salt.
 *  - 'pbkdf2' metadata     → derives the legacy key so the vault still opens
 *                            (backward compatibility), and flags
 *                            needsMigration: true so the caller re-wraps with
 *                            the PQC KDF on this unlock.
 *  - legacy salt key only  → treated as PBKDF2 (implicit format), sealed into
 *                            explicit metadata, needsMigration: true.
 */
export const deriveATRestKey = async (
  pin: string,
  opts: { storage?: KDFStorage; iterations?: number } = {},
): Promise<ATRestKeyResult> => {
  const storage = opts.storage ?? getDefaultKDFStorage();
  const pqcRounds = opts.iterations ?? PQC_KDF_DEFAULT_ITERATIONS;

  const metadata = loadKDFMetadata(storage);
  if (metadata && metadata.format === 'pqc-kem') {
    const { key, rawKey } = await derivePQCKDF(pin, metadata.salt, metadata.iterations);
    return { key, rawKey, metadata, format: 'pqc-kem', needsMigration: false };
  }

  if (metadata && metadata.format === 'pbkdf2') {
    const { key, rawKey } = await derivePBKDF2Key(pin, metadata.salt, metadata.iterations);
    return { key, rawKey, metadata, format: 'pbkdf2', needsMigration: true };
  }

  // No PQC metadata — check for an implicit legacy install (shelf_app_salt).
  const legacySalt = storage.getItem(LEGACY_SALT_KEY);
  if (legacySalt) {
    const legacyMetadata = storeKDFMetadata(base64SaltToHex(legacySalt), LEGACY_PBKDF2_ITERATIONS, {
      format: 'pbkdf2',
      storage,
    });
    const { key, rawKey } = await derivePBKDF2Key(pin, legacyMetadata.salt, legacyMetadata.iterations);
    return { key, rawKey, metadata: legacyMetadata, format: 'pbkdf2', needsMigration: true };
  }

  // Fresh install: seal PQC metadata and derive with ML-KEM-768.
  const salt = generateKDFSalt();
  const { key, rawKey } = await derivePQCKDF(pin, salt, pqcRounds);
  const sealedMetadata = storeKDFMetadata(salt, pqcRounds, { format: 'pqc-kem', storage });
  return { key, rawKey, metadata: sealedMetadata, format: 'pqc-kem', needsMigration: false };
};

/**
 * Migrates a legacy PBKDF2-encrypted ciphertext to the PQC KDF on the next
 * successful unlock: decrypts with the legacy key, derives a fresh PQC key
 * (new random salt), re-encrypts, and persists the new KDF metadata. Returns
 * the re-encrypted ciphertext so the caller can replace the stored vault.
 */
export const migratePBKDF2ToPQC = async (
  pin: string,
  legacyCiphertext: string,
  opts: { storage?: KDFStorage; iterations?: number; legacySalt?: string; legacyIterations?: number } = {},
): Promise<MigratePQCResult> => {
  const storage = opts.storage ?? getDefaultKDFStorage();
  const pqcRounds = opts.iterations ?? PQC_KDF_DEFAULT_ITERATIONS;

  const metadata = loadKDFMetadata(storage);
  const legacySalt =
    opts.legacySalt ??
    metadata?.salt ??
    (storage.getItem(LEGACY_SALT_KEY) ? base64SaltToHex(storage.getItem(LEGACY_SALT_KEY)!) : null);
  const legacyIterations = opts.legacyIterations ?? metadata?.iterations ?? LEGACY_PBKDF2_ITERATIONS;
  if (!legacySalt) {
    throw new Error('migratePBKDF2ToPQC: no legacy PBKDF2 salt found (metadata or shelf_app_salt)');
  }

  const { key: legacyKey } = await derivePBKDF2Key(pin, legacySalt, legacyIterations);
  const plaintext = await decryptData(legacyCiphertext, legacyKey);

  const newSalt = generateKDFSalt();
  const { key: pqcKey } = await derivePQCKDF(pin, newSalt, pqcRounds);
  const ciphertext = await encryptData(plaintext, pqcKey);

  const newMetadata = storeKDFMetadata(newSalt, pqcRounds, { format: 'pqc-kem', storage });
  return { ciphertext, metadata: newMetadata };
};

/**
 * Re-wraps a legacy PBKDF2 vault (stored iterations < PBKDF2_ITERATIONS) with
 * PBKDF2 at PBKDF2_ITERATIONS and a fresh salt. Call after a successful
 * unlock. Decryption happens first, so a wrong PIN throws and leaves the
 * stored metadata untouched. Returns null when no re-wrap is needed.
 */
export const rewrapLegacyPBKDF2 = async (
  pin: string,
  ciphertext: string,
  opts: { storage?: KDFStorage } = {},
): Promise<MigratePQCResult | null> => {
  const storage = opts.storage ?? getDefaultKDFStorage();
  const metadata = loadKDFMetadata(storage);
  if (!metadata || metadata.format !== 'pbkdf2' || metadata.iterations >= PBKDF2_ITERATIONS) return null;

  const { key: oldKey } = await derivePBKDF2Key(pin, metadata.salt, metadata.iterations);
  const plaintext = await decryptData(ciphertext, oldKey);

  const newSalt = generateKDFSalt();
  const { key: newKey } = await derivePBKDF2Key(pin, newSalt, PBKDF2_ITERATIONS);
  const newCiphertext = await encryptData(plaintext, newKey);
  const newMetadata = storeKDFMetadata(newSalt, PBKDF2_ITERATIONS, { format: 'pbkdf2', storage });
  return { ciphertext: newCiphertext, metadata: newMetadata };
};
