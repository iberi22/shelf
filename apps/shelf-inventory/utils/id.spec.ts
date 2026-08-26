import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateId } from './id';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateId (utils/id backward-compat shim)', () => {
  it('generates a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('generates canonical UUID v4 IDs', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateId()).toMatch(UUID_V4_RE);
    }
  });

  it('uses crypto.getRandomValues and never Math.random in the ID generation path', () => {
    const libSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'id.ts'), 'utf8');
    const utilSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'id.ts'), 'utf8');

    expect(libSource).toContain('crypto.getRandomValues');
    expect(libSource).not.toContain('Math.random');
    expect(utilSource).not.toContain('Math.random');
  });

  it('does not depend on crypto.randomUUID (works with getRandomValues only)', () => {
    // The implementation is built on getRandomValues, so environments without
    // crypto.randomUUID (older browsers) still get secure UUID v4 IDs.
    const libSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'id.ts'), 'utf8');
    expect(libSource).not.toContain('randomUUID');
  });
});
