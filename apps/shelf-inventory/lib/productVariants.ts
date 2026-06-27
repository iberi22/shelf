import type { Product, ProductVariant } from 'p2p-mesh-core';

export type VariantDraft = {
  id: string;
  sku: string;
  quantity: number | string;
  price: number | string;
  cost: number | string;
  imageUrl?: string;
  attributes: Record<string, string>;
};

const LEGACY_ATTRIBUTE_LABELS = ['Color', 'Medida', 'Measure', 'Capacity', 'Material'];

const LEGACY_ATTRIBUTE_ALIASES: Record<string, string[]> = {
  Color: ['color'],
  Medida: ['dimensions', 'size', 'measure', 'medida'],
  Measure: ['dimensions', 'size', 'measure', 'medida'],
  Capacity: ['capacity', 'capacidad'],
  Material: ['material'],
};

const DEFAULT_VARIANT_ID = 'base';

const normalizeLabel = (value: string): string => value.trim().replace(/\s+/g, ' ');

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getLegacyAttributeValue = (product: Partial<Product>, label: string): string => {
  const aliases = LEGACY_ATTRIBUTE_ALIASES[label] || [];
  const rawValue = aliases
    .map((key) => product[key as keyof Product])
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof rawValue === 'string' ? rawValue : '';
};

const getVariantAttributesFromProduct = (product: Partial<Product>): string[] => {
  const direct = Array.isArray(product.variantAttributes)
    ? product.variantAttributes.map((label) => normalizeLabel(label)).filter(Boolean)
    : [];

  if (direct.length > 0) {
    return Array.from(new Set(direct));
  }

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const labels = new Set<string>();
    for (const variant of product.variants) {
      for (const key of Object.keys(variant.attributes || {})) {
        const label = normalizeLabel(key);
        if (label) labels.add(label);
      }
    }
    if (labels.size > 0) {
      return Array.from(labels);
    }
  }

  return LEGACY_ATTRIBUTE_LABELS.filter((label) => getLegacyAttributeValue(product, label));
};

const buildVariantKey = (attributes: Record<string, string>, labels: string[]): string => {
  return labels
    .map((label) => normalizeLabel(attributes[label] || ''))
    .join(' | ')
    .toLowerCase();
};

const createVariantLabel = (attributes: Record<string, string>, labels: string[]): string => {
  const parts = labels.map((label) => normalizeLabel(attributes[label] || '')).filter((value) => value.length > 0);
  return parts.length > 0 ? parts.join(' | ') : 'Default';
};

export const createDefaultVariant = (product: Partial<Product>, labels?: string[]): VariantDraft => {
  const attributeLabels = labels || getVariantAttributesFromProduct(product);
  const attributes: Record<string, string> = {};

  for (const label of attributeLabels) {
    attributes[label] = getLegacyAttributeValue(product, label);
  }

  return {
    id: `${product.id || DEFAULT_VARIANT_ID}__${DEFAULT_VARIANT_ID}`,
    sku: product.sku || '',
    quantity: Number(product.quantity || 0),
    price: Number(product.price || 0),
    cost: Number(product.cost || 0),
    imageUrl: product.imageUrl || undefined,
    attributes,
  };
};

export const normalizeVariant = (variant: Partial<ProductVariant> | VariantDraft, labels: string[]): ProductVariant => {
  const draft = variant as Partial<ProductVariant> & Partial<VariantDraft> & Record<string, any>;
  const normalizedAttributes: Record<string, string> = {};

  for (const label of labels) {
    const directValue = typeof draft.attributes?.[label] === 'string' ? draft.attributes[label] : '';
    normalizedAttributes[label] = normalizeLabel(directValue || '');
  }

  for (const [key, value] of Object.entries(draft.attributes || {})) {
    const normalizedKey = normalizeLabel(key);
    if (!normalizedKey) continue;
    if (!(normalizedKey in normalizedAttributes)) {
      normalizedAttributes[normalizedKey] = normalizeLabel(value || '');
    }
  }

  const quantity = Number(draft.quantity || 0);
  const price = Number(draft.price ?? 0);
  const cost = Number(draft.cost ?? 0);

  return {
    id: draft.id || createId('variant'),
    isActive: draft.isActive ?? true,
    updatedBy: draft.updatedBy || 'local',
    updatedAt: draft.updatedAt || new Date().toISOString(),
    updatedByRole: draft.updatedByRole,
    signature: draft.signature,
    label: normalizeLabel(draft.label || createVariantLabel(normalizedAttributes, labels)),
    sku: normalizeLabel(draft.sku || ''),
    quantity,
    price,
    cost,
    imageUrl: draft.imageUrl || undefined,
    attributes: normalizedAttributes,
  };
};

export const getProductVariantAttributes = (product: Partial<Product>): string[] => {
  return getVariantAttributesFromProduct(product);
};

export const getProductVariants = (product: Product): ProductVariant[] => {
  const labels = getProductVariantAttributes(product);
  const sourceVariants =
    Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants
      : [createDefaultVariant(product, labels)];
  const variants = sourceVariants.map((variant) => normalizeVariant(variant, labels));

  const merged = new Map<string, ProductVariant>();
  for (const variant of variants) {
    const key = buildVariantKey(variant.attributes, labels) || variant.id;
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        quantity: existing.quantity + variant.quantity,
        price: variant.price || existing.price,
        cost: variant.cost || existing.cost,
        imageUrl: variant.imageUrl || existing.imageUrl,
        label: existing.label || variant.label,
      });
    } else {
      merged.set(key, variant);
    }
  }

  return Array.from(merged.values());
};

