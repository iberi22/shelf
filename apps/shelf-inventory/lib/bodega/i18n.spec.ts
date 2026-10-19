import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bodega i18n coverage and cleanliness', () => {
  const root = resolve(__dirname, '../..');
  const bodegaPageSrc = readFileSync(resolve(root, 'components/BodegaPage.tsx'), 'utf8');

  const es = JSON.parse(readFileSync(resolve(root, 'locales/es.json'), 'utf8'));
  const en = JSON.parse(readFileSync(resolve(root, 'locales/en.json'), 'utf8'));
  const pubEs = JSON.parse(readFileSync(resolve(root, 'public/locales/es.json'), 'utf8'));
  const pubEn = JSON.parse(readFileSync(resolve(root, 'public/locales/en.json'), 'utf8'));

  const getNested = (obj: any, path: string): string | undefined => {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  };

  it('provides translations for all bodega.* keys used in BodegaPage.tsx', () => {
    const matches = [...bodegaPageSrc.matchAll(/t\(['"](bodega\.[a-zA-Z0-9_]+)['"]\)/g)].map((m) => m[1]);
    expect(matches.length).toBeGreaterThan(0);

    const uniqueKeys = Array.from(new Set(matches));

    for (const key of uniqueKeys) {
      const valEs = getNested(es, key);
      const valEn = getNested(en, key);
      const pubValEs = getNested(pubEs, key);
      const pubValEn = getNested(pubEn, key);

      expect(valEs, `Missing key "${key}" in locales/es.json`).toBeDefined();
      expect(typeof valEs).toBe('string');
      expect(valEs?.length).toBeGreaterThan(0);

      expect(valEn, `Missing key "${key}" in locales/en.json`).toBeDefined();
      expect(typeof valEn).toBe('string');
      expect(valEn?.length).toBeGreaterThan(0);

      expect(pubValEs, `Missing key "${key}" in public/locales/es.json`).toBeDefined();
      expect(pubValEn, `Missing key "${key}" in public/locales/en.json`).toBeDefined();
    }
  });

  it('provides translations for common.clear and nav.bodegas in both locales', () => {
    expect(es.common?.clear).toBe('Limpiar');
    expect(en.common?.clear).toBe('Clear');
    expect(pubEs.common?.clear).toBe('Limpiar');
    expect(pubEn.common?.clear).toBe('Clear');

    expect(es.nav?.bodegas).toBe('Bodegas');
    expect(en.nav?.bodegas).toBe('Warehouses');
    expect(pubEs.nav?.bodegas).toBe('Bodegas');
    expect(pubEn.nav?.bodegas).toBe('Warehouses');
  });

  it('does not leave any raw fallback expressions (|| "...") on translation calls in BodegaPage.tsx', () => {
    // Matches patterns like t(...) || 'fallback'
    const fallbackMatches = [...bodegaPageSrc.matchAll(/t\([^)]+\)\s*\|\|\s*['"`]/g)];
    expect(fallbackMatches).toHaveLength(0);
  });

  it('does not contain hardcoded Spanish labels for metadata', () => {
    expect(bodegaPageSrc).not.toContain('Fuente:');
    expect(bodegaPageSrc).not.toContain('Fecha:');
    expect(bodegaPageSrc).not.toContain('Moneda:');
    expect(bodegaPageSrc).not.toContain('Sin mapear:');
  });
});
