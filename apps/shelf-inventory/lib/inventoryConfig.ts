import type { InventoryConfig, InventoryFieldDefinition, Product } from 'p2p-mesh-core';

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_INVENTORY_CONFIG: InventoryConfig = {
  variantAttributes: ['Color', 'Medida'],
  fields: [
    { id: 'field-color', key: 'color', label: 'Color', type: 'multiColor' },
    { id: 'field-dimensions', key: 'dimensions', label: 'Medida', type: 'multiMeasure' },
    { id: 'field-capacity', key: 'capacity', label: 'Capacidad', type: 'text' },
    { id: 'field-material', key: 'material', label: 'Material', type: 'text' },
  ],
  measureOptions: ['5CM', '7CM', '10CM', '12CM', '14CM', '15CM', '17CM', '20CM', '28CM'],
  autoApplyProductUpdates: false,
  productHistoryLimit: 5,
};

const LEGACY_DEFAULT_MEASURE_OPTIONS = ['30CM', '40CM', '50CM', '60CM'];

const matchesMeasureOptions = (options: string[], expected: string[]) =>
  options.length === expected.length && options.every((option, index) => option.toUpperCase() === expected[index]);

export const normalizeInventoryFieldKey = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

  return normalized || fallback;
};

export const normalizeInventoryConfig = (config?: Partial<InventoryConfig> | null): InventoryConfig => {
  const variantAttributes = Array.from(
    new Set(
      (config?.variantAttributes || DEFAULT_INVENTORY_CONFIG.variantAttributes)
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  );

  const usedFieldKeys = new Set<string>();
  const fields = (config?.fields?.length ? config.fields : DEFAULT_INVENTORY_CONFIG.fields).map((field, index) => {
    const fallbackKey = `field_${index + 1}`;
    const baseKey = normalizeInventoryFieldKey(field.key || '', fallbackKey);
    let key = baseKey;
    let suffix = 2;
    while (usedFieldKeys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    usedFieldKeys.add(key);

    const type = ['text', 'color', 'measure', 'multiColor', 'multiMeasure'].includes(field.type) ? field.type : 'text';

    return {
      id: field.id || createId(`field_${index}`),
      key,
      label: field.label.trim() || `Campo ${index + 1}`,
      type,
    };
  });

  const normalizedMeasureOptions = Array.from(
    new Set(
      (config?.measureOptions || DEFAULT_INVENTORY_CONFIG.measureOptions).map((value) => value.trim()).filter(Boolean),
    ),
  );
  const measureOptions = matchesMeasureOptions(normalizedMeasureOptions, LEGACY_DEFAULT_MEASURE_OPTIONS)
    ? DEFAULT_INVENTORY_CONFIG.measureOptions
    : normalizedMeasureOptions;

  return {
    variantAttributes: variantAttributes.length > 0 ? variantAttributes : DEFAULT_INVENTORY_CONFIG.variantAttributes,
    fields: fields.length > 0 ? fields : DEFAULT_INVENTORY_CONFIG.fields,
    measureOptions: measureOptions.length > 0 ? measureOptions : DEFAULT_INVENTORY_CONFIG.measureOptions,
    autoApplyProductUpdates: Boolean(config?.autoApplyProductUpdates),
    productHistoryLimit: Math.min(5, Math.max(1, Number(config?.productHistoryLimit) || 5)),
  };
};

export const createInventoryField = (index: number): InventoryFieldDefinition => ({
  id: createId(`inventory-field-${index}`),
  key: `custom_field_${index + 1}`,
  label: `Campo ${index + 1}`,
  type: 'text',
});

export const getInventoryFieldValue = (product: Partial<Product>, field: InventoryFieldDefinition): string => {
  const legacyValues: Record<string, string | string[] | undefined> = {
    color: product.color || product.colors,
    dimensions: product.dimensions || product.sizes,
    capacity: product.capacity,
    material: product.material,
  };

  const value = legacyValues[field.key] || product.customFields?.[field.key] || '';
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value;
};

export const setInventoryFieldValue = (
  product: Partial<Product>,
  field: InventoryFieldDefinition,
  value: string,
): Partial<Product> => {
  const trimmed = value.trim();

  if (field.key === 'color') {
    return { ...product, color: trimmed || undefined };
  }
  if (field.key === 'dimensions') {
    return { ...product, dimensions: trimmed || undefined };
  }
  if (field.key === 'capacity') {
    return { ...product, capacity: trimmed || undefined };
  }
  if (field.key === 'material') {
    return { ...product, material: trimmed || undefined };
  }

  return {
    ...product,
    customFields: {
      ...(product.customFields || {}),
      [field.key]: trimmed,
    },
  };
};
