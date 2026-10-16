import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BODEGA_ENC_FORMAT, BODEGA_FORMAT, normalizeKind, signedQty } from './contract';
import { openBodegaSnapshot } from './readSnapshot';

describe('bodega/contract', () => {
  it('normalizeKind defaults unknown to adjust', () => {
    expect(normalizeKind('purchase')).toBe('purchase');
    expect(normalizeKind('use')).toBe('use');
    expect(normalizeKind('waste')).toBe('waste');
    expect(normalizeKind('adjust')).toBe('adjust');
    expect(normalizeKind('something_else')).toBe('adjust');
  });

  it('signedQty signs correctly', () => {
    expect(signedQty('purchase', 10)).toBe(10);
    expect(signedQty('purchase', -10)).toBe(10);
    expect(signedQty('use', 5)).toBe(-5);
    expect(signedQty('use', -5)).toBe(-5);
    expect(signedQty('waste', 2)).toBe(-2);
    expect(signedQty('waste', -2)).toBe(-2);
    expect(signedQty('adjust', 15)).toBe(15);
    expect(signedQty('adjust', -15)).toBe(-15);
    expect(signedQty('unknown', 7)).toBe(7);
  });
});

describe('bodega/readSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validPlain = {
    format: BODEGA_FORMAT,
    source: { appId: 'shelf', instanceId: '123', schemaVersion: 1, exportedAt: '2026-10-16T00:00:00Z' },
    currency: 'COP',
    locations: [{ id: 'loc1', name: 'Main', type: 'bodega' }],
    items: [{ id: 'item1', name: 'Apples', quantity: 100, minStock: 10, cost: 50, price: 100 }],
    movements: [{ id: 'mov1', itemId: 'item1', kind: 'purchase', qty: 100, at: '2026-10-16T00:00:00Z' }],
  };

  const handMadePlain = {
    format: BODEGA_FORMAT,
    source: { appId: 'fize', instanceId: '999', schemaVersion: 1, exportedAt: '2026-10-16T00:00:00Z' },
    currency: 'USD',
    locations: [{ id: 'l2', name: 'Other', type: 'sucursal' }],
    items: [{ id: 'i2', name: 'Bananas', quantity: 50, minStock: 5, cost: 10, price: 20 }],
  };

  it('accepts a valid plain document', async () => {
    const res = await openBodegaSnapshot(JSON.stringify(validPlain));
    expect(res.format).toBe(BODEGA_FORMAT);
    expect(res.items.length).toBe(1);
    expect(res.movements.length).toBe(1);
  });

  it('ignores unknown extra fields in plain JSON', async () => {
    const plainWithExtras = { ...validPlain, unknownField: 'ignore me' };
    plainWithExtras.items[0] = { ...plainWithExtras.items[0], anotherUnknown: 'ignore this too' } as any;

    const res = await openBodegaSnapshot(JSON.stringify(plainWithExtras));
    expect((res as any).unknownField).toBeUndefined();
  });

  it('absent movements defaults to empty array', async () => {
    const res = await openBodegaSnapshot(JSON.stringify(handMadePlain));
    expect(res.movements).toEqual([]);
  });

  it('accepts hand-made file with only items and locations', async () => {
    const res = await openBodegaSnapshot(JSON.stringify(handMadePlain));
    expect(res.items.length).toBe(1);
    expect(res.locations.length).toBe(1);
  });

  it('throws formato for bad format string', async () => {
    const bad = { ...validPlain, format: 'bad/format' };
    await expect(openBodegaSnapshot(JSON.stringify(bad))).rejects.toHaveProperty('code', 'formato');
  });

  it('throws formato if items is missing', async () => {
    const { items, ...noItems } = validPlain;
    await expect(openBodegaSnapshot(JSON.stringify(noItems))).rejects.toHaveProperty('code', 'formato');
  });

  it('throws formato if an item is missing id or name', async () => {
    const badItems = { ...validPlain, items: [{ name: 'Just name', quantity: 10, minStock: 1, cost: 1, price: 1 }] };
    await expect(openBodegaSnapshot(JSON.stringify(badItems))).rejects.toHaveProperty('code', 'formato');
  });

  it('throws formato for missing locations', async () => {
    const { locations, ...noLocations } = validPlain;
    await expect(openBodegaSnapshot(JSON.stringify(noLocations))).rejects.toHaveProperty('code', 'formato');
  });

  it('never touches localStorage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    await openBodegaSnapshot(JSON.stringify(validPlain));
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws formato for non-object root', async () => {
    await expect(openBodegaSnapshot('null')).rejects.toHaveProperty('code', 'formato');
    await expect(openBodegaSnapshot('[]')).rejects.toHaveProperty('code', 'formato');
  });

  it('throws formato for null items', async () => {
    const bad = { ...validPlain, items: [null] };
    await expect(openBodegaSnapshot(JSON.stringify(bad))).rejects.toHaveProperty('code', 'formato');
  });

  it('throws formato if missing or non-object source/currency', async () => {
    const badSource = { ...validPlain, source: null };
    await expect(openBodegaSnapshot(JSON.stringify(badSource))).rejects.toHaveProperty('code', 'formato');
    const badCurrency = { ...validPlain, currency: null };
    await expect(openBodegaSnapshot(JSON.stringify(badCurrency))).rejects.toHaveProperty('code', 'formato');
  });

  it('throws formato if movement missing id/itemId or finite qty', async () => {
    const missingId = { ...validPlain, movements: [{ itemId: '1', kind: 'use', qty: 1, at: '' }] };
    await expect(openBodegaSnapshot(JSON.stringify(missingId))).rejects.toHaveProperty('code', 'formato');

    const missingQty = { ...validPlain, movements: [{ id: '1', itemId: '1', kind: 'use', qty: null, at: '' }] };
    await expect(openBodegaSnapshot(JSON.stringify(missingQty))).rejects.toHaveProperty('code', 'formato');

    const infQty = { ...validPlain, movements: [{ id: '1', itemId: '1', kind: 'use', qty: Infinity, at: '' }] };
    await expect(openBodegaSnapshot(JSON.stringify(infQty))).rejects.toHaveProperty('code', 'formato');
  });

  it('normalizes movement unknown kind to adjust', async () => {
    const m = { ...validPlain, movements: [{ id: '1', itemId: '1', kind: 'made_up', qty: 10, at: '' }] };
    const res = await openBodegaSnapshot(JSON.stringify(m));
    expect(res.movements[0].kind).toBe('adjust');
  });

  describe('encrypted tests', () => {
    let encryptedDataRaw: { format: string; kdf: any; salt: string; iv: string; ciphertext: string; check: string };
    let encryptedData: string;
    const passphrase = 'llave de prueba larga';

    beforeAll(async () => {
      const plainJson = JSON.stringify(validPlain);
      const encoder = new TextEncoder();
      const ptBuf = encoder.encode(plainJson);

      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const passBuf = encoder.encode(passphrase);

      const baseKey = await globalThis.crypto.subtle.importKey('raw', passBuf, 'PBKDF2', false, [
        'deriveKey',
        'deriveBits',
      ]);

      // Derive 512 bits: 32 bytes for AES key, 32 bytes for HMAC
      const derivedBits = await globalThis.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
        baseKey,
        512,
      );

      const aesKey = await globalThis.crypto.subtle.importKey(
        'raw',
        derivedBits.slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
      );

      const hmacKey = await globalThis.crypto.subtle.importKey(
        'raw',
        derivedBits.slice(32),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );

      const ctBuf = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, ptBuf);

      const saltB64 = btoa(String.fromCharCode(...salt));
      const ivB64 = btoa(String.fromCharCode(...iv));

      // Sign Fize format
      const fizeData = encoder.encode(`${BODEGA_ENC_FORMAT}|${saltB64}|${ivB64}`);
      const checkBuf = await globalThis.crypto.subtle.sign('HMAC', hmacKey, fizeData);

      encryptedDataRaw = {
        format: BODEGA_ENC_FORMAT,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 },
        salt: saltB64,
        iv: ivB64,
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ctBuf))),
        check: btoa(String.fromCharCode(...new Uint8Array(checkBuf))),
      };
      encryptedData = JSON.stringify(encryptedDataRaw);
    });

    it('encrypted round trip with the right passphrase', async () => {
      const res = await openBodegaSnapshot(encryptedData, passphrase);
      expect(res.format).toBe(BODEGA_FORMAT);
      expect(res.items.length).toBe(1);
      expect(res.movements.length).toBe(1);
    });

    it('wrong passphrase gives clave (with check mismatch)', async () => {
      await expect(openBodegaSnapshot(encryptedData, 'wrong pass')).rejects.toHaveProperty('code', 'clave');
    });

    it('a flipped ciphertext byte gives alterado', async () => {
      const ctBytes = Uint8Array.from(atob(encryptedDataRaw.ciphertext), (c) => c.charCodeAt(0));
      ctBytes[0] ^= 1;
      const flippedCiphertext = btoa(String.fromCharCode(...ctBytes));

      const flippedData = JSON.stringify({
        ...encryptedDataRaw,
        ciphertext: flippedCiphertext,
      });

      // Since check passes (HMAC of salt+iv matches derived key) but ciphertext is flipped,
      // it means tampering.
      await expect(openBodegaSnapshot(flippedData, passphrase)).rejects.toHaveProperty('code', 'alterado');
    });
  });
});
