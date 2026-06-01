import type React from 'react';
import { useMemo, useState } from 'react';
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
    return sortedProducts.filter(
      (p) => p.name.toLowerCase().includes(filter.toLowerCase()) || p.sku?.toLowerCase().includes(filter.toLowerCase()),
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
    const headers = ['id', 'name', 'sku', 'quantity', 'price', 'cost', 'imageUrl'];
    const rows = activeProducts.map((p) =>
      [p.id, p.name, p.sku || '', p.quantity, p.price, p.cost, p.imageUrl || ''].join(','),
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

      {/* Desktop table */}
      <div className="hidden md:block bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-[#F5F5DC]/10">
              <tr>
                <th className="p-4">{t('common.image')}</th>
                <SortableHeader sortKey="name" labelKey="common.product" />
                <SortableHeader sortKey="sku" labelKey="common.sku" />
                <SortableHeader sortKey="quantity" labelKey="common.quantity" />
                <SortableHeader sortKey="price" labelKey="common.price" />
                <SortableHeader sortKey="cost" labelKey="common.cost" />
                <th className="p-4">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    data-testid={`product-row-${product.id}`}
                    className="border-t border-[#F5F5DC]/20 hover:bg-foreground/5 transition-colors duration-200"
                  >
                    <td className="p-2">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded-md object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-[#F5F5DC]/10 flex items-center justify-center text-xl">
                          📦
                        </div>
                      )}
                    </td>
                    <td className="p-4 max-w-[120px] md:max-w-none truncate" title={product.name}>{product.name}</td>
                    <td className="p-4">{product.sku || t('common.notAvailable')}</td>
                    <td className="p-4">
                      {product.quantity}
                      {product.quantity > 0 && product.quantity <= lowStockThreshold && (
                        <span className="text-yellow-400 ml-2" title={t('inventory.lowStock')}>
                          ⚠️
                        </span>
                      )}
                    </td>
                    <td className="p-4">{formatCurrency(product.price)}</td>
                    <td className="p-4">{formatCurrency(product.cost)}</td>
                    <td className="p-4">
                      <button
                        onClick={() => handleOpenModal(product)}
                        className="mr-2 text-yellow-400 transition-transform active:scale-95"
                        aria-label={t('common.editItem', { item: product.name })}
                        data-testid={`edit-product-${product.id}`}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="text-red-400 transition-transform active:scale-95"
                        aria-label={t('common.deleteItem', { item: product.name })}
                        data-testid={`delete-product-${product.id}`}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-[#F5F5DC]/70" data-testid="empty-inventory-message">
                    {t('inventory.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden grid grid-cols-1 gap-3">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              data-testid={`product-card-${product.id}`}
              className="bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-3 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-md object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-md bg-[#F5F5DC]/10 flex items-center justify-center text-2xl">
                      📦
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-[#F5F5DC] truncate" title={product.name}>{product.name}</h3>
                  {product.sku && (
                    <p className="text-xs text-[#F5F5DC]/50 mt-0.5">{t('common.sku')}: {product.sku}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="text-[#F5F5DC]/80">
                      {t('common.quantity')}: <strong>{product.quantity}</strong>
                      {product.quantity > 0 && product.quantity <= lowStockThreshold && (
                        <span className="text-yellow-400 ml-1" title={t('inventory.lowStock')}>⚠️</span>
                      )}
                    </span>
                    <span className="text-[#F5F5DC]/80">
                      {t('common.price')}: <strong>{formatCurrency(product.price)}</strong>
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-3 pt-2 border-t border-[#F5F5DC]/10">
                <button
                  onClick={() => handleOpenModal(product)}
                  className="flex-1 bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2.5 px-3 rounded-lg hover:bg-yellow-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                  data-testid={`edit-product-${product.id}`}
                >
                  ✏️ {t('common.edit')}
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
                  className="flex-1 bg-transparent border border-red-500/50 text-red-400 font-bold py-2.5 px-3 rounded-lg hover:bg-red-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                  data-testid={`delete-product-${product.id}`}
                >
                  🗑️ {t('common.delete')}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center p-8 text-[#F5F5DC]/70 bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg" data-testid="empty-inventory-message">
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
