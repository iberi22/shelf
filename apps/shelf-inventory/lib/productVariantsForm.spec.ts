import type { Product, ProductVariant } from 'p2p-mesh-core';
import { describe, expect, it } from 'vitest';
import {
  cloneVariantDrafts,
  createDefaultVariant,
  createVariantDraft,
  generateVariantsFromSelections,
  getProductVariantAttributes,
  getProductVariantDisplay,
  getProductVariants,
  getVariantInventoryKey,
  mergeProductVariants,
  normalizeProduct,
  normalizeVariant,
  productVariantCount,
  summarizeVariantValues,
  splitVariantLabel,
} from './productVariants';

// ─── Test data builders ───────────────────────────────────────

const buildProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'prod-1',
    isActive: true,
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
    name: 'Test Product',
    quantity: 0,
    price: 10,
    cost: 5,
    ...overrides,
  }) as Product;

const buildVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant =>
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

// ─── createDefaultVariant ─────────────────────────────────────

describe('createDefaultVariant', () => {
  it('creates a default variant from a product without variants', () => {
    const product = buildProduct({ color: 'Rojo', dimensions: '20CM' });
    const draft = createDefaultVariant(product);

    expect(draft.id).toContain('prod-1__base');
    expect(draft.sku).toBe('');
    expect(draft.quantity).toBe(0);
    expect(draft.price).toBe(10);
    expect(draft.cost).toBe(5);
    expect(draft.attributes).toHaveProperty('Color');
    expect(draft.attributes).toHaveProperty('Medida');
  });

  it('uses variantAttributes from the product when provided', () => {
    const product = buildProduct({
      variantAttributes: ['Color', 'Material'],
      color: 'Azul',
      material: 'Algodón',
    });
    const draft = createDefaultVariant(product);

    expect(Object.keys(draft.attributes)).toEqual(['Color', 'Material']);
    expect(draft.attributes.Color).toBe('Azul');
    expect(draft.attributes.Material).toBe('Algodón');
  });

  it('carries over the product SKU', () => {
    const product = buildProduct({ sku: 'SKU-001' });
    const draft = createDefaultVariant(product);
    expect(draft.sku).toBe('SKU-001');
  });

  it('carries over the product imageUrl', () => {
    const product = buildProduct({ imageUrl: 'http://img.com/1.jpg' });
    const draft = createDefaultVariant(product);
    expect(draft.imageUrl).toBe('http://img.com/1.jpg');
  });
});

// ─── getProductVariantAttributes ──────────────────────────────

describe('getProductVariantAttributes', () => {
  it('returns explicit variantAttributes when present', () => {
    const product = buildProduct({ variantAttributes: ['Color', 'Size'] });
    expect(getProductVariantAttributes(product)).toEqual(['Color', 'Size']);
  });

  it('infers attributes from existing variants when variantAttributes is empty', () => {
    const product = buildProduct({
      variants: [
        buildVariant({ attributes: { Color: 'Rojo', Material: 'Seda' } }),
      ],
    });
    const labels = getProductVariantAttributes(product);
    expect(labels).toContain('Color');
    expect(labels).toContain('Material');
  });

  it('falls back to legacy fields when no variants exist', () => {
    const product = buildProduct({ color: 'Rojo', dimensions: '20CM' });
    const labels = getProductVariantAttributes(product);
    expect(labels).toContain('Color');
    expect(labels).toContain('Medida');
  });

  it('returns empty when product has no attributes at all', () => {
    const product = buildProduct({});
    const labels = getProductVariantAttributes(product);
    expect(labels).toHaveLength(0);
  });

  it('deduplicates variant attributes', () => {
    const product = buildProduct({ variantAttributes: ['Color', 'Color', 'Medida'] });
    expect(getProductVariantAttributes(product)).toEqual(['Color', 'Medida']);
  });
});

// ─── productVariantCount ──────────────────────────────────────

describe('productVariantCount', () => {
  it('counts variants from a product with explicit variants', () => {
    const product = buildProduct({
      variantAttributes: ['Color'],
      variants: [
        buildVariant({ attributes: { Color: 'Rojo' } }),
        buildVariant({ attributes: { Color: 'Azul' } }),
        buildVariant({ attributes: { Color: 'Verde' } }),
      ],
    });
    expect(productVariantCount(product)).toBe(3);
  });

  it('returns 1 for a product without variants (default variant)', () => {
    const product = buildProduct({ color: 'Rojo' });
    expect(productVariantCount(product)).toBe(1);
  });
});

