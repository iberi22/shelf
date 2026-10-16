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

  if (!parsed || typeof parsed !== 'object') {
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

      if (!parsed.salt || !parsed.iv || !parsed.ciphertext) {
        throw new BodegaFormatError('formato', 'Missing encryption fields');
      }
    } catch (error) {
      if (error instanceof BodegaFormatError) throw error;
      throw new BodegaFormatError('formato', 'Invalid format');
    }

    let decryptedBuffer: ArrayBuffer;
    let validCheck = false;

    const saltBuffer = Uint8Array.from(atob(parsed.salt), (c) => c.charCodeAt(0));
    const ivBuffer = Uint8Array.from(atob(parsed.iv), (c) => c.charCodeAt(0));
    const ciphertextBuffer = Uint8Array.from(atob(parsed.ciphertext), (c) => c.charCodeAt(0));

    const encoder = new TextEncoder();
    const passphraseBuffer = encoder.encode(passphrase);

    const cryptoSubtle = globalThis.crypto.subtle;

    const baseKey = await cryptoSubtle.importKey('raw', passphraseBuffer, 'PBKDF2', false, ['deriveKey', 'deriveBits']);

    const derivedBits = await cryptoSubtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: kdf.iterations,
        hash: kdf.hash,
      },
      baseKey,
      512,
    );

    const aesKey = await cryptoSubtle.importKey('raw', derivedBits.slice(0, 32), { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);

    if (parsed.check) {
      const hmacKey = await cryptoSubtle.importKey(
        'raw',
        derivedBits.slice(32),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );

      const checkBytes = Uint8Array.from(atob(parsed.check), (c) => c.charCodeAt(0));

      const fizeData = encoder.encode(`${BODEGA_ENC_FORMAT}|${parsed.salt}|${parsed.iv}`);
      const garaData = encoder.encode(`${BODEGA_ENC_FORMAT}|${parsed.salt}`);

      const validFize = await cryptoSubtle.verify('HMAC', hmacKey, checkBytes, fizeData);
      const validGara = await cryptoSubtle.verify('HMAC', hmacKey, checkBytes, garaData);

      if (!validFize && !validGara) {
        throw new BodegaFormatError('clave', 'Invalid passphrase (check failed)');
      }
      validCheck = true;
    }

    try {
      decryptedBuffer = await cryptoSubtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, aesKey, ciphertextBuffer);
    } catch {
      if (validCheck) {
        throw new BodegaFormatError('alterado', 'Decryption failed (altered)');
      }
      // If there's no check, fallback to assuming it's clave if decryption fails.
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

  if (!parsed || typeof parsed !== 'object') {
    throw new BodegaFormatError('formato', 'Parsed decrypted payload is not an object');
  }

  if (parsed.format !== BODEGA_FORMAT) {
    throw new BodegaFormatError('formato', 'Unsupported format');
  }

  if (!parsed.source || typeof parsed.source !== 'object') {
    throw new BodegaFormatError('formato', 'source missing or not an object');
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

  for (const item of parsed.items) {
    if (!item || typeof item !== 'object') {
      throw new BodegaFormatError('formato', 'item is null or not an object');
    }
    if (typeof item.id !== 'string' || typeof item.name !== 'string') {
      throw new BodegaFormatError('formato', 'item missing id or name');
    }
  }

  const movements = Array.isArray(parsed.movements) ? parsed.movements : [];
  for (const mov of movements) {
    if (!mov || typeof mov !== 'object') {
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
