import { describe, expect, it } from 'vitest';
import { persistSeedMaterial } from '../src/seed-storage';

const mem = () => {
  const m = new Map<string, string>();
  return {
    m,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const MAT = {
  kemPublicKeyHex: 'aa',
  dsaPublicKeyHex: 'bb',
  kemSecretKeyWrapped: 'w1',
  dsaSecretKeyWrapped: 'w2',
  seedPhraseWrapped: 'w3',
};

describe('persistSeedMaterial', () => {
  it('stores only wrapped secrets', () => {
    const s = mem();
    persistSeedMaterial(s, MAT);
    expect(s.m.has('shelf_pqc_seed_phrase')).toBe(false);
    expect(s.m.has('shelf_kem_secret_key')).toBe(false);
    expect(s.m.has('shelf_dsa_secret_key')).toBe(false);
    expect(s.m.get('shelf_pqc_seed_phrase_wrapped')).toBe('w3');
    expect(s.m.get('shelf_kem_secret_key_wrapped')).toBe('w1');
    expect(s.m.get('shelf_dsa_secret_key_wrapped')).toBe('w2');
    expect(s.m.get('shelf_seed_kdf')).toBe('v2');
  });
  it('deletes legacy plaintext on migration', () => {
    const s = mem();
    s.m.set('shelf_pqc_seed_phrase', 'plain words');
    s.m.set('shelf_kem_secret_key', 'x');
    s.m.set('shelf_dsa_secret_key', 'y');
    persistSeedMaterial(s, MAT);
    expect([...s.m.keys()].filter((k) => !k.includes('wrapped') && k.includes('secret'))).toEqual([]);
    expect(s.m.has('shelf_pqc_seed_phrase')).toBe(false);
  });
});
