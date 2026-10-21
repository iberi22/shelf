import { describe, expect, it } from 'vitest';
import { decryptData, encryptData } from '../src/crypto';
import {
  base64SaltToHex,
  clearKDFMetadata,
  createMemoryKDFStorage,
  deriveATRestKey,
  derivePBKDF2Key,
  derivePQCKDF,
  detectKDFFormat,
  generateKDFSalt,
  KDF_METADATA_KEY,
  type KDFStorage,
  LEGACY_PBKDF2_ITERATIONS,
  LEGACY_SALT_KEY,
  loadKDFMetadata,
  migratePBKDF2ToPQC,
  PBKDF2_ITERATIONS,
  PQC_KDF_DEFAULT_ITERATIONS,
  rewrapLegacyPBKDF2,
  storeKDFMetadata,
} from '../src/crypto-kdf';
import { fromHex } from '../src/crypto-pqc';

const PIN = '123456';
const OTHER_PIN = '654321';
const SECRET = 'the-vault-plaintext';

/** Fresh, isolated storage per test — never shares state with other tests. */
const makeStorage = (): KDFStorage => createMemoryKDFStorage();

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/** Encodes bytes (as hex) into the base64 salt format used by legacy crypto.ts. */
const legacyBase64Salt = (saltHex: string): string => btoa(String.fromCharCode(...fromHex(saltHex)));

describe('derivePQCKDF (ML-KEM-768)', () => {
  it('derives an AES-GCM-256 key with 32 bytes of raw key material', async () => {
    const { key, rawKey } = await derivePQCKDF(PIN, generateKDFSalt(), 3);
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
    expect(key.usages).toEqual(expect.arrayContaining(['encrypt', 'decrypt']));
    expect(rawKey).toHaveLength(32);
  });

  it('is deterministic for the same (pin, salt, iterations)', async () => {
    const salt = generateKDFSalt();
    const first = await derivePQCKDF(PIN, salt, 3);
    const second = await derivePQCKDF(PIN, salt, 3);
    expect(sameBytes(first.rawKey, second.rawKey)).toBe(true);

    const ciphertext = await encryptData(SECRET, first.key);
    await expect(decryptData(ciphertext, second.key)).resolves.toBe(SECRET);
  });

  it('accepts raw Uint8Array salts and matches the hex form', async () => {
    const saltHex = generateKDFSalt();
    const fromHexSalt = await derivePQCKDF(PIN, saltHex, 3);
    const fromBytesSalt = await derivePQCKDF(PIN, fromHex(saltHex), 3);
    expect(sameBytes(fromHexSalt.rawKey, fromBytesSalt.rawKey)).toBe(true);
  });

  it('produces different keys for different salts', async () => {
    const keyA = await derivePQCKDF(PIN, generateKDFSalt(), 3);
    const keyB = await derivePQCKDF(PIN, generateKDFSalt(), 3);
    expect(sameBytes(keyA.rawKey, keyB.rawKey)).toBe(false);
  });

  it('produces different keys for different pins', async () => {
    const salt = generateKDFSalt();
    const pinA = await derivePQCKDF(PIN, salt, 3);
    const pinB = await derivePQCKDF(OTHER_PIN, salt, 3);
    expect(sameBytes(pinA.rawKey, pinB.rawKey)).toBe(false);
  });

  it('is sensitive to the iteration count (part of the KDF parameters)', async () => {
    const salt = generateKDFSalt();
    const rounds3 = await derivePQCKDF(PIN, salt, 3);
    const rounds4 = await derivePQCKDF(PIN, salt, 4);
    expect(sameBytes(rounds3.rawKey, rounds4.rawKey)).toBe(false);
  });

  it('defaults to PQC_KDF_DEFAULT_ITERATIONS rounds', async () => {
    const salt = generateKDFSalt();
    const defaultRounds = await derivePQCKDF(PIN, salt);
    const explicitRounds = await derivePQCKDF(PIN, salt, PQC_KDF_DEFAULT_ITERATIONS);
    expect(sameBytes(defaultRounds.rawKey, explicitRounds.rawKey)).toBe(true);
  });

  it('round-trips data through the shared AES-GCM ciphertext format', async () => {
    const { key } = await derivePQCKDF(PIN, generateKDFSalt(), 3);
    const ciphertext = await encryptData(SECRET, key);
    await expect(decryptData(ciphertext, key)).resolves.toBe(SECRET);
  });

  it('cannot be decrypted with a wrong PIN (AES-GCM authentication)', async () => {
    const salt = generateKDFSalt();
    const { key } = await derivePQCKDF(PIN, salt, 3);
    const ciphertext = await encryptData(SECRET, key);
    const { key: wrongKey } = await derivePQCKDF(OTHER_PIN, salt, 3);
    await expect(decryptData(ciphertext, wrongKey)).rejects.toThrow();
  });
});

