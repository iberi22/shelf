import { Box, Images, Layers3, Package2, PencilLine, Ruler, Trash2 } from 'lucide-react';
import type { InventoryConfig, Product } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSortableTable } from '../../hooks/useSortableTable';
import { getInventoryFieldValue } from '../../lib/inventoryConfig';
import { extractCategories, selectVisibleProducts } from '../../lib/inventoryView';
import { summarizeVariantValues } from '../../lib/productVariants';
import FilterBar, { type InventoryFacetFilters, readFacetFiltersFromUrl } from '../FilterBar';
import { InfiniteTable } from '../InfiniteTable';

const isValidHexColor = (color: string): boolean => /^#[0-9a-f]{6}$/i.test(color);
const MOBILE_PAGE_SIZE = 50;

export interface InventoryViewProps {
  products: Product[];
  config: InventoryConfig;
  readOnly?: boolean;
  labels?: string[];
  formatMoney: (amount: number, currencyCode?: string) => string;
  t: (key: string, options?: any) => string;
  lowStockThreshold: number;
  suppliers: { id: string; name: string }[];
  onExportCSV?: () => void;
  onBatchImageUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessingBatch?: boolean;
  // mutations
  onCreate?: () => void;
  onEdit?: (product: Product) => void;
  onAdjust?: () => void;
  onImport?: () => void;
  onScan?: () => void;
  onDelete?: (id: string) => void;
}

