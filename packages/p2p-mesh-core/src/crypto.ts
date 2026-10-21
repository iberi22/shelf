/**
 * WebCrypto API based robust encryption manager.
 * Derives keys using PBKDF2 and encrypts data using AES-GCM.
 */

const SALT_KEY = 'shelf_app_salt';
const ITERATIONS_KEY = 'shelf_app_kdf_iterations';

/** PBKDF2 iteration count for all NEW at-rest writes (OWASP 2023, SHA-256). */
export const PBKDF2_ITERATIONS = 600_000;
/** Iteration count of data written before the 600k bump (still readable). */
export const LEGACY_PBKDF2_ITERATIONS_V0 = 100_000;

// Generates or retrieves a persistent salt from localStorage
const getSalt = (): Uint8Array => {
  let saltStr = localStorage.getItem(SALT_KEY);
  if (!saltStr) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    saltStr = btoa(String.fromCharCode(...salt));
    localStorage.setItem(SALT_KEY, saltStr);
  }
  return Uint8Array.from(atob(saltStr), (c) => c.charCodeAt(0));
};

// Iteration count stored next to the salt. A pre-existing salt without a
// stored count is legacy data (100k); a fresh install records 600k.
const getIterations = (): number => {
  const stored = Number(localStorage.getItem(ITERATIONS_KEY));
  if (Number.isInteger(stored) && stored > 0) return stored;
  const legacy = localStorage.getItem(SALT_KEY) !== null;
  return legacy ? LEGACY_PBKDF2_ITERATIONS_V0 : PBKDF2_ITERATIONS;
};

/**
 * Derives an AES-GCM CryptoKey from a user PIN or password.
 */
export const deriveKey = async (password: string): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, [
    'deriveBits',
    'deriveKey',
  ]);

  const iterations = getIterations();
  const salt = getSalt();
  localStorage.setItem(ITERATIONS_KEY, String(iterations));

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const importPQCSharedSecret = async (secretHex: string): Promise<CryptoKey> => {
  const rawKey = new Uint8Array(secretHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
  return await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

let sessionKeyCache: CryptoKey | null = null;

/**
 * Device-local entropy for at-rest encryption when the user has not set an app lock PIN.
 * Prefer appLockPin; never use a hard-coded shared default.
 */
const getOrCreateDeviceEntropy = (): string => {
  const existing = localStorage.getItem('shelf_device_entropy');
  if (existing && existing.length >= 16) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const entropy = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('shelf_device_entropy', entropy);
  return entropy;
};

export const getSessionKey = async (): Promise<CryptoKey> => {
  if (sessionKeyCache) return sessionKeyCache;
  const pin = localStorage.getItem('appLockPin') || getOrCreateDeviceEntropy();
  sessionKeyCache = await deriveKey(pin);
  return sessionKeyCache;
};

/** Clear cached session key (call after PIN change). */
export const clearSessionKeyCache = (): void => {
  sessionKeyCache = null;
};

/**
 * Encrypts a plaintext string into a Base64-encoded ciphertext with an IV prepended.
 */
export const encryptData = async (plaintext: string, key: CryptoKey): Promise<string> => {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuf = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoder.encode(plaintext),
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encryptedBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuf), iv.length);

  // Convert to Base64 in chunks to avoid 'Maximum call stack size exceeded'
  const chunkSize = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < combined.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, Array.from(combined.subarray(i, i + chunkSize))));
  }
  return btoa(chunks.join(''));
};

export const generateUUID = (): string => crypto.randomUUID();

export const generateSalt = (): string => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const HASH_PREFIX = 'pbkdf2$';

const pbkdf2Hex = async (password: string, salt: string, iterations: number): Promise<string> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, [
    'deriveBits',
  ]);
  const saltBuffer = new Uint8Array(salt.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/** New hashes embed their iteration count: `pbkdf2$<iterations>$<hex>`. */
export const hashPassword = async (password: string, salt: string): Promise<string> =>
  `${HASH_PREFIX}${PBKDF2_ITERATIONS}$${await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS)}`;

/**
 * Constant-time string comparison to prevent timing attacks
 */
const secureCompare = (a: string, b: string): boolean => {
  let result = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    result |= charA ^ charB;
  }
  return result === 0 && a.length === b.length;
};

export const verifyPassword = async (password: string, salt: string, hash: string): Promise<boolean> => {
  let iterations = LEGACY_PBKDF2_ITERATIONS_V0;
  let expected = hash;
  if (hash.startsWith(HASH_PREFIX)) {
    const [, count, hex] = hash.split('$');
    const n = Number(count);
    if (!Number.isInteger(n) || n <= 0 || !hex) return false;
    iterations = n;
    expected = hex;
  }
  return secureCompare(await pbkdf2Hex(password, salt, iterations), expected);
};

// Legacy wrapper for localAuth.ts that passed 3 arguments (data, password, email)
export const encryptDataLegacy = async (data: string, passwordStr: string, _email: string): Promise<string> => {
  const key = await deriveKey(passwordStr);
  return encryptData(data, key);
};

// Legacy wrapper for localAuth.ts that passed 3 arguments
export const decryptDataLegacy = async (
  ciphertextBase64: string,
  passwordStr: string,
  _email: string,
): Promise<string> => {
  const key = await deriveKey(passwordStr);
  return decryptData(ciphertextBase64, key);
};

/**
 * Decrypts a Base64-encoded ciphertext (with IV prepended) back to plaintext.
 */
export const decryptData = async (ciphertextBase64: string, key: CryptoKey): Promise<string> => {
  const combined = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0));

  // Extract IV (first 12 bytes) and the encrypted data
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decryptedBuf = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuf);
};
