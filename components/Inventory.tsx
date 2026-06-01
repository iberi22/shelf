import type React from 'react';
import { useMemo, useState } from 'react';

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
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import useLocalStorage from '../hooks/useLocalStorage';
import { useSortableTable } from '../hooks/useSortableTable';
import type { Product } from '../types';
import BarcodeScanner from './BarcodeScanner';
import Modal from './Modal';

const Inventory: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { t } = useI18n();
  const { formatCurrency } = useCurrency();
  const [lowStockThreshold] = useLocalStorage('lowStockThreshold', 5);

  // Only show active products in inventory view
  const activeProducts = useMemo(() => state.products.filter((p) => p.isActive !== false), [state.products]);

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
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.color?.toLowerCase().includes(q) ||
        p.dimensions?.toLowerCase().includes(q) ||
        p.capacity?.toLowerCase().includes(q) ||
        p.material?.toLowerCase().includes(q),
    );
  }, [sortedProducts, filter]);

  const handleOpenModal = (product: Product | null = null) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingProduct(null);
    setIsModalOpen(false);
  };

  const handleSaveProduct = (productData: Omit<Product, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => {
    const timestamp = new Date().toISOString();
    if (editingProduct) {
      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          ...editingProduct,
          ...productData,
          updatedAt: timestamp,
          updatedBy: 'me', // Fallback for now
        } as Product,
      });
    } else {
      const newProduct = {
        id: timestamp,
        ...productData,
        isActive: true,
        updatedAt: timestamp,
        updatedBy: 'me', // Fallback for now
      } as Product;
      dispatch({ type: 'ADD_PRODUCT', payload: newProduct });
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t('inventory.deleteConfirm'))) {
      dispatch({ type: 'DELETE_PRODUCT', payload: id });
    }
  };

  const handleExportCSV = () => {
    const headers = ['id', 'name', 'sku', 'color', 'dimensions', 'capacity', 'material', 'quantity', 'price', 'cost', 'imageUrl'];
    const rows = activeProducts.map((p) =>
      [p.id, p.name, p.sku || '', p.color || '', p.dimensions || '', p.capacity || '', p.material || '', p.quantity, p.price, p.cost, p.imageUrl || ''].join(','),
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

  const SortableHeader: React.FC<{ sortKey: keyof Product; labelKey: string }> = ({ sortKey, labelKey }) => (
    <th className="p-4">
      <button
        data-testid={`sort-by-${sortKey}`}
        onClick={() => requestSort(sortKey)}
        className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
        aria-label={`${t('common.sortBy')} ${t(labelKey)}`}
      >
        {t(labelKey)}
        <span className="text-yellow-400 text-xs">{getSortIndicator(sortKey)}</span>
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC]">{t('inventory.title')}</h2>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder={t('inventory.searchPlaceholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full p-2 pl-8 bg-[#121212] border border-[#F5F5DC]/30 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F5F5DC] text-sm"
              data-testid="inventory-search-input"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#F5F5DC]/50">🔍</span>
          </div>
          <div className="flex gap-2 sm:gap-4">
            <button
              onClick={handleExportCSV}
              className="flex-1 sm:flex-none bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-3 sm:px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-all duration-200 active:scale-95 text-sm"
              data-testid="export-csv-button"
            >
              {t('common.exportCsv')}
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex-1 sm:flex-none bg-[#F5F5DC] text-[#121212] font-bold py-2 px-3 sm:px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 text-sm"
              data-testid="add-product-button"
            >
              {t('inventory.addProduct')}
            </button>
          </div>
        </div>
      </div>

      {/* Tablet+ table: muestra esencial + expandible */}
      <div className="hidden md:block bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F5F5DC]/10">
              <tr className="text-sm">
                <th className="p-3">{t('common.image')}</th>
                <SortableHeader sortKey="name" labelKey="common.product" />
                <SortableHeader sortKey="sku" labelKey="common.sku" />
                <SortableHeader sortKey="quantity" labelKey="common.quantity" />
                <SortableHeader sortKey="price" labelKey="common.price" />
                <SortableHeader sortKey="color" labelKey="common.color" />
                {/*  hidden below lg */}
                <SortableHeader sortKey="dimensions" labelKey="common.dimensions" />
                <SortableHeader sortKey="capacity" labelKey="common.capacity" />
                <SortableHeader sortKey="material" labelKey="common.material" />
                <SortableHeader sortKey="cost" labelKey="common.cost" />
                <th className="p-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    data-testid={`product-row-${product.id}`}
                    className="border-t border-[#F5F5DC]/20 hover:bg-foreground/5 transition-colors duration-200 text-sm"
                  >
                    <td className="p-2">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-[#F5F5DC]/10 flex items-center justify-center text-lg">
                          📦
                        </div>
                      )}
                    </td>
                    <td className="p-3 max-w-[100px] lg:max-w-[150px] xl:max-w-none truncate" title={product.name}>
                      {product.name}
                    </td>
                    <td className="p-3 max-w-[70px] truncate" title={product.sku || ''}>{product.sku || <span className="text-[#F5F5DC]/40">—</span>}</td>
                    <td className="p-3 whitespace-nowrap">
                      {product.quantity}
                      {product.quantity > 0 && product.quantity <= lowStockThreshold && (
                        <span className="text-yellow-400 ml-1" title={t('inventory.lowStock')}>⚠️</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatCurrency(product.price)}</td>
                    <td className="p-3">
                      {product.color ? (
                        <span title={product.color} className="inline-flex items-center gap-1">
                          <span className="inline-block w-3 h-3 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: isValidHexColor(product.color) ? product.color : '#808080' }}></span>
                          <span className="truncate max-w-[60px] hidden lg:inline">{product.color}</span>
                        </span>
                      ) : (
                        <span className="text-[#F5F5DC]/40">—</span>
                      )}
                    </td>
                    <td className="p-3 max-w-[65px] truncate hidden lg:table-cell" title={product.dimensions || ''}>{product.dimensions || <span className="text-[#F5F5DC]/40">—</span>}</td>
                    <td className="p-3 max-w-[65px] truncate hidden lg:table-cell" title={product.capacity || ''}>{product.capacity || <span className="text-[#F5F5DC]/40">—</span>}</td>
                    <td className="p-3 max-w-[65px] truncate hidden lg:table-cell" title={product.material || ''}>{product.material || <span className="text-[#F5F5DC]/40">—</span>}</td>
                    <td className="p-3 whitespace-nowrap hidden lg:table-cell">{formatCurrency(product.cost)}</td>
                    <td className="p-3 whitespace-nowrap">
                      <button
                        onClick={() => handleOpenModal(product)}
                        className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded transition-all active:scale-90"
                        aria-label={t('common.editItem', { item: product.name })}
                        data-testid={`edit-product-${product.id}`}
                      >✏️</button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-all active:scale-90 ml-1"
                        aria-label={t('common.deleteItem', { item: product.name })}
                        data-testid={`delete-product-${product.id}`}
                      >🗑️</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="text-center p-8 text-[#F5F5DC]/70" data-testid="empty-inventory-message">
                    {t('inventory.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-2.5">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              data-testid={`product-card-${product.id}`}
              className="bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-xl active:scale-[0.98] transition-transform overflow-hidden"
            >
              {/* Header: image + name + edit/delete */}
              <div className="flex items-start gap-2.5 p-2.5 pb-1">
                <div className="flex-shrink-0">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="h-11 w-11 rounded-lg object-cover" />
                  ) : (
                    <div className="h-11 w-11 rounded-lg bg-[#F5F5DC]/10 flex items-center justify-center text-lg">📦</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-[#F5F5DC] leading-tight line-clamp-2" title={product.name}>
                    {product.name}
                  </h3>
                  {product.sku ? (
                    <p className="text-[10px] text-[#F5F5DC]/40 mt-0.5 font-mono">{product.sku}</p>
                  ) : (
                    <p className="text-[10px] text-[#F5F5DC]/20 mt-0.5 italic">{t('common.notAvailable')}</p>
                  )}
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleOpenModal(product)}
                    className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all active:scale-90 text-sm"
                    aria-label={t('common.editItem', { item: product.name })}
                    data-testid={`edit-product-${product.id}`}
                  >✏️</button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-all active:scale-90 text-sm"
                    aria-label={t('common.deleteItem', { item: product.name })}
                    data-testid={`delete-product-${product.id}`}
                  >🗑️</button>
                </div>
              </div>

              {/* Detail badges */}
              <div className="px-2.5 pb-1">
                <div className="flex flex-wrap gap-1">
                  {product.color && (
                    <span className="inline-flex items-center gap-1 bg-[#F5F5DC]/8 px-1.5 py-0.5 rounded-full text-[10px] text-[#F5F5DC]/80">
                      <span className="inline-block w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: isValidHexColor(product.color) ? product.color : '#808080' }}></span>
                      {product.color}
                    </span>
                  )}
                  {product.dimensions && (
                    <span className="inline-flex items-center gap-1 bg-[#F5F5DC]/8 px-1.5 py-0.5 rounded-full text-[10px] text-[#F5F5DC]/80">📏 {product.dimensions}</span>
                  )}
                  {product.capacity && (
                    <span className="inline-flex items-center gap-1 bg-[#F5F5DC]/8 px-1.5 py-0.5 rounded-full text-[10px] text-[#F5F5DC]/80">📐 {product.capacity}</span>
                  )}
                  {product.material && (
                    <span className="inline-flex items-center gap-1 bg-[#F5F5DC]/8 px-1.5 py-0.5 rounded-full text-[10px] text-[#F5F5DC]/80">🧱 {product.material}</span>
                  )}
                </div>
              </div>

              {/* Bottom stats bar */}
              <div className="flex border-t border-[#F5F5DC]/8">
                <div className="flex-1 flex items-center justify-center gap-1 py-2 px-1.5 border-r border-[#F5F5DC]/8">
                  <span className="text-[9px] uppercase tracking-wider text-[#F5F5DC]/50">{t('common.stock')}</span>
                  <span className={`text-xs font-bold ${product.quantity > 0 && product.quantity <= lowStockThreshold ? 'text-yellow-400' : 'text-[#F5F5DC]'}`}>
                    {product.quantity}
                  </span>
                  {product.quantity > 0 && product.quantity <= lowStockThreshold && (
                    <span className="text-yellow-400 text-[8px]">⚠️</span>
                  )}
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
        >
          <ProductForm product={editingProduct} onSave={handleSaveProduct} onCancel={handleCloseModal} />
        </Modal>
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
  const { t } = useI18n();
  const [name, setName] = useState(product?.name || '');
  const [sku, setSku] = useState(product?.sku || '');
  const [color, setColor] = useState(product?.color || '');
  const [dimensions, setDimensions] = useState(product?.dimensions || '');
  const [capacity, setCapacity] = useState(product?.capacity || '');
  const [material, setMaterial] = useState(product?.material || '');
  const [quantity, setQuantity] = useState<string | number>(product?.quantity ?? '');
  const [price, setPrice] = useState<string | number>(product?.price ?? '');
  const [cost, setCost] = useState<string | number>(product?.cost ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl || null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const handleScanSuccess = (decodedText: string) => {
    setSku(decodedText);
    setIsScannerOpen(false);
  };

  const handleScannerClose = () => {
    setIsScannerOpen(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      // 2MB limit
      alert(t('validation.imageSizeError'));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!name.trim()) {
      newErrors.name = t('validation.nameRequired');
    }
    if (quantity === '' || Number(quantity) < 0 || !Number.isInteger(Number(quantity))) {
      newErrors.quantity = t('validation.quantityNonNegative');
    }
    if (price === '' || Number(price) < 0) {
      newErrors.price = t('validation.priceNonNegative');
    }
    if (cost === '' || Number(cost) < 0) {
      newErrors.cost = t('validation.costNonNegative');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave({
        name,
        sku,
        color: color || undefined,
        dimensions: dimensions || undefined,
        capacity: capacity || undefined,
        material: material || undefined,
        quantity: Number(quantity),
        price: Number(price),
        cost: Number(cost),
        imageUrl: imageUrl ?? undefined,
      });
    }
  };

  return (
    <>
      {isScannerOpen && <BarcodeScanner onScan={handleScanSuccess} onClose={handleScannerClose} />}
      <form onSubmit={handleSubmit} data-testid="product-form">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#121212] border border-[#F5F5DC]/30 rounded-md flex items-center justify-center flex-shrink-0">
              {imageUrl ? (
                <img src={imageUrl} alt={t('common.product')} className="w-full h-full object-cover rounded-md" />
              ) : (
                <span className="text-3xl text-[#F5F5DC]/50">📦</span>
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
          <div>
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
          </div>
          <div>
            <label className="block text-xs text-[#F5F5DC]/60 mb-1.5">{t('common.color')}</label>
            <div className="flex items-center justify-center">
              <div className="flex flex-wrap items-center justify-center">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setColor(color === c.name ? '' : c.name)}
                    className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 ${
                      color === c.name ? 'border-white scale-110 ring-2 ring-white/30' : 'border-[#F5F5DC]/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </div>
            <input
              data-testid="product-color-input"
              type="text"
              placeholder={t('inventory.form.colorPlaceholder')}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full mt-2 p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm"
            />
          </div>
          <div>
            <input
              data-testid="product-dimensions-input"
              type="text"
              placeholder={t('inventory.form.dimensionsPlaceholder')}
              value={dimensions}
              onChange={(e) => setDimensions(e.target.value)}
              className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <input
                data-testid="product-capacity-input"
                type="text"
                placeholder={t('inventory.form.capacityPlaceholder')}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
              />
            </div>
            <div>
              <input
                data-testid="product-material-input"
                type="text"
                placeholder={t('inventory.form.materialPlaceholder')}
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
              />
            </div>
          </div>
          <div>
            <input
              data-testid="product-quantity-input"
              type="number"
              placeholder={t('common.quantity')}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
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
                min="0"
                step="0.01"
                className={`w-full p-2 bg-[#121212] border rounded-md ${errors.cost ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
              />
              {errors.cost && <p className="text-red-400 text-xs mt-1">{errors.cost}</p>}
            </div>
          </div>
        </div>
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
