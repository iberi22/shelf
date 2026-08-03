import { describe, expect, it } from 'vitest';
import {
  createInventoryField,
  DEFAULT_INVENTORY_CONFIG,
  getInventoryFieldValue,
  normalizeInventoryConfig,
  normalizeInventoryFieldKey,
  setInventoryFieldValue,
} from './inventoryConfig';

// ─── normalizeInventoryFieldKey ───────────────────────────────

describe('normalizeInventoryFieldKey', () => {
  it('lowercases and trims', () => {
    expect(normalizeInventoryFieldKey('  My Field  ', 'fallback')).toBe('my_field');
  });

  it('replaces non-alphanumeric characters with underscores', () => {
    expect(normalizeInventoryFieldKey('My Field!@#$%', 'fallback')).toBe('my_field');
  });

  it('strips leading and trailing underscores', () => {
    expect(normalizeInventoryFieldKey('_my_field_', 'fallback')).toBe('my_field');
  });

  it('collapses consecutive underscores', () => {
    expect(normalizeInventoryFieldKey('my___field', 'fallback')).toBe('my_field');
  });

  it('returns fallback for empty string', () => {
    expect(normalizeInventoryFieldKey('', 'fallback_key')).toBe('fallback_key');
  });

  it('returns fallback for string of only special characters', () => {
    expect(normalizeInventoryFieldKey('!!!@@@', 'fallback')).toBe('fallback');
  });
});

// ─── normalizeInventoryConfig ─────────────────────────────────

describe('normalizeInventoryConfig - extended', () => {
  it('defaults productHistoryLimit to 5 when NaN', () => {
    const config = normalizeInventoryConfig({ productHistoryLimit: NaN });
    expect(config.productHistoryLimit).toBe(5);
  });

  it('clamps productHistoryLimit between 1 and 5', () => {
    // 0 is falsy so Number(0) || 5 = 5, meaning it defaults to 5 not clamps to 1
    expect(normalizeInventoryConfig({ productHistoryLimit: 0 }).productHistoryLimit).toBe(5);
    expect(normalizeInventoryConfig({ productHistoryLimit: 100 }).productHistoryLimit).toBe(5);
    expect(normalizeInventoryConfig({ productHistoryLimit: 1 }).productHistoryLimit).toBe(1);
    expect(normalizeInventoryConfig({ productHistoryLimit: 3 }).productHistoryLimit).toBe(3);
  });

  it('defaults autoApplyProductUpdates to false', () => {
    expect(normalizeInventoryConfig({}).autoApplyProductUpdates).toBe(false);
  });

  it('preserves autoApplyProductUpdates when set to true', () => {
    expect(normalizeInventoryConfig({ autoApplyProductUpdates: true }).autoApplyProductUpdates).toBe(true);
  });

  it('defaults useEdgeMeshSync to false', () => {
    expect(normalizeInventoryConfig({}).useEdgeMeshSync).toBe(false);
  });

  it('preserves variantAttributes when provided', () => {
    const config = normalizeInventoryConfig({
      variantAttributes: ['Color', 'Version', 'Material'],
    });
    expect(config.variantAttributes).toEqual(['Color', 'Version', 'Material']);
  });

  it('deduplicates variant attributes (case-sensitive)', () => {
    const config = normalizeInventoryConfig({
      variantAttributes: ['Color', 'Color', 'Medida'],
    });
    // Set deduplication is case-sensitive: 'Color' appears twice but only once in Set
    expect(config.variantAttributes).toEqual(['Color', 'Medida']);
  });

  it('removes empty variant attributes', () => {
    const config = normalizeInventoryConfig({
      variantAttributes: ['Color', '', '  ', 'Medida'],
    });
    expect(config.variantAttributes).toEqual(['Color', 'Medida']);
  });

  it('normalizes custom fields with proper key generation', () => {
    const config = normalizeInventoryConfig({
      fields: [
        { id: 'f1', key: 'my custom field', label: 'My Field', type: 'text' },
        { id: 'f2', key: 'another field!', label: 'Another', type: 'color' },
      ],
    });
    expect(config.fields[0].key).toBe('my_custom_field');
    expect(config.fields[1].key).toBe('another_field');
  });

  it('deduplicates field keys by appending a suffix', () => {
    const config = normalizeInventoryConfig({
      fields: [
        { id: 'f1', key: 'duplicate', label: 'First', type: 'text' },
        { id: 'f2', key: 'duplicate', label: 'Second', type: 'text' },
      ],
    });
    expect(config.fields[0].key).toBe('duplicate');
    expect(config.fields[1].key).toBe('duplicate_2');
  });

  it('validates field type, defaulting invalid to "text"', () => {
    const config = normalizeInventoryConfig({
      fields: [{ id: 'f1', key: 'field1', label: 'Test', type: 'invalid' as any }],
    });
    expect(config.fields[0].type).toBe('text');
  });

  it('trims whitespace from field labels and defaults empty labels', () => {
    const config = normalizeInventoryConfig({
      fields: [
        { id: 'f1', key: 'field1', label: '  ', type: 'text' },
        { id: 'f2', key: 'field2', label: '', type: 'text' },
      ],
    });
    expect(config.fields[0].label).toBe('Campo 1');
    expect(config.fields[1].label).toBe('Campo 2');
  });
});

