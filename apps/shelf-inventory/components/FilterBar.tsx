import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * Multi-facet filters for the Inventory table (SHELF-108 / SRC-FUN-001).
 *
 * Filters compose with AND logic (intersection). Active filters are shown as
 * removable chips above the product data. Filter state is persisted in URL
 * query params so filtered views are shareable and bookmarkable.
 */

export type InventoryStockStatus = 'in-stock' | 'low' | 'out';

export interface InventoryFacetFilters {
  category?: string;
  status?: InventoryStockStatus;
  minPrice?: number;
  maxPrice?: number;
  supplierId?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
}

export interface FilterBarProps {
  filters: InventoryFacetFilters;
  onChange: (next: InventoryFacetFilters) => void;
  categories: string[];
  suppliers: { id: string; name: string }[];
  lowStockThreshold: number;
}

/** Query param keys per facet (kept stable for shareable URLs). */
const FILTER_PARAM_KEYS: Record<keyof InventoryFacetFilters, string> = {
  category: 'category',
  status: 'status',
  minPrice: 'minPrice',
  maxPrice: 'maxPrice',
  supplierId: 'supplier',
  dateFrom: 'from',
  dateTo: 'to',
};

function parseNumberParam(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isStockStatus(value: string | null): value is InventoryStockStatus {
  return value === 'in-stock' || value === 'low' || value === 'out';
}

/** Read facet filters from the current URL query string. */
export function readFacetFiltersFromUrl(): InventoryFacetFilters {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const filters: InventoryFacetFilters = {};
  const category = params.get(FILTER_PARAM_KEYS.category);
  if (category) filters.category = category;
  const status = params.get(FILTER_PARAM_KEYS.status);
  if (isStockStatus(status)) filters.status = status;
  const minPrice = parseNumberParam(params.get(FILTER_PARAM_KEYS.minPrice));
  if (minPrice !== undefined) filters.minPrice = minPrice;
  const maxPrice = parseNumberParam(params.get(FILTER_PARAM_KEYS.maxPrice));
  if (maxPrice !== undefined) filters.maxPrice = maxPrice;
  const supplierId = params.get(FILTER_PARAM_KEYS.supplierId);
  if (supplierId) filters.supplierId = supplierId;
  const dateFrom = params.get(FILTER_PARAM_KEYS.dateFrom);
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = params.get(FILTER_PARAM_KEYS.dateTo);
  if (dateTo) filters.dateTo = dateTo;
  return filters;
}

/** Persist facet filters to the URL query string (history.replaceState, no reload). */
export function writeFacetFiltersToUrl(filters: InventoryFacetFilters): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  (Object.keys(FILTER_PARAM_KEYS) as (keyof InventoryFacetFilters)[]).forEach((key) => {
    const value = filters[key];
    if (value === undefined || value === '') {
      params.delete(FILTER_PARAM_KEYS[key]);
    } else {
      params.set(FILTER_PARAM_KEYS[key], String(value));
    }
  });
  const qs = params.toString();
  const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', nextUrl);
}

const STATUS_OPTIONS: { value: InventoryStockStatus; labelKey: string; fallback: string }[] = [
  { value: 'in-stock', labelKey: 'inventory.filter.statusInStock', fallback: 'In stock' },
  { value: 'low', labelKey: 'inventory.filter.statusLow', fallback: 'Low stock' },
  { value: 'out', labelKey: 'inventory.filter.statusOut', fallback: 'Out of stock' },
];