// ─── getProductVariantDisplay ─────────────────────────────────

describe('getProductVariantDisplay', () => {
  it('returns the display string for a variant', () => {
    const product = buildProduct({ variantAttributes: ['Color', 'Medida'] });
    const variant = buildVariant({ attributes: { Color: 'Rojo', Medida: '20CM' } });

    expect(getProductVariantDisplay(product, variant)).toBe('Rojo | 20CM');
  });

  it('falls back to label if attributes are empty', () => {
    const product = buildProduct({ variantAttributes: ['Color'] });
    const variant = buildVariant({ label: 'Custom Label', attributes: {} });

    expect(getProductVariantDisplay(product, variant)).toBe('Custom Label');
  });

  it('returns "Default" for null variant with no variants (falls back to default)', () => {
    const product = buildProduct({ variants: [] });
    // When variant is null and product has no variants, it creates a default variant
    // which gets a "Default" label
    const result = getProductVariantDisplay(product, null);
    expect(result).toBe('Default');
  });
});

// ─── getVariantInventoryKey ───────────────────────────────────

describe('getVariantInventoryKey', () => {
  it('creates a key with productId and variantId', () => {
    expect(getVariantInventoryKey('prod-1', 'var-1')).toBe('prod-1::var-1');
  });

  it('uses "base" when variantId is undefined', () => {
    expect(getVariantInventoryKey('prod-1')).toBe('prod-1::base');
  });
});

// ─── cloneVariantDrafts ───────────────────────────────────────

describe('cloneVariantDrafts', () => {
  it('creates independent copies of variant drafts', () => {
    const original = createVariantDraft(['Color', 'Medida'], {
      sku: 'SKU-1',
      quantity: 5,
      price: 10,
      attributes: { Color: 'Rojo', Medida: '20CM' },
    });

    const cloned = cloneVariantDrafts([original], ['Color', 'Medida']);

    expect(cloned).toHaveLength(1);
    expect(cloned[0].sku).toBe('SKU-1');
    expect(cloned[0].quantity).toBe(5);
    expect(cloned[0].attributes).toEqual({ Color: 'Rojo', Medida: '20CM' });

    // Note: cloneVariantDrafts preserves the seed ID (createVariantDraft uses seed.id)
    // but creates a new attributes object
    expect(cloned[0].attributes).not.toBe(original.attributes);
    expect(cloned[0].attributes.Color).toBe(original.attributes.Color);
  });
});

// ─── generateVariantsFromSelections (extended) ────────────────

describe('generateVariantsFromSelections - extended', () => {
  it('generates single variant for one attribute with one value', () => {
    const drafts = generateVariantsFromSelections({ Color: ['Rojo'] });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].attributes.Color).toBe('Rojo');
  });

  it('handles 4+ colors and 3+ measures (12+ combinations)', () => {
    const drafts = generateVariantsFromSelections({
      Color: ['Rojo', 'Azul', 'Verde', 'Negro'],
      Medida: ['20CM', '28CM', '35CM'],
    });
    expect(drafts).toHaveLength(12);
  });

  it('includes all attribute combinations in the cartesian product', () => {
    const drafts = generateVariantsFromSelections({
      Color: ['A', 'B'],
      Material: ['X', 'Y', 'Z'],
    });

    const combinations = drafts.map(
      (d) => `${d.attributes.Color}/${d.attributes.Material}`,
    );
    expect(combinations).toContain('A/X');
    expect(combinations).toContain('A/Y');
    expect(combinations).toContain('A/Z');
    expect(combinations).toContain('B/X');
    expect(combinations).toContain('B/Y');
    expect(combinations).toContain('B/Z');
  });

  it('skips attributes with empty arrays', () => {
    const drafts = generateVariantsFromSelections({
      Color: ['Rojo'],
      Medida: [],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].attributes).toHaveProperty('Color');
    // Medida should not be present since it had no values
  });

  it('propagates base product price and cost to all drafts', () => {
    const drafts = generateVariantsFromSelections(
      { Color: ['Rojo', 'Azul'] },
      { price: 99.99, cost: 45.5, sku: 'BASE-SKU' },
    );

    for (const draft of drafts) {
      expect(draft.price).toBe(99.99);
      expect(draft.cost).toBe(45.5);
      expect(draft.sku).toBe('BASE-SKU');
    }
  });
});

// ─── normalizeVariant (extended) ──────────────────────────────

