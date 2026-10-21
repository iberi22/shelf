import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

/**
 * PQC Key Management
 */

export interface PQCKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Generates an ML-KEM-768 key pair for key encapsulation.
 */
export const generateKEMKeyPair = (): PQCKeyPair => {
  const keys = ml_kem768.keygen();
  return { publicKey: keys.publicKey, secretKey: keys.secretKey };
};

/**
 * Encapsulates a shared secret for a given public key.
 * Returns the ciphertext and the shared secret.
 */
export const encapsulate = (publicKey: Uint8Array): { ciphertext: Uint8Array; sharedSecret: Uint8Array } => {
  const res = ml_kem768.encapsulate(publicKey);
  return { ciphertext: res.cipherText, sharedSecret: res.sharedSecret };
};

/**
 * Decapsulates a ciphertext using a secret key to recover the shared secret.
 */
export const decapsulate = (ciphertext: Uint8Array, secretKey: Uint8Array): Uint8Array => {
  return ml_kem768.decapsulate(ciphertext, secretKey);
};

/**
 * Generates an ML-DSA-65 key pair for digital signatures.
 */
export const generateDSAKeyPair = (): PQCKeyPair => {
  const keys = ml_dsa65.keygen();
  return { publicKey: keys.publicKey, secretKey: keys.secretKey };
};

/**
 * Signs a message using an ML-DSA secret key.
 */
export const sign = (message: Uint8Array, secretKey: Uint8Array): Uint8Array => {
  return ml_dsa65.sign(message, secretKey);
};

/**
 * Verifies an ML-DSA signature.
 */
export const verify = (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean => {
  return ml_dsa65.verify(signature, message, publicKey);
};

/**
 * Utility to convert Uint8Array to Hex string.
 */
export const toHex = (arr: Uint8Array): string =>
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * Utility to convert Hex string to Uint8Array.
 */
export const fromHex = (hex: string): Uint8Array => {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Number.parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
};

// Aliases and additional functions for P2PSyncManager
export const encapsulateSecret = encapsulate;
export const decapsulateSecret = decapsulate;
export const signPayload = sign;
export const verifyPayload = verify;

export const deriveAESKeyFromSharedSecret = async (sharedSecret: Uint8Array): Promise<CryptoKey> => {
  const hash = await crypto.subtle.digest('SHA-256', sharedSecret as any);
  return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
};

export const encryptWithPQC = async (data: string, key: CryptoKey): Promise<string> => {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
};

export const decryptWithPQC = async (base64: string, key: CryptoKey): Promise<string> => {
  const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
};

/**
 * Derives ML-DSA-65 and ML-KEM-768 key pairs deterministically from a seed phrase.
 * Uses SHA-512 to hash the seed phrase, using the first 32 bytes as seed for ML-DSA-65,
 * and the entire 64 bytes as seed for ML-KEM-768.
 */
export const derivePQCKeysFromSeed = async (
  seedPhrase: string,
): Promise<{
  kem: PQCKeyPair;
  dsa: PQCKeyPair;
}> => {
  const normalized = seedPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-512', data);
  const hashBytes = new Uint8Array(hashBuffer);

  const dsaSeed = hashBytes.subarray(0, 32);
  const kemSeed = hashBytes; // 64 bytes

  const dsaKeys = ml_dsa65.keygen(dsaSeed);
  const kemKeys = ml_kem768.keygen(kemSeed);

  return {
    kem: { publicKey: kemKeys.publicKey, secretKey: kemKeys.secretKey },
    dsa: { publicKey: dsaKeys.publicKey, secretKey: dsaKeys.secretKey },
  };
};

// ─── Session key v2 (HKDF + AAD + counter nonces) ───────────────────────────

export const CRYPTO_V2_LABEL = 'shelf-p2p/v2';
const te = new TextEncoder();

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

/** Length-prefixed concatenation so field boundaries are unambiguous. */
const framed = (...parts: Uint8Array[]): Uint8Array =>
  concatBytes(
    ...parts.map((p) => {
      const len = new Uint8Array(4);
      new DataView(len.buffer).setUint32(0, p.length);
      return concatBytes(len, p);
    }),
  );

const sha256 = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data as any));

const sortedPair = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a]);

export interface SessionKeyParams {
  sharedSecret: Uint8Array;
  kemCiphertext: Uint8Array;
  initiatorKemPublicKey: Uint8Array;
  responderKemPublicKey: Uint8Array;
  peerIdA: string;
  peerIdB: string;
}

