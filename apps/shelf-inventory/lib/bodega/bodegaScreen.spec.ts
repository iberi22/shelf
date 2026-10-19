import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * Guards that fail if the Bodega screen regresses to the state the reviewer rejected:
 * a fake (stub) export, an unbounded imported file, or a screen that ignores the
 * feature-flag + permission system used by every other route.
 */
describe('Bodega screen wiring (regression guards)', () => {
  it('does not ship the fake/stub export (no buildSnapshot/sealSnapshot stubs)', () => {
    const src = read('../../components/BodegaPage.tsx');
    expect(src).not.toContain('buildSnapshot');
    expect(src).not.toContain('sealSnapshot');
  });

  it('enforces the imported file-size limit through the shared helper', () => {
    const src = read('../../components/BodegaPage.tsx');
    expect(src).toContain('isBodegaFileTooLarge');
    expect(src).not.toContain('5 * 1024 * 1024');
  });

  it('gates the route in MainApp with the feature flag + permission helper', () => {
    const src = read('../../MainApp.tsx');
    expect(src).toContain('canViewBodega');
    expect(src).toContain('BODEGA_FEATURE_FLAG');
    expect(src).toContain("case 'nav.bodegas'");
  });

  it('gates the nav item in the Sidebar with the same helper (desktop + mobile)', () => {
    const src = read('../../components/Sidebar.tsx');
    expect(src).toContain('canViewBodega');
    expect(src.match(/item\.nameKey === 'nav\.bodegas'/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