describe('normalizeVariant - extended', () => {
  it('creates a "Default" label when all attributes are empty', () => {
    const variant = normalizeVariant(
      { id: 'draft-1', attributes: { Color: '', Medida: '' } },
      ['Color', 'Medida'],
    );
    expect(variant.label).toBe('Default');
  });

  it('preserves a pre-set label over auto-generated one', () => {
    const variant = normalizeVariant(
      { id: 'd1', label: 'Custom Label', attributes: { Color: 'Rojo' } },
      ['Color'],
    );
    expect(variant.label).toBe('Custom Label');
  });

  it('trims extra whitespace in attribute values', () => {
    const variant = normalizeVariant(
      { id: 'd1', attributes: { Color: '   Rojo   ', Medida: '  20CM  ' } },
      ['Color', 'Medida'],
    );
    expect(variant.attributes.Color).toBe('Rojo');
    expect(variant.attributes.Medida).toBe('20CM');
  });

  it('defaults isActive to true and updatedBy to "local"', () => {
    const variant = normalizeVariant({ id: 'd1', attributes: {} }, []);
    expect(variant.isActive).toBe(true);
    expect(variant.updatedBy).toBe('local');
  });

  it('parses numeric string values for quantity, price, cost', () => {
    const variant = normalizeVariant(
      { id: 'd1', quantity: '42', price: '99.99', cost: '50', attributes: {} },
      [],
    );
    expect(variant.quantity).toBe(42);
    expect(variant.price).toBe(99.99);
    expect(variant.cost).toBe(50);
  });
});

// ─── mergeProductVariants ─────────────────────────────────────

describe('mergeProductVariants', () => {
  it('merges variants from multiple products', () => {
    const p1 = buildProduct({
      variantAttributes: ['Color'],
      variants: [buildVariant({ attributes: { Color: 'Rojo' }, quantity: 5 })],
    });
    const p2 = buildProduct({
      variantAttributes: ['Color'],
      variants: [buildVariant({ attributes: { Color: 'Azul' }, quantity: 3 })],
    });

    const merged = mergeProductVariants([p1, p2]);
    expect(merged).toHaveLength(2);
  });

  it('sums quantities for duplicate attribute combinations', () => {
    const p1 = buildProduct({
      variantAttributes: ['Color'],
      variants: [buildVariant({ attributes: { Color: 'Rojo' }, quantity: 5 })],
    });
    const p2 = buildProduct({
      variantAttributes: ['Color'],
      variants: [buildVariant({ attributes: { Color: 'Rojo' }, quantity: 3 })],
    });

    const merged = mergeProductVariants([p1, p2]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(8);
  });

  it('returns empty array for empty input', () => {
    expect(mergeProductVariants([])).toEqual([]);
  });
});

// ─── normalizeProduct (extended) ──────────────────────────────

describe('normalizeProduct - extended', () => {
  it('falls back to first variant price/cost when product price/cost are NaN', () => {
    const product = buildProduct({
      price: NaN,
      cost: NaN,
      variants: [
        buildVariant({ attributes: { Color: 'Rojo' }, price: 25, cost: 10 }),
      ],
    });

    const normalized = normalizeProduct(product);
    expect(normalized.price).toBe(25);
    expect(normalized.cost).toBe(10);
  });

  it('derives color from the first variant when product.color is missing', () => {
    const product = buildProduct({
      color: undefined,
      variants: [
        buildVariant({ attributes: { Color: 'Azul' }, quantity: 1 }),
      ],
    });

    const normalized = normalizeProduct(product);
    expect(normalized.color).toBe('Azul');
  });

  it('derives dimensions from Medida variant attribute', () => {
    const product = buildProduct({
      dimensions: undefined,
      variants: [
        buildVariant({ attributes: { Medida: '30CM' }, quantity: 1 }),
      ],
    });

    const normalized = normalizeProduct(product);
    expect(normalized.dimensions).toBe('30CM');
  });

  it('preserves the product SKU over variant SKU', () => {
    const product = buildProduct({
      sku: 'P-SKU',
      variants: [buildVariant({ sku: 'V-SKU', attributes: {} })],
    });

    const normalized = normalizeProduct(product);
    expect(normalized.sku).toBe('P-SKU');
  });

  it('uses variant SKU when product SKU is missing', () => {
    const product = buildProduct({
      sku: undefined,
      variants: [buildVariant({ sku: 'V-SKU', attributes: {} })],
    });

    const normalized = normalizeProduct(product);
    expect(normalized.sku).toBe('V-SKU');
  });
});
