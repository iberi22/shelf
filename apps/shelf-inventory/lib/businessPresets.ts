/**
 * Business Model Presets for Shelf Inventory
 *
 * The inventory engine is GENERIC — variant attributes are fully configurable.
 * On first launch, the onboarding flow asks what type of business the user has,
 * then applies a preset that configures the right attributes + options.
 *
 * Each preset defines:
 *   - variantAttributes: which dimensions to track (Color, Size, Material, etc.)
 *   - fields: form field definitions with display types
 *   - colorOptions / measureOptions / materialOptions: preset values
 *   - customOptions: any additional attribute options keyed by attribute name
 *   - suggestedUnits: measurement units relevant to this business type
 *   - currency: default currency for the region
 */

import type { InventoryColorOption, InventoryConfig } from 'p2p-mesh-core';

export interface BusinessPreset {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  category: 'retail' | 'food' | 'manufacturing' | 'services' | 'general';
  /** Which variant attributes this business type uses */
  variantAttributes: string[];
  /** Form fields configuration */
  fields: { id: string; key: string; label: string; type: string }[];
  /** Color options (if applicable) */
  colorOptions: InventoryColorOption[];
  /** Size/measure options (if applicable) */
  measureOptions: string[];
  /** Material options (if applicable) */
  materialOptions: string[];
  /** Additional attribute options keyed by attribute name */
  customOptions: Record<string, string[]>;
  /** Suggested units for this business */
  suggestedUnits: string[];
  /** Default currency */
  currency: string;
  /** Currency symbol */
  currencySymbol: string;
}

// ─── Material Presets ───

const COLORS_NEUTRAL: InventoryColorOption[] = [
  { name: 'Blanco', hex: '#FFFFFF' },
  { name: 'Negro', hex: '#1a1a1a' },
  { name: 'Gris', hex: '#808080' },
];

const COLORS_FULL: InventoryColorOption[] = [
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
];

const COLORS_CLOTHING: InventoryColorOption[] = [
  { name: 'Negro', hex: '#1a1a1a' },
  { name: 'Blanco', hex: '#FFFFFF' },
  { name: 'Gris', hex: '#808080' },
  { name: 'Azul marino', hex: '#1B2A4A' },
  { name: 'Azul claro', hex: '#87CEEB' },
  { name: 'Rojo', hex: '#CC3333' },
  { name: 'Rosa', hex: '#FF69B4' },
  { name: 'Verde', hex: '#338833' },
  { name: 'Amarillo', hex: '#FFD700' },
  { name: 'Naranja', hex: '#FF8C00' },
  { name: 'Morado', hex: '#800080' },
  { name: 'Beige', hex: '#F5F5DC' },
];

const COLORS_FOOD: InventoryColorOption[] = [
  { name: 'Natural', hex: '#F5DEB3' },
  { name: 'Rojo', hex: '#CC3333' },
  { name: 'Verde', hex: '#338833' },
  { name: 'Amarillo', hex: '#FFD700' },
  { name: 'Naranja', hex: '#FF8C00' },
];

// ─── Business Presets ───