describe('storeKDFMetadata / loadKDFMetadata', () => {
  it('persists and reloads a PQC metadata document (default format)', () => {
    const storage = makeStorage();
    const salt = generateKDFSalt();
    const metadata = storeKDFMetadata(salt, 42, { storage });

    expect(metadata).toEqual({ version: 1, format: 'pqc-kem', salt, iterations: 42 });
    expect(JSON.parse(storage.getItem(KDF_METADATA_KEY)!)).toEqual(metadata);
    expect(loadKDFMetadata(storage)).toEqual(metadata);
  });

  it('supports explicit pbkdf2 format and custom storage keys', () => {
    const storage = makeStorage();
    const salt = generateKDFSalt();
    const legacyMeta = storeKDFMetadata(salt, LEGACY_PBKDF2_ITERATIONS, {
      format: 'pbkdf2',
      storage,
      key: 'custom-key',
    });
    expect(legacyMeta.format).toBe('pbkdf2');
    expect(loadKDFMetadata(storage, 'custom-key')).toEqual(legacyMeta);
    // Default key remains untouched when a custom key is used.
    expect(loadKDFMetadata(storage)).toBeNull();
  });

  it('keeps isolated storages independent', () => {
    const storageA = makeStorage();
    storeKDFMetadata(generateKDFSalt(), 3, { storage: storageA });
    expect(loadKDFMetadata(makeStorage())).toBeNull();
    expect(loadKDFMetadata(storageA)).not.toBeNull();
  });

  it('clearKDFMetadata removes the document', () => {
    const storage = makeStorage();
    storeKDFMetadata(generateKDFSalt(), 3, { storage });
    clearKDFMetadata(storage);
    expect(loadKDFMetadata(storage)).toBeNull();
    expect(detectKDFFormat(storage)).toBeNull();
  });

  it('treats corrupt or unknown-version metadata as absent', () => {
    const storage = makeStorage();
    storage.setItem(KDF_METADATA_KEY, '{not-json');
    expect(loadKDFMetadata(storage)).toBeNull();

    storage.setItem(KDF_METADATA_KEY, JSON.stringify({ version: 99, format: 'pqc-kem', salt: 'aa', iterations: 1 }));
    expect(loadKDFMetadata(storage)).toBeNull();
  });
});

describe('detectKDFFormat', () => {
  it('returns null for a fresh install', () => {
    expect(detectKDFFormat(makeStorage())).toBeNull();
  });

  it('detects a PQC-wrapped vault from metadata', () => {
    const storage = makeStorage();
    storeKDFMetadata(generateKDFSalt(), 3, { storage });
    expect(detectKDFFormat(storage)).toBe('pqc-kem');
  });

  it('detects a legacy vault from pbkdf2 metadata', () => {
    const storage = makeStorage();
    storeKDFMetadata(generateKDFSalt(), LEGACY_PBKDF2_ITERATIONS, { format: 'pbkdf2', storage });
    expect(detectKDFFormat(storage)).toBe('pbkdf2');
  });

  it('detects an implicit legacy install from the shelf_app_salt key only', () => {
    const storage = makeStorage();
    storage.setItem(LEGACY_SALT_KEY, legacyBase64Salt(generateKDFSalt()));
    expect(detectKDFFormat(storage)).toBe('pbkdf2');
  });

  it('base64SaltToHex decodes the legacy salt encoding', () => {
    const saltHex = generateKDFSalt();
    expect(base64SaltToHex(legacyBase64Salt(saltHex))).toBe(saltHex);
  });
});

