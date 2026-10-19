import { BODEGA_ENC_FORMAT, BODEGA_FORMAT, BodegaFormatError, type BodegaSnapshot, normalizeKind } from './contract';

export async function openBodegaSnapshot(input: string | ArrayBuffer, passphrase?: string): Promise<BodegaSnapshot> {
  let jsonString: string;

  if (input instanceof ArrayBuffer) {
    const decoder = new TextDecoder('utf-8');
    jsonString = decoder.decode(input);
  } else {
    jsonString = input;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new BodegaFormatError('formato', 'Invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BodegaFormatError('formato', 'Parsed input is not an object');
  }

  if (parsed.format === BODEGA_ENC_FORMAT) {
    if (!passphrase) {
      throw new BodegaFormatError('clave', 'Passphrase required for encrypted snapshot');
    }

    let kdf: any;
    try {
      kdf = parsed.kdf;
      if (kdf?.name !== 'PBKDF2' || kdf?.hash !== 'SHA-256' || kdf?.iterations !== 600000) {
        throw new BodegaFormatError('formato', 'Invalid KDF parameters');
      }

      if (typeof parsed.salt !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.ciphertext !== 'string') {
        throw new BodegaFormatError('formato', 'Missing or invalid encryption fields');
      }
      if (parsed.check !== undefined && typeof parsed.check !== 'string') {
        throw new BodegaFormatError('formato', 'Invalid check field');
      }
    } catch (error) {
      if (error instanceof BodegaFormatError) throw error;
      throw new BodegaFormatError('formato', 'Invalid format');
    }

    let decryptedBuffer: ArrayBuffer;
    let validCheck = false;

    let saltBuffer: Uint8Array;
    let ivBuffer: Uint8Array;
    let ciphertextBuffer: Uint8Array;
    let checkBytes: Uint8Array | undefined;

    try {
      saltBuffer = Uint8Array.from(atob(parsed.salt), (c) => c.charCodeAt(0));
      ivBuffer = Uint8Array.from(atob(parsed.iv), (c) => c.charCodeAt(0));
      ciphertextBuffer = Uint8Array.from(atob(parsed.ciphertext), (c) => c.charCodeAt(0));
      if (parsed.check) {
        checkBytes = Uint8Array.from(atob(parsed.check), (c) => c.charCodeAt(0));
      }
    } catch {
      throw new BodegaFormatError('formato', 'Invalid base64 in encryption fields');
    }

    const encoder = new TextEncoder();
    const passphraseBuffer = encoder.encode(passphrase);

    const cryptoSubtle = globalThis.crypto.subtle;

    const baseKey = await cryptoSubtle.importKey('raw', passphraseBuffer as BufferSource, 'PBKDF2', false, [
      'deriveKey',
      'deriveBits',
    ]);

    const derivedBits = await cryptoSubtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer as BufferSource,
        iterations: kdf.iterations,
        hash: kdf.hash,
      },
      baseKey,
      512,
    );

    const aesKey = await cryptoSubtle.importKey('raw', derivedBits.slice(0, 32), { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);

    if (parsed.check && checkBytes) {
      const hmacKey = await cryptoSubtle.importKey(
        'raw',
        derivedBits.slice(32),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );

      const fizeData = encoder.encode(`${BODEGA_ENC_FORMAT}|${parsed.salt}|${parsed.iv}`);
      const garaData = encoder.encode(`${BODEGA_ENC_FORMAT}|${parsed.salt}`);

      const validFize = await cryptoSubtle.verify(
        'HMAC',
        hmacKey,
        checkBytes as BufferSource,
        fizeData as BufferSource,
      );
      const validGara = await cryptoSubtle.verify(
        'HMAC',
        hmacKey,
        checkBytes as BufferSource,
        garaData as BufferSource,
      );

      if (!validFize && !validGara) {
        throw new BodegaFormatError('clave', 'Invalid passphrase (check failed)');
      }
      validCheck = true;
    }

    try {
      decryptedBuffer = await cryptoSubtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer as BufferSource },
        aesKey,
        ciphertextBuffer as BufferSource,
      );
    } catch {
      if (validCheck) {
        throw new BodegaFormatError('alterado', 'Decryption failed (altered)');
      }
      throw new BodegaFormatError('clave', 'Invalid passphrase');
    }

    try {
      const decoder = new TextDecoder('utf-8');
      const decryptedString = decoder.decode(decryptedBuffer);

      parsed = JSON.parse(decryptedString);
    } catch {
      throw new BodegaFormatError('alterado', 'Invalid decrypted JSON');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BodegaFormatError('formato', 'Parsed decrypted payload is not an object');
  }

  if (parsed.format !== BODEGA_FORMAT) {
    throw new BodegaFormatError('formato', 'Unsupported format');
  }

  if (!parsed.source || typeof parsed.source !== 'object' || Array.isArray(parsed.source)) {
    throw new BodegaFormatError('formato', 'source missing or not an object');
  }

  const allowedAppIds: readonly string[] = ['fize', 'gara-g', 'shelf'];
  if (typeof parsed.source.appId !== 'string' || !allowedAppIds.includes(parsed.source.appId)) {
    throw new BodegaFormatError('formato', 'source.appId missing or invalid');
  }

  if (typeof parsed.source.instanceId !== 'string' || parsed.source.instanceId.trim() === '') {
    throw new BodegaFormatError('formato', 'source.instanceId missing or empty');
  }

  const iso8601FullRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  if (
    typeof parsed.source.exportedAt !== 'string' ||
    !iso8601FullRegex.test(parsed.source.exportedAt) ||
    Number.isNaN(Date.parse(parsed.source.exportedAt))
  ) {
    throw new BodegaFormatError('formato', 'source.exportedAt missing or invalid ISO 8601 date-time');
  }

  if (!parsed.currency || typeof parsed.currency !== 'string') {
    throw new BodegaFormatError('formato', 'currency missing or invalid');
  }

  if (!Array.isArray(parsed.locations)) {
    throw new BodegaFormatError('formato', 'locations missing or not an array');
  }

  if (!Array.isArray(parsed.items)) {
    throw new BodegaFormatError('formato', 'items missing or not an array');
  }

  if (parsed.movements !== undefined && !Array.isArray(parsed.movements)) {
    throw new BodegaFormatError('formato', 'movements present but not an array');
  }

  for (const loc of parsed.locations) {
    if (!loc || typeof loc !== 'object' || Array.isArray(loc)) {
      throw new BodegaFormatError('formato', 'location is not an object');
    }
    if (typeof loc.id !== 'string' || typeof loc.name !== 'string') {
      throw new BodegaFormatError('formato', 'location missing id or name');
    }
  }

  for (const item of parsed.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BodegaFormatError('formato', 'item is null or not an object');
    }
    if (typeof item.id !== 'string' || typeof item.name !== 'string') {
      throw new BodegaFormatError('formato', 'item missing id or name');
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isFinite(item.quantity) ||
      typeof item.minStock !== 'number' ||
      !Number.isFinite(item.minStock) ||
      typeof item.cost !== 'number' ||
      !Number.isFinite(item.cost) ||
      typeof item.price !== 'number' ||
      !Number.isFinite(item.price)
    ) {
      throw new BodegaFormatError('formato', 'item numeric fields missing or invalid');
    }
  }

  const movements = Array.isArray(parsed.movements) ? parsed.movements : [];
  for (const mov of movements) {
    if (!mov || typeof mov !== 'object' || Array.isArray(mov)) {
      throw new BodegaFormatError('formato', 'movement is null or not an object');
    }
    if (typeof mov.id !== 'string' || typeof mov.itemId !== 'string') {
      throw new BodegaFormatError('formato', 'movement missing id or itemId');
    }
    if (typeof mov.qty !== 'number' || !Number.isFinite(mov.qty)) {
      throw new BodegaFormatError('formato', 'movement missing qty or not a finite number');
    }
    mov.kind = normalizeKind(mov.kind);
  }

  return {
    format: parsed.format,
    source: parsed.source as any,
    currency: parsed.currency,
    locations: parsed.locations,
    items: parsed.items,
    movements: movements,
  };
}
