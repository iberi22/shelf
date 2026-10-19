import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('Bodega screen wiring (static guards complement)', () => {
  it('does not ship the fake/stub export (no buildSnapshot/sealSnapshot stubs)', () => {
    const src = read('../../components/BodegaPage.tsx');
    expect(src).not.toContain('buildSnapshot');
    expect(src).not.toContain('sealSnapshot');
  });

  it('enforces the imported file-size limit through the shared pure helper', () => {
    const loadFileSrc = read('./loadFile.ts');
    expect(loadFileSrc).toContain('isBodegaFileTooLarge');
    expect(loadFileSrc).not.toContain('5 * 1024 * 1024');

    const bodegaPageSrc = read('../../components/BodegaPage.tsx');
    expect(bodegaPageSrc).toContain('loadBodegaFile');
  });

  it('gates the route in MainApp with the shared navigation predicate', () => {
    const src = read('../../MainApp.tsx');
    expect(src).toContain('isNavItemVisible');
    expect(src).toContain("case 'nav.bodegas'");
  });

  it('gates the nav items in the Sidebar with the same shared predicate', () => {
    const src = read('../../components/Sidebar.tsx');
    expect(src).toContain('isNavItemVisible');
  });
});
