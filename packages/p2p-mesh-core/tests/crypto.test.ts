import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptData,
  deriveKey,
  encryptData,
  hashPassword,
  LEGACY_PBKDF2_ITERATIONS_V0,
  PBKDF2_ITERATIONS,
  verifyPassword,
} from '../src/crypto';

const store = new Map<string, string>();
const stub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const SALT = '00112233445566778899aabbccddeeff';
const B64_SALT = 'c2FsdHNhbHRzYWx0c2FsdA==';
const pbkdf2Hex = async (pw: string, salt: string, iterations: number) => {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(pw), { name: 'PBKDF2' }, false, ['deriveBits']);
  const saltBytes = new Uint8Array(salt.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, km, 256);
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
afterAll(() => {
  if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

const aesKeyFrom = async (pw: string, b64Salt: string, iterations: number) => {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), { name: 'PBKDF2' }, false, [
    'deriveKey',
  ]);
  const salt = Uint8Array.from(atob(b64Salt), (c) => c.charCodeAt(0));
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = stub;
});

describe('crypto.ts deriveKey', () => {
  it('returns a non-extractable key', async () => {
    const key = await deriveKey('pw');
    expect(key.extractable).toBe(false);
  });

  it('fresh install records 600k iterations', async () => {
    const key = await deriveKey('pw');
    expect(store.get('shelf_app_kdf_iterations')).toBe(String(PBKDF2_ITERATIONS));
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    const ct = await encryptData('secret', await aesKeyFrom('pw', store.get('shelf_app_salt')!, 600_000));
    await expect(decryptData(ct, key)).resolves.toBe('secret');
  });

  it('existing salt without counter is legacy 100k and stays 100k', async () => {
    store.set('shelf_app_salt', B64_SALT);
    const ct = await encryptData('secret', await aesKeyFrom('pw', B64_SALT, 100_000));
    const key = await deriveKey('pw');
    await expect(decryptData(ct, key)).resolves.toBe('secret');
    expect(store.get('shelf_app_kdf_iterations')).toBe('100000');
    expect(LEGACY_PBKDF2_ITERATIONS_V0).toBe(100_000);
  });
});

describe('crypto.ts verifyPassword', () => {
  it('accepts a legacy 100k hash without prefix', async () => {
    const legacy = await pbkdf2Hex('pw', SALT, 100_000);
    await expect(verifyPassword('pw', SALT, legacy)).resolves.toBe(true);
    await expect(verifyPassword('bad', SALT, legacy)).resolves.toBe(false);
  });

  it('accepts a pbkdf2$600000$ hash', async () => {
    const h = `pbkdf2$600000$${await pbkdf2Hex('pw', SALT, 600_000)}`;
    await expect(verifyPassword('pw', SALT, h)).resolves.toBe(true);
    await expect(verifyPassword('bad', SALT, h)).resolves.toBe(false);
  });

  it('hashPassword round-trips with the 600k prefix', async () => {
    const h = await hashPassword('pw', SALT);
    expect(h.startsWith('pbkdf2$600000$')).toBe(true);
    await expect(verifyPassword('pw', SALT, h)).resolves.toBe(true);
  });
});
