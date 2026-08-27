/**
 * Generates a unique identifier using crypto.randomUUID() if available,
 * falling back to a math-based random string.
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      return Array.from(buf)
        .map((b) => b.toString(36).padStart(2, '0'))
        .join('')
        .substring(0, 26);
    }
  }

  // Fallback using crypto.getRandomValues if standard UUID generation is not available.
  // We throw an error if no cryptographic API is present to ensure secure ID generation.
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Cryptographically secure ID generation is required but not supported in this environment.');
  }

  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[buf[i] % 16];
  }
  return result;
};
