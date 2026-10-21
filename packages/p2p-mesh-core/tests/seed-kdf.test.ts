import { describe, expect, it } from 'vitest';
import { toHex } from '../src/crypto-pqc';
import { createKeyRotation, deriveSeedV2, SEED_KDF_MARKER_KEY, SEED_KDF_V2, verifyKeyRotation } from '../src/seed-kdf';

const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('seed v2 derivation', () => {
  it('is deterministic with a pinned vector', async () => {
    const a = await deriveSeedV2(PHRASE);
    const b = await deriveSeedV2(`  ${PHRASE.toUpperCase()}  `.normalize('NFKD'));
    expect(toHex(a.dataKey)).toBe(toHex(b.dataKey));
    expect(toHex(a.dsa.publicKey)).toBe(toHex(b.dsa.publicKey));
    expect(a.dataKey).toHaveLength(32);
    expect(toHex(a.dataKey)).toBe(DATA_KEY_VECTOR);
    expect(toHex(a.dsaSeed)).toBe(DSA_SEED_VECTOR);
    expect(toHex(a.kemSeed)).toBe(KEM_SEED_VECTOR);
  });

  it('keeps dsa, kem and data seeds independent', async () => {
    const k = await deriveSeedV2(PHRASE);
    expect(k.dsaSeed).toHaveLength(32);
    expect(k.kemSeed).toHaveLength(64);
    expect(toHex(k.dsaSeed)).not.toBe(toHex(k.kemSeed.subarray(0, 32)));
    expect(toHex(k.dsaSeed)).not.toBe(toHex(k.dataKey));
    expect(toHex(k.kemSeed.subarray(0, 32))).not.toBe(toHex(k.dataKey));
  });

  it('differs from the v1 unsalted SHA-512 derivation', async () => {
    const v1 = new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(PHRASE)));
    const k = await deriveSeedV2(PHRASE);
    expect(toHex(k.dsaSeed)).not.toBe(toHex(v1.subarray(0, 32)));
    expect(SEED_KDF_V2).toBe('v2');
    expect(SEED_KDF_MARKER_KEY).toBe('shelf_seed_kdf');
  });
});

describe('cross-signed key rotation', () => {
  it('verifies in both directions and rejects tampering', async () => {
    const oldK = await deriveSeedV2('legacy words one two three');
    const newK = await deriveSeedV2(PHRASE);
    const rot = createKeyRotation(oldK.dsa, newK.dsa);
    expect(verifyKeyRotation(rot, toHex(oldK.dsa.publicKey))).toBe(true);
    expect(verifyKeyRotation(rot, toHex(newK.dsa.publicKey))).toBe(false);
    const forged = { ...rot, newDsaPublicKey: toHex(oldK.kem.publicKey) };
    expect(verifyKeyRotation(forged, toHex(oldK.dsa.publicKey))).toBe(false);
    const swapped = { ...rot, oldSignature: rot.newSignature };
    expect(verifyKeyRotation(swapped, toHex(oldK.dsa.publicKey))).toBe(false);
  });
});

const DATA_KEY_VECTOR = '9ea2b72bfd44cc9cbea7bf158dc521e1d644b220aac69606950c43cb8b142b17';
const DSA_SEED_VECTOR = '40f7c5dc33a999a06399d59a01205780b0cd276e2abec36803f2a80f02fed488';
const KEM_SEED_VECTOR =
  '5e5951d9866d88c79f4a7064fa16cdb5ba3b66dfedeb33096704c7a29099b99e788ddf52d840d11292ae7d56b3b468aa4d12d58d0b11803211d07ab9d04c6c53';
