import { describe, expect, it } from 'vitest';
import { generateId, generateSecureId } from './id';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateSecureId (SHELF-107)', () => {
  it('generates valid UUID v4 format', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSecureId()).toMatch(UUID_V4_RE);
    }
  });

  it('sets the RFC 4122 version 4 bits', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateSecureId();
      expect(id.charAt(14)).toBe('4');
    }
  });

  it('sets the RFC 4122 variant (10xx) bits', () => {
    for (let i = 0; i < 50; i++) {
      const variantHex = generateSecureId().charAt(19).toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantHex);
    }
  });

  it('has sufficient entropy (no duplicates in 10000 iterations)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(generateSecureId());
    }
    expect(seen.size).toBe(10_000);
  });

  it('is a string of length 36', () => {
    expect(generateSecureId()).toHaveLength(36);
  });
});

describe('generateId alias', () => {
  it('is the same implementation as generateSecureId', () => {
    expect(generateId).toBe(generateSecureId);
  });

  it('also produces canonical UUID v4 strings', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateId()).toMatch(UUID_V4_RE);
    }
  });
});
