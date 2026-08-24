import { describe, expect, it } from 'vitest';
import { DEFAULT_INVENTORY_CONFIG, normalizeInventoryConfig } from '../inventoryConfig';

describe('normalizeInventoryConfig — tipos de campo (regresión chips material)', () => {
  it('conserva type=material en configs nuevas', () => {
    const cfg = normalizeInventoryConfig(null);
    const material = cfg.fields.find((f) => f.key === 'material');
    expect(material?.type).toBe('material');
  });

  it('MIGRA configs legacy donde material quedó degradado a text', () => {
    const cfg = normalizeInventoryConfig({
      ...DEFAULT_INVENTORY_CONFIG,
      fields: DEFAULT_INVENTORY_CONFIG.fields.map((f) => (f.key === 'material' ? { ...f, type: 'text' as const } : f)),
    });
    const material = cfg.fields.find((f) => f.key === 'material');
    expect(material?.type).toBe('material');
  });

  it('NO migra campos text legítimos que no son material', () => {
    const cfg = normalizeInventoryConfig({
      ...DEFAULT_INVENTORY_CONFIG,
      fields: DEFAULT_INVENTORY_CONFIG.fields.map((f) => (f.key === 'capacity' ? { ...f, type: 'text' as const } : f)),
    });
    const capacity = cfg.fields.find((f) => f.key === 'capacity');
    expect(capacity?.type).toBe('text');
  });

  it('acepta todos los InventoryFieldType válidos sin degradarlos', () => {
    const types = ['text', 'color', 'measure', 'material', 'multiColor', 'multiMeasure', 'multiMaterial'] as const;
    for (const t of types) {
      const cfg = normalizeInventoryConfig({
        fields: [{ id: `f-${t}`, key: t, label: t, type: t }],
        materialOptions: DEFAULT_INVENTORY_CONFIG.materialOptions,
      });
      expect(cfg.fields[0]?.type).toBe(t);
    }
  });

  it('degrada a text tipos desconocidos', () => {
    const cfg = normalizeInventoryConfig({
      fields: [{ id: 'f-weird', key: 'weird', label: 'Weird', type: 'nonsense' as never }],
    });
    expect(cfg.fields[0]?.type).toBe('text');
  });
});