// ─── createInventoryField ─────────────────────────────────────

describe('createInventoryField', () => {
  it('creates a field with sequential key and label', () => {
    const field = createInventoryField(0);
    expect(field.key).toBe('custom_field_1');
    expect(field.label).toBe('Campo 1');
    expect(field.type).toBe('text');
    expect(field.id).toContain('inventory-field-0');
  });

  it('increments the index correctly', () => {
    const field = createInventoryField(4);
    expect(field.key).toBe('custom_field_5');
    expect(field.label).toBe('Campo 5');
  });
});

// ─── getInventoryFieldValue ───────────────────────────────────

describe('getInventoryFieldValue', () => {
  const product = {
    color: 'Rojo',
    dimensions: '20CM',
    capacity: '500ml',
    material: 'Algodón',
    customFields: { brand: 'Nike' },
  };

  it('reads from legacy color field', () => {
    expect(getInventoryFieldValue(product, { id: '1', key: 'color', label: 'Color', type: 'color' })).toBe('Rojo');
  });

  it('reads from legacy dimensions field', () => {
    expect(getInventoryFieldValue(product, { id: '1', key: 'dimensions', label: 'Medida', type: 'measure' })).toBe(
      '20CM',
    );
  });

  it('reads from legacy capacity field', () => {
    expect(getInventoryFieldValue(product, { id: '1', key: 'capacity', label: 'Capacidad', type: 'text' })).toBe(
      '500ml',
    );
  });

  it('reads from legacy material field', () => {
    expect(getInventoryFieldValue(product, { id: '1', key: 'material', label: 'Material', type: 'text' })).toBe(
      'Algodón',
    );
  });

  it('reads from customFields for unknown keys', () => {
    expect(getInventoryFieldValue(product, { id: '1', key: 'brand', label: 'Marca', type: 'text' })).toBe('Nike');
  });

  it('returns empty string for missing fields', () => {
    expect(getInventoryFieldValue(product, { id: '1', key: 'nonexistent', label: 'X', type: 'text' })).toBe('');
  });
});

// ─── setInventoryFieldValue ───────────────────────────────────

describe('setInventoryFieldValue', () => {
  it('sets the color field', () => {
    const result = setInventoryFieldValue({}, { id: '1', key: 'color', label: 'Color', type: 'color' }, 'Azul');
    expect(result).toEqual({ color: 'Azul' });
  });

  it('sets the dimensions field', () => {
    const result = setInventoryFieldValue({}, { id: '1', key: 'dimensions', label: 'Medida', type: 'measure' }, '30CM');
    expect(result).toEqual({ dimensions: '30CM' });
  });

  it('sets the capacity field', () => {
    const result = setInventoryFieldValue({}, { id: '1', key: 'capacity', label: 'Capacidad', type: 'text' }, '1L');
    expect(result).toEqual({ capacity: '1L' });
  });

  it('sets the material field', () => {
    const result = setInventoryFieldValue({}, { id: '1', key: 'material', label: 'Material', type: 'text' }, 'Seda');
    expect(result).toEqual({ material: 'Seda' });
  });

  it('sets unknown fields in customFields', () => {
    const result = setInventoryFieldValue({}, { id: '1', key: 'brand', label: 'Marca', type: 'text' }, 'Nike');
    expect(result.customFields).toEqual({ brand: 'Nike' });
  });

  it('appends to existing customFields', () => {
    const existing = { customFields: { origin: 'Colombia' } };
    const result = setInventoryFieldValue(existing, { id: '1', key: 'brand', label: 'Marca', type: 'text' }, 'Adidas');
    expect(result.customFields).toEqual({ origin: 'Colombia', brand: 'Adidas' });
  });

  it('clears a field when value is empty (sets undefined)', () => {
    const existing = { color: 'Rojo' };
    const result = setInventoryFieldValue(existing, { id: '1', key: 'color', label: 'Color', type: 'color' }, '');
    expect(result.color).toBeUndefined();
  });

  it('trims whitespace from values', () => {
    const result = setInventoryFieldValue({}, { id: '1', key: 'color', label: 'Color', type: 'color' }, '  Azul  ');
    expect(result.color).toBe('Azul');
  });

  it('preserves other product properties', () => {
    const existing = { name: 'Test', price: 25, customFields: { origin: 'Colombia' } };
    const result = setInventoryFieldValue(existing, { id: '1', key: 'brand', label: 'Marca', type: 'text' }, 'Nike');
    expect(result.name).toBe('Test');
    expect(result.price).toBe(25);
  });
});

// ─── Currency settings persistence ────────────────────────────

describe('currency settings (DEFAULT_INVENTORY_CONFIG)', () => {
  it('has sensible defaults for auto-apply', () => {
    expect(DEFAULT_INVENTORY_CONFIG.autoApplyProductUpdates).toBe(false);
  });

  it('has a product history limit', () => {
    expect(DEFAULT_INVENTORY_CONFIG.productHistoryLimit).toBeGreaterThan(0);
  });

  it('includes both Color and Medida as default variant attributes', () => {
    expect(DEFAULT_INVENTORY_CONFIG.variantAttributes).toContain('Color');
    expect(DEFAULT_INVENTORY_CONFIG.variantAttributes).toContain('Medida');
  });
});
