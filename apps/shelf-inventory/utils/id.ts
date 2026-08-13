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
  return Date.now().toString(36) + Date.now().toString(36);
};