export const normalizeProduct = (product: Product): Product => {
  const variantAttributes = getProductVariantAttributes(product);
  const variants = getProductVariants(product);
  const quantity = variants.reduce((sum, variant) => sum + Number(variant.quantity || 0), 0);
  const primaryVariant = variants[0] || createDefaultVariant(product, variantAttributes);

  return {
    ...product,
    variantAttributes,
    variants,
    quantity,
    sku: product.sku || primaryVariant.sku || undefined,
    price: Number.isFinite(Number(product.price)) ? Number(product.price) : primaryVariant.price,
    cost: Number.isFinite(Number(product.cost)) ? Number(product.cost) : primaryVariant.cost,
    imageUrl: product.imageUrl || primaryVariant.imageUrl,
    color: product.color || primaryVariant.attributes.Color || primaryVariant.attributes.color,
    dimensions:
      product.dimensions ||
      primaryVariant.attributes.Medida ||
      primaryVariant.attributes.Measure ||
      primaryVariant.attributes.dimensions,
    capacity: product.capacity || primaryVariant.attributes.Capacity || primaryVariant.attributes.capacity,
    material: product.material || primaryVariant.attributes.Material || primaryVariant.attributes.material,
  };
};

export const productVariantCount = (product: Product): number => getProductVariants(product).length;

export const getProductVariantDisplay = (product: Product, variant?: ProductVariant | null): string => {
  const labels = getProductVariantAttributes(product);
  const target = variant || getProductVariants(product)[0];
  if (!target) return '';

  const parts = labels
    .map((label) => normalizeLabel(target.attributes[label] || ''))
    .filter((value) => value.length > 0);

  return parts.length > 0 ? parts.join(' | ') : target.label || '';
};

export const getVariantInventoryKey = (productId: string, variantId?: string) =>
  `${productId}::${variantId || DEFAULT_VARIANT_ID}`;

export const createVariantDraft = (attributeLabels: string[], seed?: Partial<VariantDraft>): VariantDraft => ({
  id: seed?.id || createId('variant'),
  sku: seed?.sku || '',
  quantity: Number(seed?.quantity || 0),
  price: Number(seed?.price || 0),
  cost: Number(seed?.cost || 0),
  imageUrl: seed?.imageUrl || undefined,
  attributes: attributeLabels.reduce<Record<string, string>>((acc, label) => {
    acc[label] = normalizeLabel(seed?.attributes?.[label] || '');
    return acc;
  }, {}),
});

export const cloneVariantDrafts = (variants: VariantDraft[], labels: string[]): VariantDraft[] =>
  variants.map((variant) => createVariantDraft(labels, variant));

export const summarizeVariantValues = (product: Product, maxItems = 4): string[] => {
  return getProductVariants(product)
    .slice(0, maxItems)
    .map((variant) => {
      const text = getProductVariantDisplay(product, variant);
      return text || variant.label || 'Default';
    });
};

export const splitVariantLabel = (label: string): string[] =>
  label
    .split(/[|/]/)
    .map((part) => normalizeLabel(part))
    .filter(Boolean);

/**
 * Generates all possible variant combinations from a set of selected attribute values.
 * This is the "native" way to create multi-color/multi-measure products.
 */
export const generateVariantsFromSelections = (
  attributeSelections: Record<string, string[]>,
  baseProduct?: Partial<Product>,
): VariantDraft[] => {
  const labels = Object.keys(attributeSelections).filter((label) => attributeSelections[label].length > 0);
  if (labels.length === 0) return [];

  const combinations: Record<string, string>[] = [];

  const cartesian = (index: number, current: Record<string, string>) => {
    if (index === labels.length) {
      combinations.push({ ...current });
      return;
    }

    const label = labels[index];
    const values = attributeSelections[label];
    for (const value of values) {
      current[label] = value;
      cartesian(index + 1, current);
    }
  };

  cartesian(0, {});

  return combinations.map((attrs) =>
    createVariantDraft(labels, {
      sku: baseProduct?.sku || '',
      quantity: 0,
      price: baseProduct?.price || 0,
      cost: baseProduct?.cost || 0,
      attributes: attrs,
    }),
  );
};

export const mergeProductVariants = (products: Product[]): ProductVariant[] => {
  const labels = products.flatMap((product) => getProductVariantAttributes(product));
  const normalizedLabels = Array.from(new Set(labels));
  const merged = new Map<string, ProductVariant>();

  for (const product of products) {
    for (const variant of getProductVariants(product)) {
      const key = buildVariantKey(variant.attributes, normalizedLabels) || variant.id;
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          quantity: existing.quantity + variant.quantity,
          price: variant.price || existing.price,
          cost: variant.cost || existing.cost,
          imageUrl: variant.imageUrl || existing.imageUrl,
          label: existing.label || variant.label,
        });
      } else {
        merged.set(key, variant);
      }
    }
  }

  return Array.from(merged.values());
};