export const BUSINESS_PRESETS: BusinessPreset[] = [
  // ──── RETAIL ────
  {
    id: 'materas-plantas',
    name: 'Materas y Plantas',
    description: 'Macetas, tierra, fertilizantes, herramientas de jardinería',
    icon: '🪴',
    category: 'retail',
    variantAttributes: ['Color', 'Medida', 'Material'],
    fields: [
      { id: 'field-color', key: 'color', label: 'Color', type: 'color' },
      { id: 'field-dimensions', key: 'dimensions', label: 'Medida', type: 'measure' },
      { id: 'field-material', key: 'material', label: 'Material', type: 'material' },
      { id: 'field-capacity', key: 'capacity', label: 'Capacidad', type: 'text' },
    ],
    colorOptions: COLORS_FULL,
    measureOptions: ['5CM', '7CM', '10CM', '12CM', '14CM', '15CM', '17CM', '20CM', '28CM', '35CM', '40CM'],
    materialOptions: ['Plástico', 'Cemento', 'Cerámica', 'Metal', 'Fibra de vidrio'],
    customOptions: {},
    suggestedUnits: ['pieza', 'par', 'docena', 'kg', 'litro'],
    currency: 'COP',
    currencySymbol: '$',
  },
  {
    id: 'ropa-calzado',
    name: 'Ropa y Calzado',
    description: 'Prendas de vestir, zapatos, accesorios de moda',
    icon: '👕',
    category: 'retail',
    variantAttributes: ['Color', 'Talla', 'Material'],
    fields: [
      { id: 'field-color', key: 'color', label: 'Color', type: 'color' },
      { id: 'field-dimensions', key: 'dimensions', label: 'Talla', type: 'measure' },
      { id: 'field-material', key: 'material', label: 'Material', type: 'material' },
    ],
    colorOptions: COLORS_CLOTHING,
    measureOptions: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '37', '38', '39', '40', '41', '42', '43', '44'],
    materialOptions: ['Algodón', 'Poliéster', 'Seda', 'Lana', 'Cuero', 'Lino', 'Jean', 'Nylon'],
    customOptions: { Talla: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    suggestedUnits: ['pieza', 'par', 'docena', 'kit'],
    currency: 'COP',
    currencySymbol: '$',
  },
  {
    id: 'electronicos',
    name: 'Electrónicos',
    description: 'Celulares, computadores, accesorios, cables',
    icon: '📱',
    category: 'retail',
    variantAttributes: ['Modelo', 'Capacidad'],
    fields: [
      { id: 'field-dimensions', key: 'dimensions', label: 'Modelo', type: 'text' },
      { id: 'field-capacity', key: 'capacity', label: 'Capacidad', type: 'text' },
    ],
    colorOptions: COLORS_NEUTRAL,
    measureOptions: [],
    materialOptions: [],
    customOptions: { Modelo: [], Capacidad: ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
    suggestedUnits: ['pieza', 'par', 'kit', 'pack'],
    currency: 'USD',
    currencySymbol: '$',
  },
  {
    id: 'alimentos-bebidas',
    name: 'Alimentos y Bebidas',
    description: 'Restaurantes, tiendas de alimentos, cafeterías',
    icon: '🍕',
    category: 'food',
    variantAttributes: ['Tamaño', 'Sabor'],
    fields: [
      { id: 'field-dimensions', key: 'dimensions', label: 'Tamaño', type: 'measure' },
      { id: 'field-material', key: 'material', label: 'Sabor', type: 'text' },
    ],
    colorOptions: COLORS_FOOD,
    measureOptions: ['Pequeño', 'Mediano', 'Grande', 'Familiar', 'Individual'],
    materialOptions: [],
    customOptions: { Sabor: [] },
    suggestedUnits: ['pieza', 'porción', 'kg', 'litro', 'botella', 'caja'],
    currency: 'COP',
    currencySymbol: '$',
  },
  {
    id: 'farmacia',
    name: 'Farmacia / Salud',
    description: 'Medicamentos, productos de higiene, suplementos',
    icon: '💊',
    category: 'retail',
    variantAttributes: ['Presentación', 'Contenido'],
    fields: [
      { id: 'field-dimensions', key: 'dimensions', label: 'Presentación', type: 'text' },
      { id: 'field-capacity', key: 'capacity', label: 'Contenido', type: 'text' },
    ],
    colorOptions: COLORS_NEUTRAL,
    measureOptions: [],
    materialOptions: [],
    customOptions: {
      Presentación: ['Tableta', 'Cápsula', 'Jarabe', 'Crema', 'Spray', 'Gotas', 'Ampolla'],
      Contenido: ['10ml', '30ml', '50ml', '100ml', '200ml', '250ml', '500ml'],
    },
    suggestedUnits: ['pieza', 'caja', 'blister', 'frasco', 'unit'],
    currency: 'COP',
    currencySymbol: '$',
  },
  {
    id: 'materiales-construccion',
    name: 'Materiales de Construcción',
    description: 'Cemento, varillas, bloques, pinturas, herramientas',
    icon: '🏗️',
    category: 'manufacturing',
    variantAttributes: ['Marca', 'Medida'],
    fields: [
      { id: 'field-dimensions', key: 'dimensions', label: 'Medida', type: 'measure' },
      { id: 'field-material', key: 'material', label: 'Marca', type: 'text' },
    ],
    colorOptions: COLORS_NEUTRAL,
    measureOptions: ['1/4"', '3/8"', '1/2"', '5/8"', '3/4"', '1"', '1-1/4"', '1-1/2"'],
    materialOptions: [],
    customOptions: { Marca: [] },
    suggestedUnits: ['pieza', 'bulto', 'kg', 'litro', 'm²', 'ml', 'rollo', 'varilla'],
    currency: 'COP',
    currencySymbol: '$',
  },
  {
    id: 'papeleria',
    name: 'Papelería y Oficina',
    description: 'Útiles escolares, artículos de oficina, papelería',
    icon: '📝',
    category: 'retail',
    variantAttributes: ['Color', 'Tamaño'],
    fields: [
      { id: 'field-color', key: 'color', label: 'Color', type: 'color' },
      { id: 'field-dimensions', key: 'dimensions', label: 'Tamaño', type: 'measure' },
    ],
    colorOptions: [
      { name: 'Rojo', hex: '#CC3333' },
      { name: 'Azul', hex: '#3355CC' },
      { name: 'Verde', hex: '#338833' },
      { name: 'Negro', hex: '#1a1a1a' },
      { name: 'Amarillo', hex: '#FFD700' },
      { name: 'Naranja', hex: '#FF8C00' },
      { name: 'Rosa', hex: '#FF69B4' },
      { name: 'Morado', hex: '#800080' },
    ],
    measureOptions: [],
    materialOptions: [],
    customOptions: { Tamaño: [] },
    suggestedUnits: ['pieza', 'caja', 'paquete', 'reso', 'libro', 'cuaderno'],
    currency: 'COP',
    currencySymbol: '$',
  },
  {
    id: 'vehiculos',
    name: 'Vehículos / Repuestos',
    description: 'Autos, motos, repuestos, accesorios automotrices',
    icon: '🚗',
    category: 'retail',
    variantAttributes: ['Marca', 'Modelo', 'Año'],
    fields: [
      { id: 'field-dimensions', key: 'dimensions', label: 'Marca', type: 'text' },
      { id: 'field-material', key: 'material', label: 'Modelo', type: 'text' },
      { id: 'field-capacity', key: 'capacity', label: 'Año', type: 'text' },
    ],
    colorOptions: COLORS_NEUTRAL,
    measureOptions: [],
    materialOptions: [],
    customOptions: { Marca: [], Modelo: [], Año: [] },
    suggestedUnits: ['pieza', 'par', 'kit', 'juego'],
    currency: 'USD',
    currencySymbol: '$',
  },
  // ──── GENERAL ────
  {
    id: 'general-simple',
    name: 'Inventario Simple',
    description: 'Sin variantes — productos básicos con cantidad y precio',
    icon: '📦',
    category: 'general',
    variantAttributes: [],
    fields: [],
    colorOptions: [],
    measureOptions: [],
    materialOptions: [],
    customOptions: {},
    suggestedUnits: ['pieza', 'par', 'docena', 'kg', 'litro', 'caja', 'paquete'],
    currency: 'COP',
    currencySymbol: '$',
  },
  {
    id: 'general-custom',
    name: 'Personalizado',
    description: 'Configurar desde cero — para productos no estándar',
    icon: '⚙️',
    category: 'general',
    variantAttributes: ['Color', 'Medida'],
    fields: [
      { id: 'field-color', key: 'color', label: 'Color', type: 'color' },
      { id: 'field-dimensions', key: 'dimensions', label: 'Medida', type: 'measure' },
      { id: 'field-material', key: 'material', label: 'Material', type: 'text' },
    ],
    colorOptions: COLORS_FULL,
    measureOptions: [],
    materialOptions: [],
    customOptions: {},
    suggestedUnits: ['pieza', 'par', 'docena', 'kg', 'litro'],
    currency: 'COP',
    currencySymbol: '$',
  },
];

/**
 * Convert a BusinessPreset into an InventoryConfig
 */
export const presetToInventoryConfig = (preset: BusinessPreset): InventoryConfig => ({
  variantAttributes: preset.variantAttributes,
  fields: preset.fields as InventoryConfig['fields'],
  measureOptions: preset.measureOptions,
  colorOptions: preset.colorOptions,
  materialOptions: preset.materialOptions,
  autoApplyProductUpdates: false,
  productHistoryLimit: 5,
  useEdgeMeshSync: false,
});

/**
 * Get preset by ID
 */
export const getPresetById = (id: string): BusinessPreset | undefined => BUSINESS_PRESETS.find((p) => p.id === id);

/**
 * Get presets by category
 */
export const getPresetsByCategory = (category: BusinessPreset['category']): BusinessPreset[] =>
  BUSINESS_PRESETS.filter((p) => p.category === category);
