import type { Product, ProductVariant } from 'p2p-mesh-core';
import { describe, expect, it } from 'vitest';
import {
  createVariantDraft,
  generateVariantsFromSelections,
  getProductVariants,
  isVersionAttributeLabel,
  normalizeProduct,
  normalizeVariant,
  splitVariantLabel,
  summarizeVariantValues,
} from './productVariants';

const buildProduct = (overrides: Partial<Product>): Product =>
  ({
    id: 'prod-1',
    isActive: true,
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
    name: 'Camiseta',
    quantity: 0,
    price: 10,
    cost: 5,
    ...overrides,
  }) as Product;

const buildVariant = (overrides: Partial<ProductVariant>): ProductVariant =>
  ({
    id: 'variant-1',
    isActive: true,
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
    quantity: 0,
    price: 0,
    cost: 0,
    attributes: {},
    ...overrides,
  }) as ProductVariant;

describe('isVersionAttributeLabel', () => {
  it('recognizes version/model aliases in Spanish and English', () => {
    for (const label of ['Versión', 'version', 'VERSION', 'Modelo', 'model', 'Edición', 'edicion']) {
      expect(isVersionAttributeLabel(label)).toBe(true);
    }
  });

  it('rejects non-version attributes', () => {
    for (const label of ['Color', 'Medida', 'Material', 'Capacidad', '']) {
      expect(isVersionAttributeLabel(label)).toBe(false);
    }
  });
});

describe('createVariantDraft', () => {
  it('creates a draft with normalized attributes for the given labels', () => {
    const draft = createVariantDraft(['Color', 'Medida'], {
      sku: 'SKU-1',
      quantity: 3,
      price: 12.5,
      cost: 7,
      attributes: { Color: '  Rojo  ', Medida: '20CM', Extra: 'ignored' },
    });

    expect(draft.sku).toBe('SKU-1');
    expect(draft.quantity).toBe(3);
    expect(draft.attributes).toEqual({ Color: 'Rojo', Medida: '20CM' });
  });

  it('defaults missing attributes to empty strings', () => {
    const draft = createVariantDraft(['Color', 'Versión']);
    expect(draft.attributes).toEqual({ Color: '', Versión: '' });
  });
});

describe('generateVariantsFromSelections', () => {
  it('generates the cartesian product of colors and measures', () => {
    const drafts = generateVariantsFromSelections({
      Color: ['Rojo', 'Azul'],
      Medida: ['20CM', '28CM'],
    });

    expect(drafts).toHaveLength(4);
    expect(drafts.map((d) => `${d.attributes.Color}/${d.attributes.Medida}`)).toEqual([
      'Rojo/20CM',
      'Rojo/28CM',
      'Azul/20CM',
      'Azul/28CM',
    ]);
  });

  it('supports a third dimension such as versions/models', () => {
    const drafts = generateVariantsFromSelections({
      Color: ['Rojo', 'Azul'],
      Medida: ['20CM', '28CM'],
      Versión: ['V1', 'V2'],
    });

    expect(drafts).toHaveLength(8);
    expect(drafts[0].attributes).toEqual({ Color: 'Rojo', Medida: '20CM', Versión: 'V1' });
  });

  it('returns an empty list when no selection has values', () => {
    expect(generateVariantsFromSelections({ Color: [], Medida: [] })).toEqual([]);
    expect(generateVariantsFromSelections({})).toEqual([]);
  });

  it('seeds sku, price and cost from the base product', () => {
    const drafts = generateVariantsFromSelections({ Color: ['Rojo'] }, { sku: 'BASE', price: 99, cost: 40 });
    expect(drafts[0]).toMatchObject({ sku: 'BASE', price: 99, cost: 40, quantity: 0 });
  });
});

describe('normalizeVariant', () => {
  it('normalizes attributes against labels and computes a display label', () => {
    const variant = normalizeVariant(
      { id: 'draft-1', sku: '', quantity: '2', price: '15', cost: '8', attributes: { Color: 'Rojo', Medida: '20CM' } },
      ['Color', 'Medida'],
    );

    expect(variant.quantity).toBe(2);
    expect(variant.price).toBe(15);
    expect(variant.cost).toBe(8);
    expect(variant.label).toBe('Rojo | 20CM');
    expect(variant.attributes).toEqual({ Color: 'Rojo', Medida: '20CM' });
  });
});

describe('getProductVariants', () => {
  it('merges duplicate attribute combinations summing quantities', () => {
    const product = buildProduct({
      variantAttributes: ['Color'],
      variants: [
        buildVariant({ id: 'v1', attributes: { Color: 'Rojo' }, quantity: 2, price: 10, cost: 5 }),
        buildVariant({ id: 'v2', attributes: { Color: 'Rojo' }, quantity: 3, price: 10, cost: 5 }),
      ],
    });

    const variants = getProductVariants(product);
    expect(variants).toHaveLength(1);
    expect(variants[0].quantity).toBe(5);
  });

  it('falls back to a default variant built from legacy fields', () => {
    const product = buildProduct({ color: 'Azul', dimensions: '20CM', quantity: 4, variants: [] });
    const variants = getProductVariants(product);

    expect(variants).toHaveLength(1);
    // Legacy aliases expose both the Spanish and English labels for dimensions
    expect(variants[0].attributes).toEqual({ Color: 'Azul', Medida: '20CM', Measure: '20CM' });
  });
});

describe('normalizeProduct', () => {
  it('aggregates quantity across variants and derives legacy fields', () => {
    const product = buildProduct({
      variantAttributes: ['Color', 'Versión'],
      variants: [
        buildVariant({ id: 'v1', attributes: { Color: 'Rojo', Versión: 'V1' }, quantity: 2, price: 10, cost: 5 }),
        buildVariant({ id: 'v2', attributes: { Color: 'Azul', Versión: 'V2' }, quantity: 5, price: 12, cost: 6 }),
      ],
    });

    const normalized = normalizeProduct(product);
    expect(normalized.quantity).toBe(7);
    expect(normalized.color).toBe('Rojo');
    expect(normalized.variantAttributes).toEqual(['Color', 'Versión']);
  });
});

describe('summarizeVariantValues', () => {
  it('summarizes variant display values up to the limit', () => {
    const product = buildProduct({
      variantAttributes: ['Color'],
      variants: [
        buildVariant({ id: 'v1', attributes: { Color: 'Rojo' }, quantity: 1, price: 10, cost: 5 }),
        buildVariant({ id: 'v2', attributes: { Color: 'Azul' }, quantity: 1, price: 10, cost: 5 }),
        buildVariant({ id: 'v3', attributes: { Color: 'Verde' }, quantity: 1, price: 10, cost: 5 }),
      ],
    });

    expect(summarizeVariantValues(product, 2)).toEqual(['Rojo', 'Azul']);
  });
});

describe('splitVariantLabel', () => {
  it('splits compound labels into normalized parts', () => {
    expect(splitVariantLabel('Rojo | 20CM / V2')).toEqual(['Rojo', '20CM', 'V2']);
  });
});