describe('deriveATRestKey — unlock paths', () => {
  it('seals PQC metadata on a fresh install and returns a working key', async () => {
    const storage = makeStorage();
    const unlock = await deriveATRestKey(PIN, { storage, iterations: 3 });

    expect(unlock.format).toBe('pqc-kem');
    expect(unlock.needsMigration).toBe(false);
    expect(unlock.metadata.format).toBe('pqc-kem');
    expect(loadKDFMetadata(storage)?.format).toBe('pqc-kem');

    const ciphertext = await encryptData(SECRET, unlock.key);
    await expect(decryptData(ciphertext, unlock.key)).resolves.toBe(SECRET);
  });

  it('re-derives the same PQC key on subsequent unlocks', async () => {
    const storage = makeStorage();
    const first = await deriveATRestKey(PIN, { storage, iterations: 3 });
    const second = await deriveATRestKey(PIN, { storage });

    expect(second.format).toBe('pqc-kem');
    expect(second.needsMigration).toBe(false);
    expect(sameBytes(first.rawKey, second.rawKey)).toBe(true);
  });

  it('opens an implicit legacy vault (shelf_app_salt) and flags migration', async () => {
    const storage = makeStorage();
    const legacySaltHex = generateKDFSalt();
    storage.setItem(LEGACY_SALT_KEY, legacyBase64Salt(legacySaltHex));

    const { key: legacyKey } = await derivePBKDF2Key(PIN, legacySaltHex, LEGACY_PBKDF2_ITERATIONS);
    const legacyCiphertext = await encryptData(SECRET, legacyKey);

    const unlock = await deriveATRestKey(PIN, { storage, iterations: 3 });
    expect(unlock.format).toBe('pbkdf2');
    expect(unlock.needsMigration).toBe(true);
    // Explicit metadata was sealed so the migration window is stable.
    expect(loadKDFMetadata(storage)?.format).toBe('pbkdf2');
    expect(loadKDFMetadata(storage)?.salt).toBe(legacySaltHex);
    // Legacy ciphertext still decrypts during the migration window.
    await expect(decryptData(legacyCiphertext, unlock.key)).resolves.toBe(SECRET);
  });

  it('keeps decrypting PBKDF2-encrypted data from explicit legacy metadata', async () => {
    const storage = makeStorage();
    const saltHex = generateKDFSalt();
    storeKDFMetadata(saltHex, LEGACY_PBKDF2_ITERATIONS, { format: 'pbkdf2', storage });

    const { key: legacyKey } = await derivePBKDF2Key(PIN, saltHex, LEGACY_PBKDF2_ITERATIONS);
    const legacyCiphertext = await encryptData(SECRET, legacyKey);

    const unlock = await deriveATRestKey(PIN, { storage });
    expect(unlock.format).toBe('pbkdf2');
    expect(unlock.needsMigration).toBe(true);
    await expect(decryptData(legacyCiphertext, unlock.key)).resolves.toBe(SECRET);
  });
});

