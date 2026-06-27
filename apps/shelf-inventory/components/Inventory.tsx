import { Box, History, Images, Layers3, Package2, PencilLine, RotateCcw, Ruler, Trash2 } from 'lucide-react';
import type { Product } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import useLocalStorage from '../hooks/useLocalStorage';
import { useSortableTable } from '../hooks/useSortableTable';
import { compressImage } from '../lib/imageCompression';
import { DEFAULT_INVENTORY_CONFIG, getInventoryFieldValue, normalizeInventoryConfig } from '../lib/inventoryConfig';
import {
  createVariantDraft,
  getProductVariants,
  normalizeProduct,
  summarizeVariantValues,
  type VariantDraft,
} from '../lib/productVariants';
import BarcodeScanner from './BarcodeScanner';
import { InfiniteTable } from './InfiniteTable';
import Modal from './Modal';

const isValidHexColor = (color: string): boolean => /^#[0-9a-f]{6}$/i.test(color);

const PRESET_COLORS = [
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

const isColorAttribute = (label: string): boolean => label.trim().toLowerCase() === 'color';
const isMeasureAttribute = (label: string): boolean => label.trim().toLowerCase() === 'medida';

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const LEGACY_FIELD_KEYS = new Set(['color', 'dimensions', 'capacity', 'material']);

const getInitialVariantAttributes = (
  product: Product | null,
  useVariants: boolean,
  defaultLabels: string[],
): string[] => {
  const variantAttributes = product?.variantAttributes ?? [];
  if (variantAttributes.length > 0) {
    return Array.from(new Set(variantAttributes.map((label: string) => label.trim()).filter(Boolean)));
  }
  const variants = product?.variants ?? [];
  if (variants.length > 0) {
    return Array.from(new Set(Object.keys(variants[0]?.attributes || {})));
  }
  return useVariants ? [...defaultLabels] : [];
};

const getInitialVariantRows = (product: Product | null, labels: string[]): VariantDraft[] => {
  const variants = product?.variants ?? [];
  if (variants.length > 0) {
    return variants.map((variant) =>
      createVariantDraft(labels, {
        id: variant.id,
        sku: variant.sku || '',
        quantity: variant.quantity,
        price: variant.price,
        cost: variant.cost,
        imageUrl: variant.imageUrl,
        attributes: variant.attributes,
      }),
    );
  }

  const defaultAttributes = labels.reduce<Record<string, string>>((acc, label) => {
    const normalized = label.trim().toLowerCase();
    if (normalized === 'color') acc[label] = product?.color || '';
    else if (normalized === 'medida' || normalized === 'dimensions' || normalized === 'size')
      acc[label] = product?.dimensions || '';
    else if (normalized === 'capacity' || normalized === 'capacidad') acc[label] = product?.capacity || '';
    else if (normalized === 'material') acc[label] = product?.material || '';
    else acc[label] = product?.customFields?.[label] || '';
    return acc;
  }, {});

  return [
    createVariantDraft(labels, {
      sku: product?.sku || '',
      quantity: product?.quantity ?? 0,
      price: product?.price ?? 0,
      cost: product?.cost ?? 0,
      imageUrl: product?.imageUrl || undefined,
      attributes: defaultAttributes,
    }),
  ];
};

const Inventory: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const canEdit = state.role === 'admin' || state.permissions?.canEditProducts !== false;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const { t } = useI18n();
  const { formatCurrency } = useCurrency();
  const { showNotification } = useUI();
  const [lowStockThreshold] = useLocalStorage('lowStockThreshold', 5);
  const inventoryConfig = useMemo(
    () => normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG),
    [state.inventoryConfig],
  );
  const inventoryFieldDefinitions = inventoryConfig.fields;
  const colorField = inventoryFieldDefinitions.find((field) => field.key === 'color');
  const dimensionsField = inventoryFieldDefinitions.find((field) => field.key === 'dimensions');
  const capacityField = inventoryFieldDefinitions.find((field) => field.key === 'capacity');
  const materialField = inventoryFieldDefinitions.find((field) => field.key === 'material');

  const activeProducts = useMemo(
    () => state.products.filter((product) => product.isActive !== false).map((product) => normalizeProduct(product)),
    [state.products],
  );

  const {
    items: sortedProducts,
    requestSort,
    getSortIndicator,
  } = useSortableTable<Product>(activeProducts, { key: 'name', direction: 'asc' });

  const [filter, setFilter] = useState('');

  const filteredProducts = useMemo(() => {
    if (!filter) return sortedProducts;
    const q = filter.toLowerCase();
    return sortedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.sku?.toLowerCase().includes(q) ||
        product.color?.toLowerCase().includes(q) ||
        product.dimensions?.toLowerCase().includes(q) ||
        product.capacity?.toLowerCase().includes(q) ||
        product.material?.toLowerCase().includes(q) ||
        Object.values(product.customFields || {}).some((value) => String(value).toLowerCase().includes(q)) ||
        inventoryFieldDefinitions.some((field) => field.label.toLowerCase().includes(q)) ||
        product.variantAttributes?.some((attr: string) => attr.toLowerCase().includes(q)) ||
        product.variants?.some((variant) =>
          Object.values(variant.attributes || {}).some((value: unknown) => String(value).toLowerCase().includes(q)),
        ),
    );
  }, [sortedProducts, filter, inventoryFieldDefinitions]);

  const getVariantSummary = (product: Product) => {
    const variants = getProductVariants(product);
    if (variants.length <= 1) return '';
    return summarizeVariantValues(product, 3).join(' | ');
  };

  const getCustomFieldSummary = (product: Product) =>
    inventoryFieldDefinitions
      .filter((field) => !LEGACY_FIELD_KEYS.has(field.key))
      .map((field) => {
        const value = getInventoryFieldValue(product, field);
        return value ? `${field.label}: ${value}` : '';
      })
      .filter(Boolean)
      .join(' · ');

  const handleOpenModal = (product: Product | null = null) => {
    if (!canEdit && !product) return;
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingProduct(null);
    setIsModalOpen(false);
  };

  const handleSaveProduct = (productData: Omit<Product, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => {
    if (!canEdit) return;
    const timestamp = new Date().toISOString();
    if (editingProduct) {
      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          ...editingProduct,
          ...productData,
          updatedAt: timestamp,
        } as Product,
      });
    } else {
      dispatch({
        type: 'ADD_PRODUCT',
        payload: {
          id: timestamp,
          ...productData,
          isActive: true,
          updatedAt: timestamp,
        } as Product,
      });
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (!canEdit) return;
    if (window.confirm(t('inventory.deleteConfirm'))) {
      dispatch({ type: 'DELETE_PRODUCT', payload: id });
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'id',
      'name',
      'sku',
      'variantAttributes',
      'variantSummary',
      'quantity',
      'price',
      'cost',
      'imageUrl',
      ...inventoryFieldDefinitions.map((field) => field.key),
    ];
    const rows = activeProducts.map((product) =>
      [
        csvEscape(product.id),
        csvEscape(product.name),
        csvEscape(product.sku || ''),
        csvEscape(product.variantAttributes?.join(' | ') || ''),
        csvEscape(getVariantSummary(product)),
        csvEscape(product.quantity),
        csvEscape(product.price),
        csvEscape(product.cost),
        csvEscape(product.imageUrl || ''),
        ...inventoryFieldDefinitions.map((field) => csvEscape(getInventoryFieldValue(product, field))),
      ].join(','),
    );

    const csvContent = `data:text/csv;charset=utf-8,${[headers.join(','), ...rows].join('\n')}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shelf_productos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortableHeader: React.FC<{ sortKey: keyof Product; label: string }> = ({ sortKey, label }) => (
    <th className="p-2 md:p-3">
      <button
        data-testid={`sort-by-${sortKey}`}
        onClick={() => requestSort(sortKey)}
        className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
        aria-label={`${t('common.sortBy')} ${label}`}
      >
        {label}
        <span className="text-yellow-400 text-xs">{getSortIndicator(sortKey)}</span>
      </button>
    </th>
  );

  const handleBatchImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit || isProcessingBatch) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingBatch(true);
    setBatchProgress(`0 / ${files.length}`);

    const newDrafts: Product[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBatchProgress(`${i + 1} / ${files.length}`);
      try {
        const base64 = await compressImage(file, 800, 800, 0.8);
        newDrafts.push({
          id: `draft_${Date.now()}_${i}`,
          name: `[BORRADOR] ${file.name.split('.')[0]}`,
          quantity: 0,
          price: 0,
          cost: 0,
          imageUrl: base64,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: state.localPeerId || 'local',
        });
      } catch (error) {
        console.error('Error procesando imagen del lote:', error);
      }
    }

    if (newDrafts.length > 0) {
      dispatch({ type: 'BATCH_UPDATE_PRODUCTS', payload: { toAdd: newDrafts, toUpdate: [] } });
      showNotification(`${newDrafts.length} borradores de productos creados con éxito.`, 'success');
    }
    e.target.value = '';
    setIsProcessingBatch(false);
  };

  return (
    <div>
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight shrink-0">{t('inventory.title')}</h2>
          <p className="text-sm text-white/50 mt-1">
            Un producto puede tener variantes por color, medida y atributos personalizados.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-wrap sm:flex-nowrap">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder={t('inventory.searchPlaceholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full p-2.5 pl-9 bg-[#1e1e1e] border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4ADE80] text-sm text-white"
              data-testid="inventory-search-input"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <title>Buscar productos</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
          </div>
          <div className="flex gap-2 sm:gap-4 items-center">
            <button
              onClick={handleExportCSV}
              className="flex-1 sm:flex-none bg-white/5 border border-white/10 text-white font-medium py-2.5 px-4 rounded-lg hover:bg-white/10 transition-all duration-200 active:scale-95 text-sm"
              data-testid="export-csv-button"
            >
              {t('common.exportCsv')}
            </button>
            {canEdit && (
              <>
                <input
                  type="file"
                  id="batchImageUpload"
                  multiple
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  onChange={handleBatchImageUpload}
                  disabled={isProcessingBatch}
                  data-testid="batch-image-upload-input"
                />
                <label
                  htmlFor={isProcessingBatch ? undefined : 'batchImageUpload'}
                  className={`flex items-center justify-center flex-1 sm:flex-none bg-transparent border border-blue-500/50 text-blue-400 font-bold py-2 px-3 sm:px-4 rounded-lg hover:bg-blue-500/10 transition-all duration-200 active:scale-95 text-sm min-h-[44px] ${isProcessingBatch ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  title="Subir lote de imágenes"
                >
                  <span className="inline-flex items-center gap-2">
                    <Images className="h-4 w-4" aria-hidden="true" />
                    <span>Lote</span>
                  </span>
                </label>
                <button
                  onClick={() => handleOpenModal()}
                  disabled={isProcessingBatch}
                  className="flex-1 sm:flex-none bg-[#4ADE80] text-[#161616] font-bold py-2.5 px-6 rounded-lg hover:bg-[#22C55E] transition-all duration-200 active:scale-95 text-sm disabled:opacity-50 shadow-[0_0_15px_rgba(74,222,128,0.2)]"
                  data-testid="add-product-button"
                >
                  {t('inventory.addProduct')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="hidden sm:block">
        <InfiniteTable
          data={filteredProducts}
          height="calc(100vh - 200px)"
          emptyContent={<div className="text-center p-8 text-[#F5F5DC]/70">{t('inventory.empty')}</div>}
          onItemClick={(product) => handleOpenModal(product)}
          fixedHeaderContent={() => (
            <tr className="text-xs md:text-sm text-neutral-400 font-medium tracking-wide">
              <th className="p-2 md:p-4 w-10 text-center font-bold">#</th>
              <th className="p-2 md:p-4">{t('common.image')}</th>
              <SortableHeader sortKey="name" label={t('common.product')} />
              <SortableHeader sortKey="sku" label={t('common.sku')} />
              <SortableHeader sortKey="quantity" label={t('common.quantity')} />
              <SortableHeader sortKey="price" label={t('common.price')} />
              <SortableHeader sortKey="color" label={colorField?.label || t('common.color')} />
              <th className="hidden xl:table-cell p-4">
                <button
                  onClick={() => requestSort('dimensions')}
                  className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
                  aria-label={`${t('common.sortBy')} ${dimensionsField?.label || t('common.dimensions')}`}
                >
                  {dimensionsField?.label || t('common.dimensions')}
                  <span className="text-yellow-400 text-xs">{getSortIndicator('dimensions')}</span>
                </button>
              </th>
              <th className="hidden xl:table-cell p-4">
                <button
                  onClick={() => requestSort('capacity')}
                  className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
                  aria-label={`${t('common.sortBy')} ${capacityField?.label || t('common.capacity')}`}
                >
                  {capacityField?.label || t('common.capacity')}
                  <span className="text-yellow-400 text-xs">{getSortIndicator('capacity')}</span>
                </button>
              </th>
              <th className="hidden xl:table-cell p-4">
                <button
                  onClick={() => requestSort('material')}
                  className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
                  aria-label={`${t('common.sortBy')} ${materialField?.label || t('common.material')}`}
                >
                  {materialField?.label || t('common.material')}
                  <span className="text-yellow-400 text-xs">{getSortIndicator('material')}</span>
                </button>
              </th>
              <th className="hidden xl:table-cell p-4">
                <button
                  onClick={() => requestSort('cost')}
                  className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
                  aria-label={`${t('common.sortBy')} ${t('common.cost')}`}
                >
                  {t('common.cost')}
                  <span className="text-yellow-400 text-xs">{getSortIndicator('cost')}</span>
                </button>
              </th>
              {canEdit && <th className="p-3">{t('common.actions')}</th>}
            </tr>
          )}
          itemContent={(index, product) => (
            <>
              <td className="p-2 md:p-4 text-xs md:text-sm font-semibold text-neutral-500 w-10 text-center select-none font-mono">
                {index + 1}
              </td>
              <td className="p-1.5 md:p-4">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-8 w-8 md:h-10 md:w-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-md bg-[#F5F5DC]/10 flex items-center justify-center text-base md:text-lg">
                    <Package2 className="h-5 w-5 text-[#F5F5DC]/45" aria-hidden="true" />
                  </div>
                )}
              </td>
              <td className="p-2 md:p-4 max-w-[90px] md:max-w-[150px] xl:max-w-none text-white">
                <div className="truncate font-semibold" title={product.name}>
                  {product.name}
                </div>
                {getVariantSummary(product) && (
                  <div className="mt-1 text-[10px] text-[#F5F5DC]/45 truncate" title={getVariantSummary(product)}>
                    {getVariantSummary(product)}
                  </div>
                )}
                {getCustomFieldSummary(product) && (
                  <div className="mt-1 text-[10px] text-[#F5F5DC]/55 truncate" title={getCustomFieldSummary(product)}>
                    {getCustomFieldSummary(product)}
                  </div>
                )}
              </td>
              <td
                className="p-2 md:p-4 max-w-[60px] md:max-w-[70px] truncate text-neutral-400"
                title={product.sku || ''}
              >
                {product.sku || <span className="text-neutral-600">-</span>}
              </td>
              <td className="p-2 md:p-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {product.quantity > 0 && product.quantity <= lowStockThreshold ? (
                    <div className="flex items-center gap-1.5 bg-[#EAB308]/10 text-[#EAB308] px-2.5 py-1 rounded-full text-xs font-bold border border-[#EAB308]/20 glow-text-yellow w-max">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EAB308] animate-pulse"></div>
                      {product.quantity}
                    </div>
                  ) : product.quantity > 0 ? (
                    <div className="flex items-center gap-1.5 bg-[#4ADE80]/10 text-[#4ADE80] px-2.5 py-1 rounded-full text-xs font-bold border border-[#4ADE80]/20 glow-text-green w-max">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]"></div>
                      {product.quantity}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full text-xs font-bold border border-red-500/20 w-max">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                      {product.quantity}
                    </div>
                  )}
                </div>
              </td>
              <td className="p-2 md:p-4 whitespace-nowrap text-white font-medium">{formatCurrency(product.price)}</td>
              <td className="p-2 md:p-4">
                {getInventoryFieldValue(product, colorField || DEFAULT_INVENTORY_CONFIG.fields[0]) ? (
                  <span
                    title={getInventoryFieldValue(product, colorField || DEFAULT_INVENTORY_CONFIG.fields[0])}
                    className="inline-flex items-center gap-2"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full border border-white/20 flex-shrink-0"
                      style={{
                        backgroundColor: isValidHexColor(
                          getInventoryFieldValue(product, colorField || DEFAULT_INVENTORY_CONFIG.fields[0]),
                        )
                          ? getInventoryFieldValue(product, colorField || DEFAULT_INVENTORY_CONFIG.fields[0])
                          : '#808080',
                      }}
                    ></span>
                    <span className="truncate max-w-[50px] md:max-w-[60px] hidden lg:inline text-neutral-300">
                      {getInventoryFieldValue(product, colorField || DEFAULT_INVENTORY_CONFIG.fields[0])}
                    </span>
                  </span>
                ) : (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td
                className="p-2 md:p-4 max-w-[55px] md:max-w-[65px] truncate hidden xl:table-cell text-neutral-300"
                title={getInventoryFieldValue(product, dimensionsField || DEFAULT_INVENTORY_CONFIG.fields[1])}
              >
                {getInventoryFieldValue(product, dimensionsField || DEFAULT_INVENTORY_CONFIG.fields[1]) || (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td
                className="p-2 md:p-4 max-w-[55px] md:max-w-[65px] truncate hidden xl:table-cell text-neutral-300"
                title={getInventoryFieldValue(product, capacityField || DEFAULT_INVENTORY_CONFIG.fields[2])}
              >
                {getInventoryFieldValue(product, capacityField || DEFAULT_INVENTORY_CONFIG.fields[2]) || (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td
                className="p-2 md:p-4 max-w-[55px] md:max-w-[65px] truncate hidden xl:table-cell text-neutral-300"
                title={getInventoryFieldValue(product, materialField || DEFAULT_INVENTORY_CONFIG.fields[3])}
              >
                {getInventoryFieldValue(product, materialField || DEFAULT_INVENTORY_CONFIG.fields[3]) || (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td className="p-2 md:p-4 whitespace-nowrap hidden xl:table-cell text-neutral-300">
                {formatCurrency(product.cost)}
              </td>
              {canEdit && (
                <td className="p-2 md:p-4 whitespace-nowrap">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenModal(product);
                    }}
                    className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded transition-all active:scale-90"
                    aria-label={t('common.editItem', { item: product.name })}
                    data-testid={`edit-product-${product.id}`}
                  >
                    <PencilLine className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(product.id);
                    }}
                    className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-all active:scale-90 ml-1"
                    aria-label={t('common.deleteItem', { item: product.name })}
                    data-testid={`delete-product-${product.id}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              )}
            </>
          )}
        />
      </div>

      <div className="sm:hidden flex flex-col gap-2.5">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              data-testid={`product-card-${product.id}`}
              className="w-full bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-xl active:scale-[0.98] transition-transform overflow-hidden cursor-pointer"
              onClick={() => handleOpenModal(product)}
            >
              <div className="flex items-start gap-3 p-2.5">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-11 w-11 rounded-lg object-cover" />
                ) : (
                  <div className="h-11 w-11 rounded-lg bg-[#F5F5DC]/10 flex items-center justify-center text-xl shrink-0">
                    <Package2 className="h-5 w-5 text-[#F5F5DC]/45" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-[#F5F5DC] leading-tight line-clamp-2" title={product.name}>
                    {product.name}
                  </h3>
                  {getVariantSummary(product) && (
                    <p className="text-[10px] text-[#F5F5DC]/45 mt-1 line-clamp-1" title={getVariantSummary(product)}>
                      {getVariantSummary(product)}
                    </p>
                  )}
                  {getCustomFieldSummary(product) && (
                    <p
                      className="text-[10px] text-[#F5F5DC]/55 mt-1 line-clamp-2"
                      title={getCustomFieldSummary(product)}
                    >
                      {getCustomFieldSummary(product)}
                    </p>
                  )}
                  {product.sku ? (
                    <p className="text-[10px] text-[#F5F5DC]/40 mt-0.5 font-mono">{product.sku}</p>
                  ) : (
                    <p className="text-[10px] text-[#F5F5DC]/20 mt-0.5 italic">{t('common.notAvailable')}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-0.5 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(product);
                      }}
                      className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all active:scale-90 text-sm"
                      aria-label={t('common.editItem', { item: product.name })}
                      data-testid={`edit-product-${product.id}`}
                    >
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(product.id);
                      }}
                      className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-all active:scale-90 text-sm"
                      aria-label={t('common.deleteItem', { item: product.name })}
                      data-testid={`delete-product-${product.id}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <div className="px-2.5 pb-1">
                <div className="flex flex-wrap gap-1">
                  {inventoryFieldDefinitions.map((field) => {
                    const value = getInventoryFieldValue(product, field);
                    if (!value) return null;
                    return (
                      <span
                        key={`${product.id}-${field.key}`}
                        className="inline-flex items-center gap-1 bg-[#F5F5DC]/8 px-1.5 py-0.5 rounded-full text-[10px] text-[#F5F5DC]/80"
                      >
                        {field.type === 'color' ? (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0"
                            style={{ backgroundColor: isValidHexColor(value) ? value : '#808080' }}
                          />
                        ) : field.type === 'measure' ? (
                          <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : field.key === 'capacity' ? (
                          <Box className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : field.key === 'material' ? (
                          <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : null}
                        <span>{value}</span>
                      </span>
                    );
                  })}
                  {(product.variantAttributes?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 bg-[#4ADE80]/10 px-1.5 py-0.5 rounded-full text-[10px] text-[#4ADE80]">
                      {product.variants?.length || 0} variantes
                    </span>
                  )}
                </div>
              </div>

              <div className="flex border-t border-[#F5F5DC]/8">
                <div className="flex-1 flex items-center justify-center gap-1 py-2 px-1.5 border-r border-[#F5F5DC]/8">
                  <span className="text-[9px] uppercase tracking-wider text-[#F5F5DC]/50">{t('common.stock')}</span>
                  <span
                    className={`text-xs font-bold ${product.quantity > 0 && product.quantity <= lowStockThreshold ? 'text-yellow-400' : 'text-[#F5F5DC]'}`}
                  >
                    {product.quantity}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center gap-1 py-2 px-1.5 border-r border-[#F5F5DC]/8">
                  <span className="text-[9px] uppercase tracking-wider text-[#F5F5DC]/50">{t('common.price')}</span>
                  <span className="text-xs font-bold text-[#F5F5DC]">{formatCurrency(product.price)}</span>
                </div>
                <div className="flex-1 flex items-center justify-center gap-1 py-2 px-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#F5F5DC]/50">{t('common.cost')}</span>
                  <span className="text-xs font-bold text-[#F5F5DC]/70">{formatCurrency(product.cost)}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            className="text-center py-10 text-[#F5F5DC]/70 bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-xl"
            data-testid="empty-inventory-message"
          >
            {t('inventory.empty')}
          </div>
        )}
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={editingProduct ? t('inventory.editProduct') : t('inventory.addProduct')}
          size="wide"
        >
          <ProductForm product={editingProduct} onSave={handleSaveProduct} onCancel={handleCloseModal} />
        </Modal>
      )}

      {isProcessingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-6 rounded-lg max-w-sm w-full shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 border-4 border-[#F5F5DC]/20 border-t-yellow-500 rounded-full animate-spin"></div>
            <h3 className="font-bold text-[#F5F5DC] text-lg">{t('inventory.batchProcessing')}</h3>
            <p className="text-sm text-[#F5F5DC]/70">{t('inventory.batchCompiling')}</p>
            <span className="font-mono text-yellow-400 font-bold bg-[#121212] px-3 py-1.5 rounded border border-[#F5F5DC]/10">
              {batchProgress}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

interface ProductFormProps {
  product: Product | null;
  onSave: (productData: Omit<Product, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ product, onSave, onCancel }) => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();
  const inventoryConfig = useMemo(
    () => normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG),
    [state.inventoryConfig],
  );
  const initialUseVariants = Boolean(product?.variantAttributes?.length);
  const initialLabels = getInitialVariantAttributes(product, initialUseVariants, inventoryConfig.variantAttributes);
  const defaultLabels = initialLabels.length > 0 ? initialLabels : inventoryConfig.variantAttributes;

  const [name, setName] = useState(product?.name || '');
  const [sku, setSku] = useState(product?.sku || '');
  const [color, setColor] = useState(product?.color || '');
  const [dimensions, setDimensions] = useState(product?.dimensions || '');
  const [capacity, setCapacity] = useState(product?.capacity || '');
  const [material, setMaterial] = useState(product?.material || '');
  const [extraFieldValues, setExtraFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(product?.customFields || {}).map(([key, value]) => [key, String(value || '')])),
  );
  const [supplierId, setSupplierId] = useState(product?.supplierId || '');
  const [quantity, setQuantity] = useState<string | number>(product?.quantity ?? '');
  const [price, setPrice] = useState<string | number>(product?.price ?? '');
  const [cost, setCost] = useState<string | number>(product?.cost ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl || null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [useVariants, setUseVariants] = useState(initialUseVariants);
  const [variantAttributes, setVariantAttributes] = useState<string[]>(defaultLabels);
  const [variantRows, setVariantRows] = useState<VariantDraft[]>(() => getInitialVariantRows(product, defaultLabels));

  // Multi-color/measure for new products (no toggle mode)
  const [selectedColors, setSelectedColors] = useState<string[]>(() => {
    if (product?.colors?.length) return product.colors;
    if (product?.color) return [product.color];
    return [];
  });
  const [selectedSizes, setSelectedSizes] = useState<string[]>(() => {
    if (product?.sizes?.length) return product.sizes;
    if (product?.dimensions) return [product.dimensions];
    return [];
  });
  const [comboValues, setComboValues] = useState<Record<string, { quantity: number; price: number; cost: number }>>({});

  // Update comboValues when selections change
  useEffect(() => {
    if (!isEditing && isMultiMode) {
      const combos = getComboEntries(selectedColors, selectedSizes);
      setComboValues((prev) => {
        const updated: Record<string, { quantity: number; price: number; cost: number }> = {};
        for (const key of combos) {
          updated[key] = prev[key] || { quantity: 0, price: Number(price) || 0, cost: Number(cost) || 0 };
        }
        return updated;
      });
    }
  }, [selectedColors.length, selectedSizes.length]);

  const isMultiMode = selectedColors.length > 1 || selectedSizes.length > 1;
  const isEditing = product !== null;

  const getComboEntries = (colors: string[], sizes: string[]): string[] => {
    if (colors.length > 0 && sizes.length > 0) {
      return colors.flatMap((c) => sizes.map((s) => `${c}|${s}`));
    }
    return colors.map((c) => `color:${c}`).concat(sizes.map((s) => `size:${s}`));
  };
  const productHistory = useMemo(() => {
    if (!product) return [];
    return (state.productChangeHistory || [])
      .filter((entry) => entry.productId === product.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, inventoryConfig.productHistoryLimit);
  }, [inventoryConfig.productHistoryLimit, product, state.productChangeHistory]);

  const handleScanSuccess = (decodedText: string) => {
    setSku(decodedText);
    setIsScannerOpen(false);
  };

  const handleScannerClose = () => setIsScannerOpen(false);
  const getFieldValue = (fieldKey: string) => {
    if (fieldKey === 'color') return color;
    if (fieldKey === 'dimensions') return dimensions;
    if (fieldKey === 'capacity') return capacity;
    if (fieldKey === 'material') return material;
    return extraFieldValues[fieldKey] || '';
  };

  const setFieldValue = (fieldKey: string, value: string) => {
    if (fieldKey === 'color') setColor(value);
    else if (fieldKey === 'dimensions') setDimensions(value);
    else if (fieldKey === 'capacity') setCapacity(value);
    else if (fieldKey === 'material') setMaterial(value);
    else setExtraFieldValues((current) => ({ ...current, [fieldKey]: value }));
  };

  const handleOpenImagePreview = (url: string | null) => {
    if (url) {
      setImagePreviewUrl((current) => (current === url ? null : url));
    }
  };
  const handleCloseImagePreview = () => setImagePreviewUrl(null);

  useEffect(() => {
    if (!useVariants) return;
    if (variantAttributes.length > 0) return;
    setVariantAttributes(inventoryConfig.variantAttributes);
    setVariantRows(getInitialVariantRows(product, inventoryConfig.variantAttributes));
  }, [product, useVariants, variantAttributes.length, inventoryConfig.variantAttributes]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedBase64 = await compressImage(file, 800, 800, 0.8);
      setImageUrl(optimizedBase64);
    } catch (error) {
      console.error('Error optimizando imagen:', error);
      alert(t('validation.imageSizeError') || 'Error al procesar la imagen');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.includes('image')) {
        const file = items[i].getAsFile();
        if (file) {
          compressImage(file, 800, 800, 0.8)
            .then((optimizedBase64) => setImageUrl(optimizedBase64))
            .catch((error) => {
              console.error('Error optimizando imagen pegada:', error);
              alert(t('validation.imageSizeError') || 'Error al procesar la imagen');
            });
        }
        break;
      }
    }
  };

  const normalizeLabels = (labels: string[]) =>
    Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));

  const remapRows = (nextLabels: string[]) =>
    variantRows.map((row) =>
      createVariantDraft(nextLabels, {
        ...row,
        attributes: nextLabels.reduce<Record<string, string>>((acc, label) => {
          acc[label] = row.attributes?.[label] || '';
          return acc;
        }, {}),
      }),
    );

  const addVariantAttribute = () => {
    const nextLabels = [...variantAttributes, `Atributo ${variantAttributes.length + 1}`];
    setVariantAttributes(nextLabels);
    setVariantRows(remapRows(nextLabels));
  };

  const renameVariantAttribute = (index: number, value: string) => {
    const previousLabel = variantAttributes[index];
    const nextLabels = normalizeLabels(variantAttributes.map((label, i) => (i === index ? value : label)));
    setVariantAttributes(nextLabels);
    setVariantRows(
      variantRows.map((row) =>
        createVariantDraft(nextLabels, {
          ...row,
          attributes: nextLabels.reduce<Record<string, string>>((acc, label) => {
            acc[label] = label === value.trim() ? row.attributes?.[previousLabel] || '' : row.attributes?.[label] || '';
            return acc;
          }, {}),
        }),
      ),
    );
  };

  const removeVariantAttribute = (index: number) => {
    const nextLabels = variantAttributes.filter((_, i) => i !== index);
    setVariantAttributes(nextLabels);
    setVariantRows(remapRows(nextLabels));
  };

  const addVariantRow = () => {
    setVariantRows((rows) => [...rows, createVariantDraft(variantAttributes)]);
  };

  const updateVariantRow = (
    index: number,
    field: keyof Omit<VariantDraft, 'id' | 'attributes'>,
    value: string | number,
  ) => {
    const nextRows = [...variantRows];
    const row = { ...nextRows[index] };
    if (field === 'sku') row.sku = String(value);
    if (field === 'quantity' || field === 'price' || field === 'cost') row[field] = String(value);
    if (field === 'imageUrl') row.imageUrl = String(value) || undefined;
    nextRows[index] = row;
    setVariantRows(nextRows);
  };

  const updateVariantAttributeValue = (rowIndex: number, label: string, value: string) => {
    const nextRows = [...variantRows];
    nextRows[rowIndex] = {
      ...nextRows[rowIndex],
      attributes: {
        ...nextRows[rowIndex].attributes,
        [label]: value,
      },
    };
    setVariantRows(nextRows);
  };

  const removeVariantRow = (index: number) => {
    setVariantRows(variantRows.filter((_, i) => i !== index));
  };

  const buildConfiguredFieldPayload = () => {
    const basePayload: Partial<Product> = {
      color: undefined,
      dimensions: undefined,
      capacity: undefined,
      material: undefined,
    };
    const customFields: Record<string, string> = {};

    for (const field of inventoryConfig.fields) {
      const value = getFieldValue(field.key).trim();

      if (field.key === 'color') {
        basePayload.color = value || undefined;
      } else if (field.key === 'dimensions') {
        basePayload.dimensions = value || undefined;
      } else if (field.key === 'capacity') {
        basePayload.capacity = value || undefined;
      } else if (field.key === 'material') {
        basePayload.material = value || undefined;
      } else {
        if (value) customFields[field.key] = value;
      }
    }

    return {
      ...basePayload,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    };
  };

  const aggregateQuantity = useMemo(
    () => variantRows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
    [variantRows],
  );

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!name.trim()) {
      newErrors.name = t('validation.nameRequired');
    }

    if (isEditing && useVariants) {
      if (variantRows.length === 0) newErrors.variants = 'Agrega al menos una variante.';
      const labels = normalizeLabels(variantAttributes);
      if (labels.length === 0) newErrors.variants = 'Define al menos un atributo de variante.';
      const variantKeys = new Set<string>();
      variantRows.forEach((row, index) => {
        const variantKey = labels
          .map((label) =>
            String(row.attributes?.[label] || '')
              .trim()
              .toLowerCase(),
          )
          .join('|');
        if (variantKey && variantKeys.has(variantKey)) {
          newErrors.variants = 'Hay variantes repetidas con la misma combinacion de atributos.';
        }
        if (variantKey) variantKeys.add(variantKey);
        if (Number(row.quantity) < 0 || !Number.isInteger(Number(row.quantity))) {
          newErrors[`variant_${index}_quantity`] = t('validation.quantityNonNegative');
        }
        if (Number(row.price) < 0) {
          newErrors[`variant_${index}_price`] = t('validation.priceNonNegative');
        }
        if (Number(row.cost) < 0) {
          newErrors[`variant_${index}_cost`] = t('validation.costNonNegative');
        }
      });
    } else if (!isEditing && isMultiMode) {
      const keys = getComboEntries(selectedColors, selectedSizes);
      if (keys.length === 0) {
        newErrors.variants = 'Selecciona al menos un color o medida.';
      }
      for (const key of keys) {
        const val = comboValues[key];
        if (!val || Number(val.quantity) <= 0) {
          newErrors[`combo_${key}`] = 'Debe tener cantidad mayor a 0.';
        }
        if (val && Number(val.price) < 0) {
          newErrors[`combo_price_${key}`] = 'Precio no puede ser negativo.';
        }
      }
    } else {
      if (quantity === '' || Number(quantity) < 0 || !Number.isInteger(Number(quantity))) {
        newErrors.quantity = t('validation.quantityNonNegative');
      }
      if (price === '' || Number(price) < 0) {
        newErrors.price = t('validation.priceNonNegative');
      }
      if (cost === '' || Number(cost) < 0) {
        newErrors.cost = t('validation.costNonNegative');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const configuredFields = buildConfiguredFieldPayload();

    if (useVariants) {
      const labels = normalizeLabels(variantAttributes);
      const variants = variantRows.map((row) =>
        createVariantDraft(labels, {
          ...row,
          attributes: labels.reduce<Record<string, string>>((acc, label) => {
            acc[label] = row.attributes?.[label] || '';
            return acc;
          }, {}),
        }),
      );
      const primaryVariant = variants[0];

      onSave({
        name,
        sku: sku || primaryVariant?.sku || undefined,
        ...configuredFields,
        supplierId: supplierId || undefined,
        quantity: aggregateQuantity,
        price: Number(primaryVariant?.price ?? price ?? 0),
        cost: Number(primaryVariant?.cost ?? cost ?? 0),
        imageUrl: imageUrl ?? primaryVariant?.imageUrl ?? undefined,
        variantAttributes: labels,
        variants: variants.map((variant) => ({
          ...variant,
          quantity: Number(variant.quantity),
          price: Number(variant.price),
          cost: Number(variant.cost),
        })) as any,
      });
      return;
    }

    // Multi-mode: new product with multiple colors/measures
    if (!isEditing && isMultiMode) {
      const keys = getComboEntries(selectedColors, selectedSizes);
      const variants = keys.map((key) => {
        const parts = key.split('|');
        const attributes: Record<string, string> = {};
        if (selectedColors.length > 0 && selectedSizes.length > 0) {
          attributes.Color = parts[0];
          attributes.Medida = parts[1];
        } else if (selectedColors.length > 0) {
          attributes.Color = key.replace('color:', '');
        } else {
          attributes.Medida = key.replace('size:', '');
        }
        const val = comboValues[key] || { quantity: 0, price: 0, cost: 0 };
        return {
          id: '',
          sku: `${sku || name.toLowerCase().replace(/\s+/g, '-')}-${key.toLowerCase().replace(/[|:]/g, '-').replace(/\s+/g, '-')}`,
          quantity: Number(val.quantity) || 0,
          price: Number(val.price) || Number(price) || 0,
          cost: Number(val.cost) || Number(cost) || 0,
          imageUrl: imageUrl || undefined,
          attributes,
        } as VariantDraft;
      });
      const totalQty = variants.reduce((sum, v) => sum + Number(v.quantity), 0);
      const attrLabels = selectedColors.length > 0 && selectedSizes.length > 0
        ? ['Color', 'Medida']
        : selectedColors.length > 0 ? ['Color'] : ['Medida'];

      onSave({
        name,
        sku,
        colors: selectedColors,
        sizes: selectedSizes,
        supplierId: supplierId || undefined,
        quantity: totalQty,
        price: Number(price) || 0,
        cost: Number(cost) || 0,
        imageUrl: imageUrl ?? undefined,
        variantAttributes: attrLabels,
        variants: variants.map((v) => ({
          ...v,
          quantity: Number(v.quantity),
          price: Number(v.price),
          cost: Number(v.cost),
        })) as any,
      });
      return;
    }

    onSave({
      name,
      sku,
      ...configuredFields,
      supplierId: supplierId || undefined,
      quantity: Number(quantity),
      price: Number(price),
      cost: Number(cost),
      imageUrl: imageUrl ?? undefined,
      variantAttributes: undefined,
      variants: undefined,
    });
  };

  const restoreProductVersion = (historyId: string) => {
    if (!product) return;
    dispatch({ type: 'RESTORE_PRODUCT_VERSION', payload: { productId: product.id, historyId } });
    onCancel();
  };

  return (
    <>
      {isScannerOpen && <BarcodeScanner onScan={handleScanSuccess} onClose={handleScannerClose} />}
      <form onSubmit={handleSubmit} onPaste={handlePaste} data-testid="product-form" className="min-w-0">
        <div className="space-y-4 min-w-0">
          <div className="relative flex flex-col sm:flex-row items-center gap-4 overflow-visible">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#121212] border border-[#F5F5DC]/30 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden">
              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => handleOpenImagePreview(imageUrl)}
                  className="w-full h-full appearance-none border-0 bg-transparent p-0"
                  aria-label={t('common.product')}
                >
                  <img src={imageUrl} alt={t('common.product')} className="w-full h-full object-cover rounded-md" />
                </button>
              ) : (
                <Package2 className="h-8 w-8 text-[#F5F5DC]/50" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                id="productImage"
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
                onChange={handleImageChange}
                data-testid="product-image-input"
              />
              <label
                htmlFor="productImage"
                className="cursor-pointer bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-all text-sm text-center active:scale-95"
              >
                {imageUrl ? t('inventory.form.changeImage') : t('inventory.form.uploadImage')}
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="text-red-400/80 hover:text-red-400 text-sm font-semibold transition-transform active:scale-95"
                >
                  {t('inventory.form.removeImage')}
                </button>
              )}
            </div>
            {imagePreviewUrl && (
              <div className="absolute left-0 top-full z-20 mt-3 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#0f0f0f] p-3 shadow-2xl sm:left-full sm:top-0 sm:ml-3 sm:mt-0">
                <button
                  type="button"
                  onClick={handleCloseImagePreview}
                  className="mb-2 ml-auto block rounded-full bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleCloseImagePreview}
                  className="block w-full appearance-none border-0 bg-transparent p-0"
                  aria-label={t('common.product')}
                >
                  <img
                    src={imagePreviewUrl}
                    alt={t('common.product')}
                    className="max-h-64 w-full rounded-xl object-contain"
                  />
                </button>
              </div>
            )}
          </div>

          <div>
            <input
              data-testid="product-name-input"
              type="text"
              placeholder={t('inventory.form.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full p-2 bg-[#121212] border rounded-md ${errors.name ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="flex items-center gap-2">
            <input
              data-testid="product-sku-input"
              type="text"
              placeholder={t('inventory.form.skuPlaceholder')}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="flex-grow p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
            />
            <button
              data-testid="open-scanner-button"
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="p-2.5 bg-transparent border border-[#F5F5DC]/50 rounded-md hover:bg-[#F5F5DC]/10 transition-colors flex-shrink-0 active:scale-95"
              aria-label={t('scanner.title')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
            </button>
          </div>

          <div>
            <label className="block text-xs text-[#F5F5DC]/60 mb-1.5">{t('common.supplier')}</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F5F5DC] text-sm text-[#F5F5DC]"
              data-testid="product-supplier-input"
            >
              <option value="">{t('common.notAvailable')}</option>
              {state.suppliers
                .filter((supplier) => supplier.isActive !== false)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>
          </div>

          {useVariants && (
            <div className="rounded-xl border border-[#F5F5DC]/15 bg-[#0f0f0f] p-4 space-y-4 min-w-0">
              {inventoryConfig.fields.map((field) => {
                const fieldValue = getFieldValue(field.key);
                const isColorField = field.type === 'color';
                const isMeasureField = field.type === 'measure';
                const testId = LEGACY_FIELD_KEYS.has(field.key)
                  ? `product-${field.key}-input`
                  : `product-custom-${field.key}-input`;

                return (
                  <div key={field.id} className="space-y-2">
                    <label className="block text-xs text-[#F5F5DC]/60">{field.label}</label>
                    {isColorField && (
                      <div className="flex flex-wrap gap-2">
                        {PRESET_COLORS.map((preset) => (
                          <button
                            key={`${field.key}-${preset.name}`}
                            type="button"
                            onClick={() => setFieldValue(field.key, fieldValue === preset.name ? '' : preset.name)}
                            className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 ${
                              fieldValue === preset.name
                                ? 'border-white scale-110 ring-2 ring-white/30'
                                : 'border-[#F5F5DC]/20 hover:scale-105'
                            }`}
                            style={{ backgroundColor: preset.hex }}
                            title={preset.name}
                            aria-label={preset.name}
                          />
                        ))}
                      </div>
                    )}
                    {isMeasureField && (
                      <div className="flex flex-wrap gap-1.5">
                        {inventoryConfig.measureOptions.map((suggestion) => {
                          const selected = fieldValue.toUpperCase() === suggestion;
                          return (
                            <button
                              key={`${field.key}-${suggestion}`}
                              type="button"
                              onClick={() => setFieldValue(field.key, selected ? '' : suggestion)}
                              className={`rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-95 ${
                                selected
                                  ? 'border-[#EAB308]/60 bg-[#EAB308]/15 text-[#EAB308]'
                                  : 'border-[#F5F5DC]/20 bg-white/5 text-[#F5F5DC]/75 hover:bg-white/10'
                              }`}
                            >
                              {suggestion}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <input
                      data-testid={testId}
                      type="text"
                      placeholder={field.label}
                      value={fieldValue}
                      onChange={(e) => setFieldValue(field.key, e.target.value)}
                      className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-[#F5F5DC]/15 bg-[#0f0f0f] p-4 space-y-4 min-w-0">
            {isEditing && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-1">
                {[
                  { enabled: false, label: 'Articulo simple', icon: Box },
                  { enabled: true, label: 'Con variantes', icon: Layers3 },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const selected = useVariants === mode.enabled;
                  return (
                    <button
                      key={mode.label}
                      type="button"
                      onClick={() => {
                        setUseVariants(mode.enabled);
                        if (mode.enabled && variantAttributes.length === 0) {
                          const labels = getInitialVariantAttributes(product, true, inventoryConfig.variantAttributes);
                          setVariantAttributes(labels);
                          setVariantRows(getInitialVariantRows(product, labels));
                        }
                      }}
                      className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                        selected
                          ? 'bg-[#F5F5DC] text-[#121212]'
                          : 'bg-transparent text-[#F5F5DC]/70 hover:bg-white/5 hover:text-[#F5F5DC]'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="truncate">{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {!isEditing && !isMultiMode && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 rounded-lg bg-[#121212] border border-[#F5F5DC]/10 p-3">
                  <label className="block text-xs text-[#F5F5DC]/60">Colores</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((preset) => {
                      const selected = selectedColors.includes(preset.name);
                      return (
                        <button
                          key={`mc-${preset.name}`}
                          type="button"
                          onClick={() => {
                            setSelectedColors(prev =>
                              selected ? prev.filter(c => c !== preset.name) : [...prev, preset.name]
                            );
                          }}
                          className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 ${
                            selected
                              ? 'border-white scale-110 ring-2 ring-white/30'
                              : 'border-[#F5F5DC]/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: preset.hex }}
                          title={preset.name}
                          aria-label={preset.name}
                        />
                      );
                    })}
                  </div>
                  {selectedColors.length > 0 && (
                    <div className="text-xs text-[#F5F5DC]/60">
                      Seleccionados: {selectedColors.join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 rounded-lg bg-[#121212] border border-[#F5F5DC]/10 p-3">
                  <label className="block text-xs text-[#F5F5DC]/60">Medidas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {inventoryConfig.measureOptions.map((suggestion) => {
                      const selected = selectedSizes.includes(suggestion);
                      return (
                        <button
                          key={`ms-${suggestion}`}
                          type="button"
                          onClick={() => {
                            setSelectedSizes(prev =>
                              selected ? prev.filter(s => s !== suggestion) : [...prev, suggestion]
                            );
                          }}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-95 ${
                            selected
                              ? 'border-[#EAB308]/60 bg-[#EAB308]/15 text-[#EAB308]'
                              : 'border-[#F5F5DC]/20 bg-white/5 text-[#F5F5DC]/75 hover:bg-white/10'
                          }`}
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                  {selectedSizes.length > 0 && (
                    <div className="text-xs text-[#F5F5DC]/60">
                      Seleccionados: {selectedSizes.join(', ')}
                    </div>
                  )}
                </div>
                <div className="text-xs text-[#F5F5DC]/50 text-center">
                  Selecciona varios colores o medidas para crear combinaciones autom&aacute;ticas
                </div>
              </div>
            )}

            {isEditing && useVariants ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold text-[#F5F5DC]">Atributos de variante</h3>
                    <button
                      type="button"
                      onClick={addVariantAttribute}
                      className="w-full text-xs bg-[#F5F5DC]/10 px-3 py-2 rounded hover:bg-[#F5F5DC]/20 transition sm:w-auto"
                    >
                      Agregar más
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {variantAttributes.map((label, index) => (
                      <div key={`${label}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0">
                        <input
                          type="text"
                          value={label}
                          onChange={(e) => renameVariantAttribute(index, e.target.value)}
                          className="w-full min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                          placeholder={`Atributo ${index + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeVariantAttribute(index)}
                          className="min-h-[42px] px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-lg bg-[#121212] border border-[#F5F5DC]/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[#F5F5DC]/70">Cantidad total</div>
                    <div className="font-bold text-[#F5F5DC]">{aggregateQuantity}</div>
                  </div>
                  <div className="text-left text-xs text-[#F5F5DC]/55 sm:text-right">
                    La cantidad final se calcula como la suma de las variantes.
                  </div>
                </div>

                <div className="space-y-3">
                  {variantRows.map((row, rowIndex) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-[#F5F5DC]/15 bg-[#121212] p-3 space-y-3 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F5F5DC]/45">
                          Variante {rowIndex + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVariantRow(rowIndex)}
                          className="text-xs text-red-300 hover:text-red-200 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20"
                        >
                          Quitar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        {variantAttributes.map((label) => (
                          <div key={`${row.id}-${label}`} className="min-w-0">
                            <label className="block text-[11px] text-[#F5F5DC]/55 mb-1">{label}</label>
                            {isColorAttribute(label) && (
                              <div className="flex flex-wrap gap-1.5 mb-2 max-w-full">
                                {PRESET_COLORS.map((preset) => {
                                  const selected = row.attributes?.[label] === preset.name;
                                  return (
                                    <button
                                      key={`${row.id}-${label}-${preset.name}`}
                                      type="button"
                                      onClick={() =>
                                        updateVariantAttributeValue(rowIndex, label, selected ? '' : preset.name)
                                      }
                                      className={`w-7 h-7 rounded-full border-2 transition-all active:scale-90 ${
                                        selected
                                          ? 'border-white scale-110 ring-2 ring-white/30'
                                          : 'border-[#F5F5DC]/20 hover:scale-105'
                                      }`}
                                      style={{ backgroundColor: preset.hex }}
                                      title={preset.name}
                                      aria-label={preset.name}
                                    />
                                  );
                                })}
                              </div>
                            )}
                            {isMeasureAttribute(label) && (
                              <div className="flex flex-wrap gap-1.5 mb-2 max-w-full">
                                {inventoryConfig.measureOptions.map((suggestion) => {
                                  const selected = (row.attributes?.[label] || '').toUpperCase() === suggestion;
                                  return (
                                    <button
                                      key={`${row.id}-${label}-${suggestion}`}
                                      type="button"
                                      onClick={() =>
                                        updateVariantAttributeValue(rowIndex, label, selected ? '' : suggestion)
                                      }
                                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-95 ${
                                        selected
                                          ? 'border-[#EAB308]/60 bg-[#EAB308]/15 text-[#EAB308]'
                                          : 'border-[#F5F5DC]/20 bg-white/5 text-[#F5F5DC]/75 hover:bg-white/10'
                                      }`}
                                    >
                                      {suggestion}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            <input
                              type="text"
                              value={row.attributes?.[label] || ''}
                              onChange={(e) => updateVariantAttributeValue(rowIndex, label, e.target.value)}
                              className="w-full min-w-0 p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/15 rounded-md text-sm"
                              placeholder={`Valor de ${label.toLowerCase()}`}
                            />
                          </div>
                        ))}
                        <div className="min-w-0">
                          <label className="block text-[11px] text-[#F5F5DC]/55 mb-1">SKU variante</label>
                          <input
                            type="text"
                            value={row.sku}
                            onChange={(e) => updateVariantRow(rowIndex, 'sku', e.target.value)}
                            className="w-full min-w-0 p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/15 rounded-md text-sm"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="block text-[11px] text-[#F5F5DC]/55 mb-1">Cantidad</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.quantity}
                            onChange={(e) => updateVariantRow(rowIndex, 'quantity', e.target.value)}
                            onFocus={(e) => {
                              if (e.currentTarget.value === '0') e.currentTarget.select();
                            }}
                            className={`w-full min-w-0 p-2.5 bg-[#1e1e1e] border rounded-md text-sm ${
                              errors[`variant_${rowIndex}_quantity`] ? 'border-red-400/70' : 'border-[#F5F5DC]/15'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="block text-[11px] text-[#F5F5DC]/55 mb-1">Precio</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.price}
                            onChange={(e) => updateVariantRow(rowIndex, 'price', e.target.value)}
                            onFocus={(e) => {
                              if (e.currentTarget.value === '0') e.currentTarget.select();
                            }}
                            className={`w-full min-w-0 p-2.5 bg-[#1e1e1e] border rounded-md text-sm ${
                              errors[`variant_${rowIndex}_price`] ? 'border-red-400/70' : 'border-[#F5F5DC]/15'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="block text-[11px] text-[#F5F5DC]/55 mb-1">Costo</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.cost}
                            onChange={(e) => updateVariantRow(rowIndex, 'cost', e.target.value)}
                            onFocus={(e) => {
                              if (e.currentTarget.value === '0') e.currentTarget.select();
                            }}
                            className={`w-full min-w-0 p-2.5 bg-[#1e1e1e] border rounded-md text-sm ${
                              errors[`variant_${rowIndex}_cost`] ? 'border-red-400/70' : 'border-[#F5F5DC]/15'
                            }`}
                          />
                        </div>
                      </div>

                      {Object.values(row.attributes || {}).some(Boolean) && (
                        <div className="text-xs text-[#F5F5DC]/45">
                          {Object.entries(row.attributes)
                            .filter(([, value]) => value)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(' | ')}
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addVariantRow}
                    className="w-full bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2.5 px-4 rounded-lg hover:bg-yellow-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                  >
                    + Agregar variante
                  </button>
                  {errors.variants && <p className="text-red-400 text-xs">{errors.variants}</p>}
                </div>
              </div>
            ) : isEditing || !isMultiMode ? (
              <>
                {inventoryConfig.fields.map((field) => {
                  const fieldValue = getFieldValue(field.key);
                  const isColorField = field.type === 'color';
                  const isMeasureField = field.type === 'measure';
                  const testId = LEGACY_FIELD_KEYS.has(field.key)
                    ? `product-${field.key}-input`
                    : `product-custom-${field.key}-input`;

                  return (
                    <div key={field.id} className="space-y-2">
                      <label className="block text-xs text-[#F5F5DC]/60">{field.label}</label>
                      {isColorField && (
                        <div className="flex flex-wrap gap-2">
                          {PRESET_COLORS.map((preset) => (
                            <button
                              key={`${field.key}-${preset.name}`}
                              type="button"
                              onClick={() => setFieldValue(field.key, fieldValue === preset.name ? '' : preset.name)}
                              className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 ${
                                fieldValue === preset.name
                                  ? 'border-white scale-110 ring-2 ring-white/30'
                                  : 'border-[#F5F5DC]/20 hover:scale-105'
                              }`}
                              style={{ backgroundColor: preset.hex }}
                              title={preset.name}
                              aria-label={preset.name}
                            />
                          ))}
                        </div>
                      )}
                      {isMeasureField && (
                        <div className="flex flex-wrap gap-1.5">
                          {inventoryConfig.measureOptions.map((suggestion) => {
                            const selected = fieldValue.toUpperCase() === suggestion;
                            return (
                              <button
                                key={`${field.key}-${suggestion}`}
                                type="button"
                                onClick={() => setFieldValue(field.key, selected ? '' : suggestion)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-95 ${
                                  selected
                                    ? 'border-[#EAB308]/60 bg-[#EAB308]/15 text-[#EAB308]'
                                    : 'border-[#F5F5DC]/20 bg-white/5 text-[#F5F5DC]/75 hover:bg-white/10'
                                }`}
                              >
                                {suggestion}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <input
                        data-testid={testId}
                        type="text"
                        placeholder={field.label}
                        value={fieldValue}
                        onChange={(e) => setFieldValue(field.key, e.target.value)}
                        className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm"
                      />
                    </div>
                  );
                })}
                <div>
                  <input
                    data-testid="product-quantity-input"
                    type="number"
                    placeholder={t('common.quantity')}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onFocus={(e) => {
                      if (e.currentTarget.value === '0') e.currentTarget.select();
                    }}
                    min="0"
                    step="1"
                    className={`w-full p-2 bg-[#121212] border rounded-md ${errors.quantity ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
                  />
                  {errors.quantity && <p className="text-red-400 text-xs mt-1">{errors.quantity}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <input
                      data-testid="product-price-input"
                      type="number"
                      placeholder={t('common.price')}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      onFocus={(e) => {
                        if (e.currentTarget.value === '0') e.currentTarget.select();
                      }}
                      min="0"
                      step="0.01"
                      className={`w-full p-2 bg-[#121212] border rounded-md ${errors.price ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
                    />
                    {errors.price && <p className="text-red-400 text-xs mt-1">{errors.price}</p>}
                  </div>
                  <div>
                    <input
                      data-testid="product-cost-input"
                      type="number"
                      placeholder={t('common.cost')}
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      onFocus={(e) => {
                        if (e.currentTarget.value === '0') e.currentTarget.select();
                      }}
                      min="0"
                      step="0.01"
                      className={`w-full p-2 bg-[#121212] border rounded-md ${errors.cost ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
                    />
                    {errors.cost && <p className="text-red-400 text-xs mt-1">{errors.cost}</p>}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2 rounded-lg bg-[#121212] border border-[#F5F5DC]/10 p-3">
                  <label className="block text-xs text-[#F5F5DC]/60">Colores seleccionados</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedColors.map((c) => {
                      const preset = PRESET_COLORS.find(p => p.name === c);
                      return (
                        <button
                          key={`selc-${c}`}
                          type="button"
                          onClick={() => setSelectedColors(prev => prev.filter(x => x !== c))}
                          className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 border-white ring-2 ring-white/30`}
                          style={{ backgroundColor: preset?.hex || '#888' }}
                          title={`Quitar ${c}`}
                        />
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setSelectedColors([])}
                      className="text-xs text-red-300 hover:text-red-200 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                {selectedSizes.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg bg-[#121212] border border-[#F5F5DC]/10 p-3">
                    <label className="block text-xs text-[#F5F5DC]/60">Medidas seleccionadas</label>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSizes.map((s) => (
                        <button
                          key={`sels-${s}`}
                          type="button"
                          onClick={() => setSelectedSizes(prev => prev.filter(x => x !== s))}
                          className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/15 text-[#EAB308] px-2.5 py-1 text-[11px]"
                        >
                          {s}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedSizes([])}
                        className="text-xs text-red-300 hover:text-red-200 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#F5F5DC]">
                      {selectedColors.length > 0 && selectedSizes.length > 0
                        ? `Combinaciones (${selectedColors.length} x ${selectedSizes.length})`
                        : `Variantes (${selectedColors.length || selectedSizes.length})`}
                    </h3>
                  </div>

                  {(selectedColors.length > 0 || selectedSizes.length > 0) && (
                    <div className="space-y-2">
                      {(() => {
                        const keys = getComboEntries(selectedColors, selectedSizes);

                        return keys.map((key, i) => {
                          const parts = key.split('|');
                          const label = parts.length > 1 ? parts.join(' / ') : parts[0].replace(/^(color:|size:)/, '');
                          const val = comboValues[key] || { quantity: 0, price: Number(price) || 0, cost: Number(cost) || 0 };

                          return (
                            <div
                              key={`combo-${i}`}
                              className="rounded-lg border border-[#F5F5DC]/15 bg-[#121212] p-3 space-y-2"
                            >
                              <div className="text-xs font-semibold text-[#F5F5DC]/60 uppercase tracking-wide">
                                {label}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[10px] text-[#F5F5DC]/50 mb-0.5">Cant</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={val.quantity}
                                    onChange={(e) => {
                                      setComboValues((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key] || val, quantity: Number(e.target.value) },
                                      }));
                                    }}
                                    className="w-full p-1.5 bg-[#1e1e1e] border border-[#F5F5DC]/15 rounded text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#F5F5DC]/50 mb-0.5">Precio</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={val.price}
                                    onChange={(e) => {
                                      setComboValues((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key] || val, price: Number(e.target.value) },
                                      }));
                                    }}
                                    className="w-full p-1.5 bg-[#1e1e1e] border border-[#F5F5DC]/15 rounded text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#F5F5DC]/50 mb-0.5">Costo</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={val.cost}
                                    onChange={(e) => {
                                      setComboValues((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key] || val, cost: Number(e.target.value) },
                                      }));
                                    }}
                                    className="w-full p-1.5 bg-[#1e1e1e] border border-[#F5F5DC]/15 rounded text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-[#F5F5DC]/50">
                  <Ruler className="h-3 w-3" />
                  <span>
                    {selectedColors.length > 0 && selectedSizes.length > 0
                      ? `${selectedColors.length} color(es) x ${selectedSizes.length} medida(s) = ${selectedColors.length * selectedSizes.length} combinaciones`
                      : `${selectedColors.length || selectedSizes.length} variante(s)`}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {productHistory.length > 0 && (
          <div className="mt-5 rounded-xl border border-[#F5F5DC]/15 bg-[#0f0f0f] p-4 min-w-0">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#F5F5DC]">
              <History className="h-4 w-4 text-[#F5F5DC]/70" aria-hidden="true" />
              Historial de cambios
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {productHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#F5F5DC]">{entry.snapshot.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#F5F5DC]/55">
                      <span>{new Date(entry.updatedAt).toLocaleString()}</span>
                      <span>Cant. {entry.snapshot.quantity}</span>
                      <span>Precio {entry.snapshot.price}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreProductVersion(entry.id)}
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md border border-[#F5F5DC]/20 px-3 py-2 text-xs font-semibold text-[#F5F5DC] hover:bg-white/5 sm:w-auto"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
          <button
            data-testid="cancel-product-button"
            type="button"
            onClick={onCancel}
            className="bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95"
          >
            {t('common.cancel')}
          </button>
          <button
            data-testid="save-product-button"
            type="submit"
            className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95"
          >
            {t('common.save')}
          </button>
        </div>
      </form>
    </>
  );
};

export default Inventory;
