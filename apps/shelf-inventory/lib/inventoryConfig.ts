import type { InventoryColorOption, InventoryConfig, InventoryFieldDefinition, Product } from 'p2p-mesh-core';

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    if (typeof crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(4);
      crypto.getRandomValues(buf);
      const rand = Array.from(buf)
        .map((b) => b.toString(36).padStart(2, '0'))
        .join('')
        .substring(0, 8);
      return `${prefix}_${Date.now()}_${rand}`;
    }
  }

  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Cryptographically secure ID generation is required but not supported in this environment.');
  }

  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const rand = Array.from(buf)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 8);
  return `${prefix}_${Date.now()}_${rand}`;
};

export const DEFAULT_INVENTORY_CONFIG: InventoryConfig = {
  variantAttributes: ['Color', 'Medida', 'Material'],
  fields: [
    { id: 'field-color', key: 'color', label: 'Color', type: 'color' },
    { id: 'field-dimensions', key: 'dimensions', label: 'Medida', type: 'measure' },
    { id: 'field-capacity', key: 'capacity', label: 'Capacidad', type: 'text' },
    { id: 'field-material', key: 'material', label: 'Material', type: 'material' },
  ],
  measureOptions: ['5CM', '7CM', '10CM', '12CM', '14CM', '15CM', '17CM', '20CM', '28CM'],
  materialOptions: ['Plástico', 'Cemento', 'Cerámica', 'Metal'],
  colorOptions: [
    { name: 'Negro', hex: '#1a1a1a' },
    { name: 'Marfil', hex: '#FFFFF0' },
    { name: 'Blanco', hex: '#FFFFFF' },
    { name: 'Terracota', hex: '#E2725B' },
    { name: 'Rojo', hex: '#CC3333' },
    { name: 'Azul', hex: '#3355CC' },
    { name: 'Verde', hex: '#338833' },
    { name: 'Marrón', hex: '#8B4513' },
    { name: 'Beige', hex: '#F5F5DC' },
    { name: 'Gris', hex: '#808080' },
    { name: 'Oro', hex: '#D4A017' },
    { name: 'Plateado', hex: '#C0C0C0' },
  ],
  autoApplyProductUpdates: false,
  productHistoryLimit: 5,
  useEdgeMeshSync: false,
};

const FALLBACK_COLOR_HEX = '#808080';

const normalizeColorHex = (value: string): string =>
  /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : FALLBACK_COLOR_HEX;

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

    // Lista blanca completa de InventoryFieldType (types.ts). 'material'/'multiMaterial'
    // faltaban y degradaban el campo Material a 'text', ocultando los chips en filas
    // de variantes (regresion desde 2026-08-01, SRC-FUN-001).
    const VALID_FIELD_TYPES = [
      'text',
      'color',
      'measure',
      'material',
      'multiColor',
      'multiMeasure',
      'multiMaterial',
    ] as const;
    const rawType = field.type as (typeof VALID_FIELD_TYPES)[number];
    const type = VALID_FIELD_TYPES.includes(rawType) ? rawType : 'text';
    // Migracion: configs persistidas antes del fix quedaron con type 'text' en el
    // campo cuyo key/label corresponde a material — restaurarlo.
    const isLegacyDegradedMaterialField =
      type === 'text' &&
      (baseKey === 'material' || field.label?.trim().toLowerCase() === 'material') &&
      Array.isArray(config?.materialOptions) &&
      config!.materialOptions!.length > 0;

    return {
      id: field.id || createId(`field_${index}`),
      key,
      label: field.label.trim() || `Campo ${index + 1}`,
      type: isLegacyDegradedMaterialField ? 'material' : type,
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

  const rawColorOptions = (
    Array.isArray(config?.colorOptions) && config.colorOptions.length > 0
      ? config.colorOptions
      : DEFAULT_INVENTORY_CONFIG.colorOptions
  ) as InventoryColorOption[];
  const seenColorNames = new Set<string>();
  const colorOptions = rawColorOptions
    .map((option) => ({
      name: String(option?.name || '').trim(),
      hex: normalizeColorHex(String(option?.hex || '')),
    }))
    .filter((option) => {
      const key = option.name.toLowerCase();
      if (!key || seenColorNames.has(key)) return false;
      seenColorNames.add(key);
      return true;
    });

  const normalizedMaterialOptions = Array.from(
    new Set(
      (config?.materialOptions || DEFAULT_INVENTORY_CONFIG.materialOptions)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return {
    variantAttributes: variantAttributes.length > 0 ? variantAttributes : DEFAULT_INVENTORY_CONFIG.variantAttributes,
    fields: fields.length > 0 ? fields : DEFAULT_INVENTORY_CONFIG.fields,
    measureOptions: measureOptions.length > 0 ? measureOptions : DEFAULT_INVENTORY_CONFIG.measureOptions,
    colorOptions: colorOptions.length > 0 ? colorOptions : DEFAULT_INVENTORY_CONFIG.colorOptions,
    materialOptions:
      normalizedMaterialOptions.length > 0 ? normalizedMaterialOptions : DEFAULT_INVENTORY_CONFIG.materialOptions,
    autoApplyProductUpdates: Boolean(config?.autoApplyProductUpdates),
    productHistoryLimit: Math.min(5, Math.max(1, Number(config?.productHistoryLimit) || 5)),
    useEdgeMeshSync: Boolean(config?.useEdgeMeshSync),
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

  return legacyValues[field.key] || product.customFields?.[field.key] || '';
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
