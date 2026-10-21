import { SEED_KDF_MARKER_KEY, SEED_KDF_V2 } from './seed-kdf';

export interface StorageLike {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SeedMaterial {
  kemPublicKeyHex: string;
  dsaPublicKeyHex: string;
  kemSecretKeyWrapped: string;
  dsaSecretKeyWrapped: string;
  seedPhraseWrapped: string;
}

/** Persist seed material (only wrapped secrets) and delete every plaintext remnant. */
export function persistSeedMaterial(storage: StorageLike, m: SeedMaterial): void {
  storage.setItem('shelf_kem_public_key', m.kemPublicKeyHex);
  storage.setItem('shelf_dsa_public_key', m.dsaPublicKeyHex);
  storage.setItem('shelf_kem_secret_key_wrapped', m.kemSecretKeyWrapped);
  storage.setItem('shelf_dsa_secret_key_wrapped', m.dsaSecretKeyWrapped);
  storage.setItem('shelf_pqc_seed_phrase_wrapped', m.seedPhraseWrapped);
  storage.setItem(SEED_KDF_MARKER_KEY, SEED_KDF_V2);
  storage.removeItem('shelf_kem_secret_key');
  storage.removeItem('shelf_dsa_secret_key');
  storage.removeItem('shelf_pqc_seed_phrase');
}
