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
    { id: 'field-color', key: 'color', label: 'Color', type: 'color' },
    { id: 'field-dimensions', key: 'dimensions', label: 'Medida', type: 'measure' },
    { id: 'field-capacity', key: 'capacity', label: 'Capacidad', type: 'text' },
    { id: 'field-material', key: 'material', label: 'Material', type: 'text' },
  ],
  measureOptions: ['30CM', '40CM', '50CM', '60CM'],
};

export const normalizeInventoryConfig = (config?: Partial<InventoryConfig> | null): InventoryConfig => {
  const variantAttributes = Array.from(
    new Set((config?.variantAttributes || DEFAULT_INVENTORY_CONFIG.variantAttributes).map((label) => label.trim()).filter(Boolean)),
  );

  const fields = (config?.fields?.length ? config.fields : DEFAULT_INVENTORY_CONFIG.fields).map((field, index) => ({
    id: field.id || createId(`field_${index}`),
    key: field.key.trim() || `field_${index + 1}`,
    label: field.label.trim() || `Campo ${index + 1}`,
    type: field.type || 'text',
  }));

  const measureOptions = Array.from(
    new Set((config?.measureOptions || DEFAULT_INVENTORY_CONFIG.measureOptions).map((value) => value.trim()).filter(Boolean)),
  );

  return {
    variantAttributes: variantAttributes.length > 0 ? variantAttributes : DEFAULT_INVENTORY_CONFIG.variantAttributes,
    fields: fields.length > 0 ? fields : DEFAULT_INVENTORY_CONFIG.fields,
    measureOptions: measureOptions.length > 0 ? measureOptions : DEFAULT_INVENTORY_CONFIG.measureOptions,
  };
};

export const createInventoryField = (index: number): InventoryFieldDefinition => ({
  id: createId(`inventory-field-${index}`),
  key: `custom_field_${index + 1}`,
  label: `Campo ${index + 1}`,
  type: 'text',
});

export const getInventoryFieldValue = (product: Partial<Product>, field: InventoryFieldDefinition): string => {
  const legacyValues: Record<string, string | undefined> = {
    color: product.color,
    dimensions: product.dimensions,
    capacity: product.capacity,
    material: product.material,
  };

  return (
    legacyValues[field.key] ||
    product.customFields?.[field.key] ||
    ''
  );
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
