import type { InventoryConfig } from 'p2p-mesh-core';
import { describe, expect, it } from 'vitest';
import {
  BUSINESS_PRESETS,
  type BusinessPreset,
  getPresetById,
  getPresetsByCategory,
  presetToInventoryConfig,
} from './businessPresets';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

// ─── BUSINESS_PRESETS array ────────────────────────────────────

describe('BUSINESS_PRESETS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BUSINESS_PRESETS)).toBe(true);
    expect(BUSINESS_PRESETS.length).toBeGreaterThan(0);
  });

  it('every preset has a unique id', () => {
    const ids = BUSINESS_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has valid structure', () => {
    for (const preset of BUSINESS_PRESETS) {
      expect(typeof preset.id).toBe('string');
      expect(preset.id.trim()).not.toBe('');
      expect(typeof preset.name).toBe('string');
      expect(preset.name.trim()).not.toBe('');
      expect(typeof preset.description).toBe('string');
      expect(typeof preset.icon).toBe('string');
      expect(['retail', 'food', 'manufacturing', 'services', 'general']).toContain(preset.category);
      expect(Array.isArray(preset.variantAttributes)).toBe(true);
      expect(Array.isArray(preset.fields)).toBe(true);
      expect(Array.isArray(preset.colorOptions)).toBe(true);
      expect(Array.isArray(preset.measureOptions)).toBe(true);
      expect(Array.isArray(preset.materialOptions)).toBe(true);
      expect(typeof preset.customOptions).toBe('object');
      expect(Array.isArray(preset.suggestedUnits)).toBe(true);
      expect(typeof preset.currency).toBe('string');
      expect(typeof preset.currencySymbol).toBe('string');
    }
  });

  it('every preset has at least one suggested unit', () => {
    for (const preset of BUSINESS_PRESETS) {
      expect(preset.suggestedUnits.length).toBeGreaterThan(0);
    }
  });

  it('every color option has a valid hex value', () => {
    for (const preset of BUSINESS_PRESETS) {
      for (const color of preset.colorOptions) {
        expect(color.name.trim()).not.toBe('');
        expect(color.hex).toMatch(HEX_PATTERN);
      }
    }
  });

  it('every field has required properties', () => {
    for (const preset of BUSINESS_PRESETS) {
      for (const field of preset.fields) {
        expect(typeof field.id).toBe('string');
        expect(typeof field.key).toBe('string');
        expect(typeof field.label).toBe('string');
        expect(typeof field.type).toBe('string');
      }
    }
  });

  it('no preset has duplicate variantAttributes', () => {
    for (const preset of BUSINESS_PRESETS) {
      const attrs = preset.variantAttributes;
      expect(new Set(attrs).size).toBe(attrs.length);
    }
  });

  it('includes presets across all categories', () => {
    const categories = BUSINESS_PRESETS.map((p) => p.category);
    expect(categories).toContain('retail');
    expect(categories).toContain('food');
    expect(categories).toContain('manufacturing');
    expect(categories).toContain('general');
  });
});

// ─── presetToInventoryConfig ───────────────────────────────────

describe('presetToInventoryConfig', () => {
  it('returns a valid InventoryConfig for each preset', () => {
    for (const preset of BUSINESS_PRESETS) {
      const config: InventoryConfig = presetToInventoryConfig(preset);

      expect(config.variantAttributes).toEqual(preset.variantAttributes);
      expect(config.measureOptions).toEqual(preset.measureOptions);
      expect(config.colorOptions).toEqual(preset.colorOptions);
      expect(config.materialOptions).toEqual(preset.materialOptions);
      expect(config.autoApplyProductUpdates).toBe(false);
      expect(config.productHistoryLimit).toBe(5);
      expect(config.useEdgeMeshSync).toBe(false);
    }
  });

  it('preserves colorOptions with valid hex values', () => {
    for (const preset of BUSINESS_PRESETS) {
      const config = presetToInventoryConfig(preset);
      for (const color of config.colorOptions) {
        expect(color.hex).toMatch(HEX_PATTERN);
      }
    }
  });

  it('general-simple preset produces a config with empty variant attributes', () => {
    const preset = getPresetById('general-simple')!;
    expect(preset).toBeDefined();
    const config = presetToInventoryConfig(preset);
    expect(config.variantAttributes).toEqual([]);
    expect(config.fields).toEqual([]);
    expect(config.measureOptions).toEqual([]);
    expect(config.colorOptions).toEqual([]);
    expect(config.materialOptions).toEqual([]);
  });

  it('ropa-calzado preset includes material options', () => {
    const preset = getPresetById('ropa-calzado')!;
    expect(preset).toBeDefined();
    const config = presetToInventoryConfig(preset);
    expect(config.materialOptions.length).toBeGreaterThan(0);
    expect(config.materialOptions).toContain('Algodón');
  });

  it('materas-plantas preset includes both measure and material options', () => {
    const preset = getPresetById('materas-plantas')!;
    const config = presetToInventoryConfig(preset);
    expect(config.measureOptions.length).toBeGreaterThan(0);
    expect(config.materialOptions.length).toBeGreaterThan(0);
  });
});

// ─── getPresetById ─────────────────────────────────────────────

describe('getPresetById', () => {
  it('returns the correct preset for a known id', () => {
    const preset = getPresetById('ropa-calzado');
    expect(preset).toBeDefined();
    expect(preset?.id).toBe('ropa-calzado');
    expect(preset?.name).toBe('Ropa y Calzado');
    expect(preset?.category).toBe('retail');
  });

  it('returns undefined for an unknown id', () => {
    expect(getPresetById('nonexistent-id')).toBeUndefined();
  });

  it('returns all presets when queried by their ids', () => {
    for (const preset of BUSINESS_PRESETS) {
      const found = getPresetById(preset.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(preset.id);
    }
  });
});

// ─── getPresetsByCategory ──────────────────────────────────────

describe('getPresetsByCategory', () => {
  it('returns only retail presets for "retail"', () => {
    const retail = getPresetsByCategory('retail');
    expect(retail.length).toBeGreaterThan(0);
    for (const p of retail) {
      expect(p.category).toBe('retail');
    }
  });

  it('returns only food presets for "food"', () => {
    const food = getPresetsByCategory('food');
    expect(food.length).toBeGreaterThan(0);
    for (const p of food) {
      expect(p.category).toBe('food');
    }
  });

  it('returns only manufacturing presets for "manufacturing"', () => {
    const mfg = getPresetsByCategory('manufacturing');
    expect(mfg.length).toBeGreaterThan(0);
    for (const p of mfg) {
      expect(p.category).toBe('manufacturing');
    }
  });

  it('returns only general presets for "general"', () => {
    const general = getPresetsByCategory('general');
    expect(general.length).toBeGreaterThan(0);
    for (const p of general) {
      expect(p.category).toBe('general');
    }
  });

  it('returns empty array for a category with no presets', () => {
    const services = getPresetsByCategory('services');
    // services category currently has no presets
    expect(services).toEqual([]);
  });

  it('total of all categories equals BUSINESS_PRESETS length', () => {
    const allCategories: BusinessPreset['category'][] = ['retail', 'food', 'manufacturing', 'services', 'general'];
    const total = allCategories.reduce((sum, cat) => sum + getPresetsByCategory(cat).length, 0);
    expect(total).toBe(BUSINESS_PRESETS.length);
  });
});
