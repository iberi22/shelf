/**
 * Centralized cryptographically-secure ID generation (SHELF-107).
 *
 * Replaces every PRNG-based ID path with `crypto.getRandomValues()` and
 * emits canonical UUID v4 strings:
 *   xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 *
 * ID generation is a security-sensitive path (predictable IDs allow forging
 * entries), so only a CSPRNG is acceptable. This module deliberately avoids
 * the built-in non-cryptographic PRNG: if no secure random source is
 * available the function throws instead of silently degrading.
 */

const HEX_DIGITS = '0123456789abcdef';

function byteToHex(byte: number): string {
  return HEX_DIGITS[byte >> 4] + HEX_DIGITS[byte & 0x0f];
}

/**
 * Generates a cryptographically-secure UUID v4.
 *
 * Uses `crypto.getRandomValues()` to obtain 16 random bytes, then sets the
 * RFC 4122 version (4) and variant (10xx) bits so the output is a valid
 * UUID v4: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.
 *
 * @throws {Error} when `crypto.getRandomValues` is unavailable — callers must
 *   not fall back to predictable randomness.
 */
export function generateSecureId(): string {
  const cryptoImpl = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;

  if (typeof cryptoImpl?.getRandomValues !== 'function') {
    throw new Error('generateSecureId: crypto.getRandomValues is not available in this environment');
  }

  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);

  // RFC 4122: version 4 (random) + variant 10xx
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return (
    byteToHex(bytes[0]) +
    byteToHex(bytes[1]) +
    byteToHex(bytes[2]) +
    byteToHex(bytes[3]) +
    '-' +
    byteToHex(bytes[4]) +
    byteToHex(bytes[5]) +
    '-' +
    byteToHex(bytes[6]) +
    byteToHex(bytes[7]) +
    '-' +
    byteToHex(bytes[8]) +
    byteToHex(bytes[9]) +
    '-' +
    byteToHex(bytes[10]) +
    byteToHex(bytes[11]) +
    byteToHex(bytes[12]) +
    byteToHex(bytes[13]) +
    byteToHex(bytes[14]) +
    byteToHex(bytes[15])
  );
}

/**
 * Backwards-compatible alias kept for existing callers of `utils/id`.
 * Identical behavior to {@link generateSecureId}.
 */
export { generateSecureId as generateId };