const LEGACY_FIELD_KEYS = new Set(['color', 'dimensions', 'capacity', 'material']);

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  config,
  readOnly,
  formatMoney,
  t,
  lowStockThreshold,
  suppliers,
  onExportCSV,
  onBatchImageUpload,
  isProcessingBatch,
  onCreate,
  onEdit,
  onDelete,
}) => {
  const inventoryFieldDefinitions = config.fields;
  const colorField = inventoryFieldDefinitions.find((field) => field.key === 'color');
  const dimensionsField = inventoryFieldDefinitions.find((field) => field.key === 'dimensions');
  const capacityField = inventoryFieldDefinitions.find((field) => field.key === 'capacity');
  const materialField = inventoryFieldDefinitions.find((field) => field.key === 'material');
  const categoryField = inventoryFieldDefinitions.find(
    (field) =>
      field.key.toLowerCase() === 'category' ||
      field.label.trim().toLowerCase() === 'category' ||
      field.label.trim().toLowerCase() === 'categoría',
  );

  const canCreate = !readOnly && !!onCreate;
  const canEdit = !readOnly && !!onEdit;
  const canDelete = !readOnly && !!onDelete;

  const {
    items: sortedProducts,
    requestSort,
    getSortIndicator,
  } = useSortableTable<Product>(products, { key: 'name', direction: 'asc' });

  const [filter, setFilter] = useState('');
  const [facetFilters, setFacetFilters] = useState<InventoryFacetFilters>(() => readFacetFiltersFromUrl());

  const categories = useMemo(() => extractCategories(products, categoryField), [products, categoryField]);

  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);
  const mobileSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileVisibleCount(MOBILE_PAGE_SIZE);
  }, []);

  const handleSort: typeof requestSort = (key) => {
    setMobileVisibleCount(MOBILE_PAGE_SIZE);
    requestSort(key);
  };

  const filteredProducts = useMemo(
    () =>
      selectVisibleProducts(
        sortedProducts,
        filter,
        facetFilters,
        inventoryFieldDefinitions,
        categoryField,
        lowStockThreshold,
      ),
    [sortedProducts, filter, facetFilters, inventoryFieldDefinitions, categoryField, lowStockThreshold],
  );

  const mobileHasMore = mobileVisibleCount < filteredProducts.length;

  useEffect(() => {
    if (!mobileHasMore) return;
    const sentinel = mobileSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMobileVisibleCount((current) => current + MOBILE_PAGE_SIZE);
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mobileHasMore]);

  const getVariantSummary = (product: Product) => {
    const variants = product.variants || [];
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
    if (product) {
      if (onEdit) onEdit(product);
    } else {
      if (onCreate) onCreate();
    }
  };

  const handleExportCSV = () => {
    if (onExportCSV) onExportCSV();
  };

  const handleBatchImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onBatchImageUpload) onBatchImageUpload(e);
  };

  const handleDelete = (id: string) => {
    if (canDelete && onDelete) {
      onDelete(id);
    }
  };

  const SortableHeader: React.FC<{ sortKey: keyof Product; label: string }> = ({ sortKey, label }) => (
    <th className="p-2 md:p-3">
      <button
        data-testid={`sort-by-${sortKey}`}
        onClick={() => handleSort(sortKey)}
        className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
        aria-label={`${t('common.sortBy')} ${label}`}
      >
        {label}
        <span className="text-yellow-400 text-xs">{getSortIndicator(sortKey)}</span>
      </button>
    </th>
  );
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
              className="w-full p-2.5 pl-9 bg-panel border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-green text-sm text-white"
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
            {canCreate && (
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
                  className="flex-1 sm:flex-none bg-accent-green text-primary font-bold py-2.5 px-6 rounded-lg hover:bg-accent-green transition-all duration-200 active:scale-95 text-sm disabled:opacity-50 shadow-[0_0_15px_rgba(74,222,128,0.2)]"
                  data-testid="add-product-button"
                >
                  {t('inventory.addProduct')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <FilterBar
        filters={facetFilters}
        onChange={setFacetFilters}
        categories={categories}
        suppliers={suppliers}
        lowStockThreshold={lowStockThreshold}
      />

      <div className="hidden sm:block" data-testid="inventory-table">
        <InfiniteTable
          data={filteredProducts}
          height="calc(100vh - 200px)"
          emptyContent={<div className="text-center p-8 text-foreground/70">{t('inventory.empty')}</div>}
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
                  onClick={() => handleSort('dimensions')}
                  className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
                  aria-label={`${t('common.sortBy')} ${dimensionsField?.label || t('common.dimensions')}`}
                >
                  {dimensionsField?.label || t('common.dimensions')}
                  <span className="text-yellow-400 text-xs">{getSortIndicator('dimensions')}</span>
                </button>
              </th>
              <th className="hidden xl:table-cell p-4">
                <button
                  onClick={() => handleSort('capacity')}
                  className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
                  aria-label={`${t('common.sortBy')} ${capacityField?.label || t('common.capacity')}`}
                >
                  {capacityField?.label || t('common.capacity')}
                  <span className="text-yellow-400 text-xs">{getSortIndicator('capacity')}</span>
                </button>
              </th>
              <th className="hidden xl:table-cell p-4">
                <button
                  onClick={() => handleSort('material')}
                  className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
                  aria-label={`${t('common.sortBy')} ${materialField?.label || t('common.material')}`}
                >
                  {materialField?.label || t('common.material')}
                  <span className="text-yellow-400 text-xs">{getSortIndicator('material')}</span>
                </button>
              </th>
              <th className="hidden xl:table-cell p-4">
                <button
                  onClick={() => handleSort('cost')}
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
                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-md bg-foreground/10 flex items-center justify-center text-base md:text-lg">
                    <Package2 className="h-5 w-5 text-foreground/45" aria-hidden="true" />
                  </div>
                )}
              </td>
              <td className="p-2 md:p-4 max-w-[90px] md:max-w-[150px] xl:max-w-none text-white">
                <div className="truncate font-semibold" title={product.name}>
                  {product.name}
                </div>
                {getVariantSummary(product) && (
                  <div className="mt-1 text-[10px] text-foreground/45 truncate" title={getVariantSummary(product)}>
                    {getVariantSummary(product)}
                  </div>
                )}
                {getCustomFieldSummary(product) && (
                  <div className="mt-1 text-[10px] text-foreground/55 truncate" title={getCustomFieldSummary(product)}>
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
                    <div className="flex items-center gap-1.5 bg-accent-yellow/10 text-accent-yellow px-2.5 py-1 rounded-full text-xs font-bold border border-accent-yellow/20 glow-text-yellow w-max">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse"></div>
                      {product.quantity}
                    </div>
                  ) : product.quantity > 0 ? (
                    <div className="flex items-center gap-1.5 bg-accent-green/10 text-accent-green px-2.5 py-1 rounded-full text-xs font-bold border border-accent-green/20 glow-text-green w-max">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-green"></div>
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
              <td className="p-2 md:p-4 whitespace-nowrap text-white font-medium">{formatMoney(product.price)}</td>
              <td className="p-2 md:p-4">
                {getInventoryFieldValue(product, colorField || config.fields[0]) ? (
                  <span
                    title={getInventoryFieldValue(product, colorField || config.fields[0])}
                    className="inline-flex items-center gap-2"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full border border-white/20 flex-shrink-0"
                      style={{
                        backgroundColor: isValidHexColor(
                          getInventoryFieldValue(product, colorField || config.fields[0]),
                        )
                          ? getInventoryFieldValue(product, colorField || config.fields[0])
                          : '#808080',
                      }}
                    ></span>
                    <span className="truncate max-w-[50px] md:max-w-[60px] hidden lg:inline text-neutral-300">
                      {getInventoryFieldValue(product, colorField || config.fields[0])}
                    </span>
                  </span>
                ) : (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td
                className="p-2 md:p-4 max-w-[55px] md:max-w-[65px] truncate hidden xl:table-cell text-neutral-300"
                title={getInventoryFieldValue(product, dimensionsField || config.fields[1])}
              >
                {getInventoryFieldValue(product, dimensionsField || config.fields[1]) || (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td
                className="p-2 md:p-4 max-w-[55px] md:max-w-[65px] truncate hidden xl:table-cell text-neutral-300"
                title={getInventoryFieldValue(product, capacityField || config.fields[2])}
              >
                {getInventoryFieldValue(product, capacityField || config.fields[2]) || (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td
                className="p-2 md:p-4 max-w-[55px] md:max-w-[65px] truncate hidden xl:table-cell text-neutral-300"
                title={getInventoryFieldValue(product, materialField || config.fields[3])}
              >
                {getInventoryFieldValue(product, materialField || config.fields[3]) || (
                  <span className="text-neutral-600">-</span>
                )}
              </td>
              <td className="p-2 md:p-4 whitespace-nowrap hidden xl:table-cell text-neutral-300">
                {formatMoney(product.cost)}
              </td>
              {canCreate && (
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

      <div className="sm:hidden flex flex-col gap-2.5" data-testid="product-list">
        {filteredProducts.length > 0 ? (
          filteredProducts.slice(0, mobileVisibleCount).map((product) => (
            <div
              key={product.id}
              data-testid={`product-card-${product.id}`}
              className="w-full bg-surface-alt border border-foreground/20 rounded-xl active:scale-[0.98] transition-transform overflow-hidden cursor-pointer"
              onClick={() => handleOpenModal(product)}
            >
              <div className="flex items-start gap-3 p-2.5">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-11 w-11 rounded-lg object-cover" />
                ) : (
                  <div className="h-11 w-11 rounded-lg bg-foreground/10 flex items-center justify-center text-xl shrink-0">
                    <Package2 className="h-5 w-5 text-foreground/45" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-foreground leading-tight line-clamp-2" title={product.name}>
                    {product.name}
                  </h3>
                  {getVariantSummary(product) && (
                    <p className="text-[10px] text-foreground/45 mt-1 line-clamp-1" title={getVariantSummary(product)}>
                      {getVariantSummary(product)}
                    </p>
                  )}
                  {getCustomFieldSummary(product) && (
                    <p
                      className="text-[10px] text-foreground/55 mt-1 line-clamp-2"
                      title={getCustomFieldSummary(product)}
                    >
                      {getCustomFieldSummary(product)}
                    </p>
                  )}
                  {product.sku ? (
                    <p className="text-[10px] text-foreground/40 mt-0.5 font-mono">{product.sku}</p>
                  ) : (
                    <p className="text-[10px] text-foreground/20 mt-0.5 italic">{t('common.notAvailable')}</p>
                  )}
                </div>
                {canCreate && (
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
                        className="inline-flex items-center gap-1 bg-foreground/8 px-1.5 py-0.5 rounded-full text-[10px] text-foreground/80"
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
                    <span className="inline-flex items-center gap-1 bg-accent-green/10 px-1.5 py-0.5 rounded-full text-[10px] text-accent-green">
                      {product.variants?.length || 0} variantes
                    </span>
                  )}
                </div>
              </div>

              <div className="flex border-t border-foreground/8">
                <div className="flex-1 flex items-center justify-center gap-1 py-2 px-1.5 border-r border-foreground/8">
                  <span className="text-[9px] uppercase tracking-wider text-foreground/50">{t('common.stock')}</span>
                  <span
                    className={`text-xs font-bold ${product.quantity > 0 && product.quantity <= lowStockThreshold ? 'text-yellow-400' : 'text-foreground'}`}
                  >
                    {product.quantity}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center gap-1 py-2 px-1.5 border-r border-foreground/8">
                  <span className="text-[9px] uppercase tracking-wider text-foreground/50">{t('common.price')}</span>
                  <span className="text-xs font-bold text-foreground">{formatMoney(product.price)}</span>
                </div>
                <div className="flex-1 flex items-center justify-center gap-1 py-2 px-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-foreground/50">{t('common.cost')}</span>
                  <span className="text-xs font-bold text-foreground/70">{formatMoney(product.cost)}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            className="text-center py-10 text-foreground/70 bg-surface-alt border border-foreground/20 rounded-xl"
            data-testid="empty-inventory-message"
          >
            {t('inventory.empty')}
          </div>
        )}
        {filteredProducts.length > 0 && (
          <p className="text-center text-[10px] text-foreground/40" data-testid="mobile-list-count">
            {t('inventory.showingCount', {
              shown: Math.min(mobileVisibleCount, filteredProducts.length),
              total: filteredProducts.length,
            })}
          </p>
        )}
        {mobileHasMore && (
          <div ref={mobileSentinelRef} data-testid="mobile-list-sentinel" className="h-1" aria-hidden="true" />
        )}
      </div>
    </div>
  );
};
