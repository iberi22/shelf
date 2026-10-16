import {
  BODEGA_ENC_FORMAT,
  BODEGA_FORMAT,
  BodegaFormatError,
  type BodegaSnapshot,
} from './contract';

export async function openBodegaSnapshot(
  input: string | ArrayBuffer,
  passphrase?: string,
): Promise<BodegaSnapshot> {
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

  if (parsed.format === BODEGA_ENC_FORMAT) {
    if (!passphrase) {
      throw new BodegaFormatError('clave', 'Passphrase required for encrypted snapshot');
    }

    let kdf;
    try {
      kdf = parsed.kdf;
      if (!kdf || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || kdf.iterations !== 600000) {
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
    try {
      const saltBuffer = Uint8Array.from(atob(parsed.salt), (c) => c.charCodeAt(0));
      const ivBuffer = Uint8Array.from(atob(parsed.iv), (c) => c.charCodeAt(0));
      const ciphertextBuffer = Uint8Array.from(atob(parsed.ciphertext), (c) => c.charCodeAt(0));

      const encoder = new TextEncoder();
      const passphraseBuffer = encoder.encode(passphrase);

      const cryptoSubtle = globalThis.crypto.subtle;

      const baseKey = await cryptoSubtle.importKey(
        'raw',
        passphraseBuffer,
        'PBKDF2',
        false,
        ['deriveKey'],
      );

      const aesKey = await cryptoSubtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: kdf.iterations,
          hash: kdf.hash,
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );

      decryptedBuffer = await cryptoSubtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        aesKey,
        ciphertextBuffer,
      );
    } catch (error) {
      throw new BodegaFormatError('clave', 'Invalid passphrase or altered payload');
    }

    try {
      const decoder = new TextDecoder('utf-8');
      const decryptedString = decoder.decode(decryptedBuffer);

      parsed = JSON.parse(decryptedString);
    } catch {
      throw new BodegaFormatError('alterado', 'Invalid decrypted JSON');
    }
  }

  if (parsed.format !== BODEGA_FORMAT) {
    throw new BodegaFormatError('formato', 'Unsupported format');
  }

  if (!Array.isArray(parsed.locations)) {
    throw new BodegaFormatError('formato', 'locations missing or not an array');
  }

  if (!Array.isArray(parsed.items)) {
    throw new BodegaFormatError('formato', 'items missing or not an array');
  }

  for (const item of parsed.items) {
    if (typeof item.id !== 'string' || typeof item.name !== 'string') {
      throw new BodegaFormatError('formato', 'item missing id or name');
    }
  }

  return {
    format: parsed.format,
    source: parsed.source,
    currency: parsed.currency,
    locations: parsed.locations,
    items: parsed.items,
    movements: Array.isArray(parsed.movements) ? parsed.movements : [],
  };
}