/**
 * k = HKDF-SHA256(ss, salt = SHA-256(kemCt || initiatorKemPub || responderKemPub),
 *                 info = 'shelf-p2p/v2|' + sort(peerIdA, peerIdB)).
 * Returned as a NON-EXTRACTABLE AES-GCM key.
 */
export const deriveSessionKey = async (p: SessionKeyParams): Promise<CryptoKey> => {
  const salt = await sha256(concatBytes(p.kemCiphertext, p.initiatorKemPublicKey, p.responderKemPublicKey));
  const [a, b] = sortedPair(p.peerIdA, p.peerIdB);
  const info = te.encode(`${CRYPTO_V2_LABEL}|${a}|${b}`);
  const ikm = await crypto.subtle.importKey('raw', p.sharedSecret as any, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as any, info: info as any },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

/** AAD = 'shelf-p2p/v2|' + type + '|' + from + '|' + to */
export const buildAad = (type: string, from: string, to: string): Uint8Array =>
  te.encode(`${CRYPTO_V2_LABEL}|${type}|${from}|${to}`);

export interface TranscriptParams {
  initiatorId: string;
  responderId: string;
  initiatorKemPublicKey: Uint8Array;
  responderKemPublicKey: Uint8Array;
  initiatorDsaPublicKey: Uint8Array;
  responderDsaPublicKey: Uint8Array;
  kemCiphertext: Uint8Array;
  challenge: Uint8Array;
  responderChallenge: Uint8Array;
}

/** Hash of the whole handshake; each side signs it (domain-separated by role). */
export const buildHandshakeTranscript = async (t: TranscriptParams): Promise<Uint8Array> =>
  sha256(
    framed(
      te.encode(`${CRYPTO_V2_LABEL}|transcript`),
      te.encode(t.initiatorId),
      te.encode(t.responderId),
      t.initiatorKemPublicKey,
      t.responderKemPublicKey,
      t.initiatorDsaPublicKey,
      t.responderDsaPublicKey,
      t.kemCiphertext,
      t.challenge,
      t.responderChallenge,
    ),
  );

export type TranscriptRole = 'reply' | 'ack';

export const transcriptSigningInput = (transcript: Uint8Array, role: TranscriptRole): Uint8Array =>
  concatBytes(te.encode(`${CRYPTO_V2_LABEL}|${role}|`), transcript);

/**
 * Per-direction AES-GCM session cipher. Nonce = 4-byte direction prefix ||
 * 8-byte big-endian counter; the counter only increments, so a nonce is never
 * reused under a key. Receive side enforces strictly increasing counters.
 */
export class SessionCipher {
  private sendCounter = 0;
  private lastRecvCounter = 0;
  private readonly sendPrefix: number;
  private readonly recvPrefix: number;

  constructor(
    private readonly key: CryptoKey,
    readonly localId: string,
    readonly remoteId: string,
  ) {
    const [first] = sortedPair(localId, remoteId);
    this.sendPrefix = first === localId ? 1 : 2;
    this.recvPrefix = this.sendPrefix === 1 ? 2 : 1;
  }

  private nextNonce(): Uint8Array {
    if (this.sendCounter >= Number.MAX_SAFE_INTEGER) throw new Error('session nonce counter exhausted');
    this.sendCounter += 1;
    const nonce = new Uint8Array(12);
    const dv = new DataView(nonce.buffer);
    dv.setUint32(0, this.sendPrefix);
    dv.setBigUint64(4, BigInt(this.sendCounter));
    return nonce;
  }

  async seal(plaintext: string, type: string): Promise<string> {
    const nonce = this.nextNonce();
    const aad = buildAad(type, this.localId, this.remoteId);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce as any, additionalData: aad as any },
        this.key,
        te.encode(plaintext),
      ),
    );
    return toBase64(concatBytes(nonce, ct));
  }

  async open(encoded: string, type: string): Promise<string> {
    const raw = fromBase64(encoded);
    if (raw.length < 12 + 16) throw new Error('session message too short');
    const nonce = raw.slice(0, 12);
    const dv = new DataView(nonce.buffer);
    if (dv.getUint32(0) !== this.recvPrefix) throw new Error('wrong nonce direction');
    const counter = Number(dv.getBigUint64(4));
    if (counter <= this.lastRecvCounter) throw new Error('replayed or reordered nonce');
    const aad = buildAad(type, this.remoteId, this.localId);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as any, additionalData: aad as any },
      this.key,
      raw.slice(12) as any,
    );
    this.lastRecvCounter = counter; // only advance after authentication succeeds
    return new TextDecoder().decode(pt);
  }
}

const toBase64 = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
