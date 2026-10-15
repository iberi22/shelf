import { describe, expect, it } from 'vitest';
import { DEFAULT_INVENTORY_CONFIG, normalizeInventoryConfig } from './inventoryConfig';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

describe('DEFAULT_INVENTORY_CONFIG', () => {
  it('ships a default color catalog with valid hex values', () => {
    expect(DEFAULT_INVENTORY_CONFIG.colorOptions.length).toBeGreaterThan(0);
    for (const option of DEFAULT_INVENTORY_CONFIG.colorOptions) {
      expect(option.name.trim()).not.toBe('');
      expect(option.hex).toMatch(HEX_PATTERN);
    }
  });

  it('keeps the default measure catalog', () => {
    expect(DEFAULT_INVENTORY_CONFIG.measureOptions.length).toBeGreaterThan(0);
  });
});

describe('normalizeInventoryConfig', () => {
  it('returns defaults including colorOptions when config is missing', () => {
    const normalized = normalizeInventoryConfig(undefined);
    expect(normalized.colorOptions).toEqual(DEFAULT_INVENTORY_CONFIG.colorOptions);
    expect(normalized.measureOptions).toEqual(DEFAULT_INVENTORY_CONFIG.measureOptions);
    expect(normalized.variantAttributes).toEqual(DEFAULT_INVENTORY_CONFIG.variantAttributes);
  });

  it('preserves a custom color catalog from settings', () => {
    const normalized = normalizeInventoryConfig({
      colorOptions: [
        { name: 'Azul marino', hex: '#123456' },
        { name: 'Coral', hex: '#ff7f50' },
      ],
    });

    expect(normalized.colorOptions).toEqual([
      { name: 'Azul marino', hex: '#123456' },
      { name: 'Coral', hex: '#ff7f50' },
    ]);
  });

  it('falls back to a neutral hex for invalid color values', () => {
    const normalized = normalizeInventoryConfig({
      colorOptions: [{ name: 'Raro', hex: 'not-a-color' }],
    });

    expect(normalized.colorOptions).toEqual([{ name: 'Raro', hex: '#808080' }]);
  });

  it('drops unnamed colors and dedupes names case-insensitively', () => {
    const normalized = normalizeInventoryConfig({
      colorOptions: [
        { name: '', hex: '#111111' },
        { name: 'Rojo', hex: '#cc3333' },
        { name: 'rojo', hex: '#ff0000' },
        { name: '  Azul  ', hex: '#3355cc' },
      ],
    });

    expect(normalized.colorOptions).toEqual([
      { name: 'Rojo', hex: '#cc3333' },
      { name: 'Azul', hex: '#3355cc' },
    ]);
  });

  it('restores default colors when the stored catalog is empty', () => {
    const normalized = normalizeInventoryConfig({ colorOptions: [] });
    expect(normalized.colorOptions).toEqual(DEFAULT_INVENTORY_CONFIG.colorOptions);
  });

  it('migrates the legacy default measure list to the current defaults', () => {
    const normalized = normalizeInventoryConfig({ measureOptions: ['30CM', '40CM', '50CM', '60CM'] });
    expect(normalized.measureOptions).toEqual(DEFAULT_INVENTORY_CONFIG.measureOptions);
  });

  it('keeps custom measure options untouched', () => {
    const normalized = normalizeInventoryConfig({ measureOptions: ['35CM', '45CM'] });
    expect(normalized.measureOptions).toEqual(['35CM', '45CM']);
  });
});
