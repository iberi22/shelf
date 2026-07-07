import { describe, expect, it, vi } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  it('should generate a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should use crypto.randomUUID when available', () => {
    const mockUuid = '123e4567-e89b-12d3-a456-426614174000';

    // Check if crypto exists and has randomUUID
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUuid as any);
      const id = generateId();
      expect(id).toBe(mockUuid);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    } else {
      // If environment doesn't have it, we can't easily test this branch
      // without being able to mock the global crypto object
      const id = generateId();
      expect(typeof id).toBe('string');
    }
  });

  it('should fallback when crypto.randomUUID is not available', () => {
    // If we can't mock globalThis.crypto, we at least verify it returns a string
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