describe('migratePBKDF2ToPQC — full migration window', () => {
  it('migrates a legacy vault to the PQC KDF on the next unlock', async () => {
    const storage = makeStorage();
    const legacySaltHex = generateKDFSalt();
    storage.setItem(LEGACY_SALT_KEY, legacyBase64Salt(legacySaltHex));

    // Older deployment: PBKDF2-wrapped vault.
    const { key: legacyKey } = await derivePBKDF2Key(PIN, legacySaltHex, LEGACY_PBKDF2_ITERATIONS);
    const legacyCiphertext = await encryptData(SECRET, legacyKey);

    // Unlock #1 (migration window): PBKDF2 still opens the vault.
    const unlock1 = await deriveATRestKey(PIN, { storage, iterations: 3 });
    expect(unlock1.format).toBe('pbkdf2');
    expect(unlock1.needsMigration).toBe(true);
    await expect(decryptData(legacyCiphertext, unlock1.key)).resolves.toBe(SECRET);

    // Re-wrap with the PQC KDF on this same unlock.
    const migrated = await migratePBKDF2ToPQC(PIN, legacyCiphertext, { storage, iterations: 3 });
    expect(migrated.metadata.format).toBe('pqc-kem');
    expect(migrated.metadata.salt).not.toBe(legacySaltHex);
    expect(loadKDFMetadata(storage)?.format).toBe('pqc-kem');

    // Unlock #2 (post-migration): PQC KDF opens the migrated vault.
    const unlock2 = await deriveATRestKey(PIN, { storage });
    expect(unlock2.format).toBe('pqc-kem');
    expect(unlock2.needsMigration).toBe(false);
    await expect(decryptData(migrated.ciphertext, unlock2.key)).resolves.toBe(SECRET);

    // Key rotation happened: the old PBKDF2 key no longer opens the vault.
    await expect(decryptData(migrated.ciphertext, legacyKey)).rejects.toThrow();

    // Wrong PIN cannot open the migrated vault.
    const { key: wrongKey } = await derivePQCKDF(OTHER_PIN, migrated.metadata.salt, migrated.metadata.iterations);
    await expect(decryptData(migrated.ciphertext, wrongKey)).rejects.toThrow();
  });

  it('supports explicit legacy salt/iterations overrides', async () => {
    const storage = makeStorage();
    const legacySaltHex = generateKDFSalt();
    const { key: legacyKey } = await derivePBKDF2Key(PIN, legacySaltHex, 10_000);
    const legacyCiphertext = await encryptData(SECRET, legacyKey);

    const migrated = await migratePBKDF2ToPQC(PIN, legacyCiphertext, {
      storage,
      iterations: 3,
      legacySalt: legacySaltHex,
      legacyIterations: 10_000,
    });
    expect(migrated.metadata.format).toBe('pqc-kem');

    const unlock = await deriveATRestKey(PIN, { storage });
    await expect(decryptData(migrated.ciphertext, unlock.key)).resolves.toBe(SECRET);
  });

  it('throws when no legacy salt can be located', async () => {
    const storage = makeStorage();
    await expect(migratePBKDF2ToPQC(PIN, 'irrelevant', { storage })).rejects.toThrow(/no legacy PBKDF2 salt/);
  });
});

describe('600k PBKDF2 for at-rest metadata', () => {
  const legacyVault = async () => {
    const storage = makeStorage();
    const saltHex = generateKDFSalt();
    storeKDFMetadata(saltHex, LEGACY_PBKDF2_ITERATIONS, { format: 'pbkdf2', storage });
    const { key } = await derivePBKDF2Key(PIN, saltHex, LEGACY_PBKDF2_ITERATIONS);
    return { storage, saltHex, ciphertext: await encryptData(SECRET, key) };
  };

  it('writes new metadata with 600000 iterations', async () => {
    const { storage, ciphertext } = await legacyVault();
    const res = await rewrapLegacyPBKDF2(PIN, ciphertext, { storage });
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    expect(res?.metadata.iterations).toBe(600_000);
  });

  it('legacy 100k metadata decrypts, and is re-wrapped to 600k after unlock', async () => {
    const { storage, saltHex, ciphertext } = await legacyVault();
    const unlock = await deriveATRestKey(PIN, { storage });
    expect(unlock.metadata.iterations).toBe(100_000);
    await expect(decryptData(ciphertext, unlock.key)).resolves.toBe(SECRET);

    const res = await rewrapLegacyPBKDF2(PIN, ciphertext, { storage });
    expect(res).not.toBeNull();
    const stored = loadKDFMetadata(storage);
    expect(stored?.iterations).toBe(600_000);
    expect(stored?.salt).not.toBe(saltHex);
    const again = await deriveATRestKey(PIN, { storage });
    await expect(decryptData(res!.ciphertext, again.key)).resolves.toBe(SECRET);
    await expect(rewrapLegacyPBKDF2(PIN, res!.ciphertext, { storage })).resolves.toBeNull();
  });

  it('wrong PIN fails and leaves metadata untouched', async () => {
    const { storage, ciphertext } = await legacyVault();
    const before = storage.getItem(KDF_METADATA_KEY);
    await expect(rewrapLegacyPBKDF2(OTHER_PIN, ciphertext, { storage })).rejects.toThrow();
    expect(storage.getItem(KDF_METADATA_KEY)).toBe(before);
  });

  it('derived keys are non-extractable', async () => {
    const pbkdf2 = await derivePBKDF2Key(PIN, generateKDFSalt(), 1000);
    expect(pbkdf2.key.extractable).toBe(false);
    const pqc = await derivePQCKDF(PIN, generateKDFSalt(), 2);
    expect(pqc.key.extractable).toBe(false);
  });
});