const FilterBar: React.FC<FilterBarProps> = ({ filters, onChange, categories, suppliers, lowStockThreshold }) => {
  const { t } = useI18n();

  // SHELF-108 #5: persist active filters to the URL for shareable views.
  useEffect(() => {
    writeFacetFiltersToUrl(filters);
  }, [filters]);

  const update = (patch: Partial<InventoryFacetFilters>) => onChange({ ...filters, ...patch });
  const remove = (key: keyof InventoryFacetFilters) => {
    const next = { ...filters };
    delete next[key];
    onChange(next);
  };
  const clearAll = () => onChange({});

  const statusLabel = (status: InventoryStockStatus): string => {
    const opt = STATUS_OPTIONS.find((o) => o.value === status);
    if (!opt) return status;
    return t(opt.labelKey) || opt.fallback;
  };

  const supplierName = (id: string): string => suppliers.find((s) => s.id === id)?.name || id;
  const categoryLabel = (value: string): string => value || t('inventory.filter.categoryAll') || 'All categories';

  const chips: { key: keyof InventoryFacetFilters; label: string }[] = [];
  if (filters.category)
    chips.push({
      key: 'category',
      label: `${t('inventory.filter.category') || 'Category'}: ${categoryLabel(filters.category)}`,
    });
  if (filters.status)
    chips.push({ key: 'status', label: `${t('inventory.filter.status') || 'Status'}: ${statusLabel(filters.status)}` });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const min = filters.minPrice !== undefined ? `${filters.minPrice}` : '0';
    const max = filters.maxPrice !== undefined ? `${filters.maxPrice}` : '∞';
    chips.push({ key: 'minPrice', label: `${t('inventory.filter.price') || 'Price'}: ${min} – ${max}` });
  }
  if (filters.supplierId)
    chips.push({
      key: 'supplierId',
      label: `${t('inventory.filter.supplier') || 'Supplier'}: ${supplierName(filters.supplierId)}`,
    });
  if (filters.dateFrom)
    chips.push({ key: 'dateFrom', label: `${t('inventory.filter.from') || 'From'}: ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: 'dateTo', label: `${t('inventory.filter.to') || 'To'}: ${filters.dateTo}` });

  return (
    <div className="mb-4 space-y-3" data-testid="inventory-filter-bar">
      {/* Active filter chips (removable, above the product data) */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="inventory-filter-chips">
          <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1">
            <SlidersHorizontal size={12} aria-hidden="true" />
            {t('inventory.filter.active') || 'Active filters'}
          </span>
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 text-xs bg-accent-green/10 border border-accent-green/40 text-accent-green rounded-full pl-3 pr-1.5 py-1"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => remove(chip.key)}
                aria-label={`${t('inventory.filter.remove') || 'Remove filter'} ${chip.label}`}
                className="rounded-full p-0.5 hover:bg-accent-green/20 transition-colors"
                data-testid={`inventory-filter-remove-${chip.key}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-neutral-400 hover:text-white underline underline-offset-2 transition-colors"
            data-testid="inventory-filter-clear-all"
          >
            {t('inventory.filter.clearAll') || 'Clear all'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 bg-panel border border-white/10 rounded-lg p-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          <span>{t('inventory.filter.category') || 'Category'}</span>
          <select
            value={filters.category || ''}
            onChange={(e) => update({ category: e.target.value || undefined })}
            className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-green min-w-[140px]"
            data-testid="inventory-filter-category"
          >
            <option value="">{t('inventory.filter.all') || 'All'}</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          <span>{t('inventory.filter.status') || 'Status'}</span>
          <select
            value={filters.status || ''}
            onChange={(e) => {
              const value = e.target.value;
              update({ status: value === '' ? undefined : (value as InventoryStockStatus) });
            }}
            className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-green min-w-[140px]"
            data-testid="inventory-filter-status"
          >
            <option value="">{t('inventory.filter.all') || 'All'}</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey) || opt.fallback}
                {opt.value === 'low' ? ` (≤ ${lowStockThreshold})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          <span>{t('inventory.filter.minPrice') || 'Min price'}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={filters.minPrice ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              update({ minPrice: value === '' ? undefined : Number(value) });
            }}
            className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-green w-[110px]"
            data-testid="inventory-filter-min-price"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          <span>{t('inventory.filter.maxPrice') || 'Max price'}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={filters.maxPrice ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              update({ maxPrice: value === '' ? undefined : Number(value) });
            }}
            className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-green w-[110px]"
            data-testid="inventory-filter-max-price"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          <span>{t('inventory.filter.supplier') || 'Supplier'}</span>
          <select
            value={filters.supplierId || ''}
            onChange={(e) => update({ supplierId: e.target.value || undefined })}
            className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-green min-w-[140px]"
            data-testid="inventory-filter-supplier"
          >
            <option value="">{t('inventory.filter.all') || 'All'}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          <span>{t('inventory.filter.from') || 'From'}</span>
          <input
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e) => update({ dateFrom: e.target.value || undefined })}
            className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-green"
            data-testid="inventory-filter-date-from"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          <span>{t('inventory.filter.to') || 'To'}</span>
          <input
            type="date"
            value={filters.dateTo || ''}
            onChange={(e) => update({ dateTo: e.target.value || undefined })}
            className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-green"
            data-testid="inventory-filter-date-to"
          />
        </label>
      </div>
    </div>
  );
};

export default FilterBar;
