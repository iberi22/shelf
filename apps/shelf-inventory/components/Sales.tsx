import { Image as ImageIcon, ScanBarcode, X } from 'lucide-react';
import type { Product, Sale, SaleItem } from 'p2p-mesh-core';
import type React from 'react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useSortableTable } from '../hooks/useSortableTable';
import { getProductVariantDisplay, getProductVariants, normalizeProduct } from '../lib/productVariants';
import BarcodeScanner from './BarcodeScanner';
import { InfiniteTable } from './InfiniteTable';
import Modal from './Modal';

const Sales: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const canEdit = state.role === 'admin' || state.permissions?.canEditSales !== false;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const { t } = useI18n();
  const { formatCurrency } = useCurrency();

  const activeSales = useMemo(
    () =>
      state.sales.filter((s) => {
        if (s.isActive === false) return false;
        if (!state.activeBranchId) return true;
        return s.branchId === state.activeBranchId;
      }),
    [state.sales, state.activeBranchId],
  );

  const {
    items: sortedSales,
    requestSort,
    getSortIndicator,
  } = useSortableTable<Sale>(activeSales, { key: 'date', direction: 'desc' });

  const generateReceipt = async (sale: Sale) => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.text(t('sales.receipt.title') || 'Sales Receipt', 14, 22);

    doc.setFontSize(10);
    doc.text(`${t('sales.date')}: ${new Date(sale.date).toLocaleDateString()}`, 14, 30);
    doc.text(`${t('sales.id')}: ${sale.id.slice(0, 8)}`, 14, 35);
    if (sale.clientName) {
      doc.text(`${t('common.client')}: ${sale.clientName}`, 14, 40);
    }

    // Table
    const tableColumn = [t('common.product'), t('common.quantity'), t('common.price'), t('sales.total')];
    const tableRows = sale.items.map((item) => [
      item.productName,
      item.quantity,
      formatCurrency(item.price),
      formatCurrency(item.price * item.quantity),
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
    });

    // Total
    const finalY = (doc as any).lastAutoTable.finalY || 50;
    doc.text(`${t('sales.total')}: ${formatCurrency(sale.totalPrice)}`, 14, finalY + 10);

    doc.save(`receipt_${sale.id}.pdf`);
  };

  const shareOnWhatsApp = (sale: Sale) => {
    const text = `
*${t('sales.receipt.title') || 'Sales Receipt'}*
${t('sales.date')}: ${new Date(sale.date).toLocaleDateString()}
${t('sales.total')}: ${formatCurrency(sale.totalPrice)}

${sale.items.map((item) => `- ${item.productName} x${item.quantity}: ${formatCurrency(item.price * item.quantity)}`).join('\n')}
    `.trim();

    const encodedText = encodeURIComponent(text);
    const url = `https://wa.me/?text=${encodedText}`;
    window.open(url, '_blank');
  };

  const handleOpenModal = (sale?: Sale) => {
    if (!canEdit) return;
    setEditingSale(sale || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingSale(null);
    setIsModalOpen(false);
  };

  const handleSaveSale = (saleData: Omit<Sale, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => {
    if (!canEdit) return;
    if (editingSale) {
      dispatch({ type: 'UPDATE_SALE', payload: { ...editingSale, ...saleData } as Sale });
    } else {
      const newSale = {
        id: new Date().toISOString(),
        ...saleData,
        branchId: state.activeBranchId || undefined,
      } as Sale;
      dispatch({ type: 'ADD_SALE', payload: newSale });
    }
    handleCloseModal();
  };

  const handleDeleteSale = (saleId: string) => {
    dispatch({ type: 'DELETE_SALE', payload: saleId });
    setDeletingSaleId(null);
  };

  const SortableHeader: React.FC<{ sortKey: keyof Sale; labelKey: string }> = ({ sortKey, labelKey }) => (
    <th className="p-4">
      <button
        data-testid={`sort-by-${sortKey}`}
        onClick={() => requestSort(sortKey)}
        className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
      >
        {t(labelKey)}
        <span className="text-yellow-400 text-xs">{getSortIndicator(sortKey)}</span>
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 flex-wrap">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC] shrink-0">{t('sales.title')}</h2>
        {canEdit && (
          <button
            onClick={() => handleOpenModal()}
            className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 text-sm"
            data-testid="add-sale-button"
          >
            {t('sales.addSale')}
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <InfiniteTable
          data={sortedSales}
          height="calc(100vh - 200px)"
          emptyContent={<div className="text-center p-8 text-[#F5F5DC]/70">{t('sales.empty')}</div>}
          fixedHeaderContent={() => (
            <tr>
              <SortableHeader sortKey="date" labelKey="sales.date" />
              <th className="p-4">{t('common.products')}</th>
              <SortableHeader sortKey="totalPrice" labelKey="sales.total" />
              <SortableHeader sortKey="profit" labelKey="sales.profit" />
              <th className="p-4">{t('common.client')}</th>
              <th className="p-4">{t('common.actions')}</th>
            </tr>
          )}
          itemContent={(_, sale) => (
            <>
              <td className="p-4">{new Date(sale.date).toLocaleDateString()}</td>
              <td
                className="p-4 max-w-[120px] md:max-w-none truncate"
                title={sale.items.map((item) => `${item.productName} (x${item.quantity})`).join(', ')}
              >
                {sale.items.map((item) => `${item.productName} (x${item.quantity})`).join(', ')}
              </td>
              <td className="p-4">{formatCurrency(sale.totalPrice)}</td>
              <td className="p-4">{formatCurrency(sale.profit)}</td>
              <td className="p-4">{sale.clientName || t('common.notAvailable')}</td>
              <td className="p-4 flex gap-2">
                {canEdit && (
                  <button
                    onClick={() => handleOpenModal(sale)}
                    className="text-yellow-400 hover:text-yellow-300 transition-colors"
                    title={t('common.edit') || 'Edit'}
                  >
                    ✏️
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => setDeletingSaleId(sale.id)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    title={t('common.delete') || 'Delete'}
                  >
                    🗑️
                  </button>
                )}
                <button
                  onClick={() => generateReceipt(sale)}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                  title={t('sales.receipt.generate') || 'Generate Receipt'}
                >
                  📄
                </button>
                <button
                  onClick={() => shareOnWhatsApp(sale)}
                  className="text-green-400 hover:text-green-300 transition-colors"
                  title={t('sales.share.whatsapp') || 'Share on WhatsApp'}
                >
                  📱
                </button>
              </td>
            </>
          )}
        />
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden grid grid-cols-1 gap-3">
        {sortedSales.length > 0 ? (
          sortedSales.map((sale) => (
            <div
              key={sale.id}
              className="w-full bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-3 active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-xs text-[#F5F5DC]/50">{t('sales.date')}</p>
                  <p className="text-sm font-bold">{new Date(sale.date).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400">{formatCurrency(sale.totalPrice)}</p>
                  <p className="text-xs">
                    {t('sales.profit')}: <span className="text-green-400">{formatCurrency(sale.profit)}</span>
                  </p>
                </div>
              </div>
              <div className="text-xs text-[#F5F5DC]/70 mb-2 line-clamp-2">
                {sale.items.map((item) => `${item.productName} (x${item.quantity})`).join(', ')}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#F5F5DC]/50">{sale.clientName || t('common.notAvailable')}</span>
                <div className="flex gap-3">
                  {canEdit && (
                    <button
                      onClick={() => handleOpenModal(sale)}
                      className="bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2 px-3 rounded-lg text-xs hover:bg-yellow-500/10 transition-all active:scale-95 min-h-[44px]"
                      title={t('common.edit') || 'Edit'}
                    >
                      ✏️
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setDeletingSaleId(sale.id)}
                      className="bg-transparent border border-red-500/50 text-red-400 font-bold py-2 px-3 rounded-lg text-xs hover:bg-red-500/10 transition-all active:scale-95 min-h-[44px]"
                      title={t('common.delete') || 'Delete'}
                    >
                      🗑️
                    </button>
                  )}
                  <button
                    onClick={() => generateReceipt(sale)}
                    className="bg-transparent border border-blue-500/50 text-blue-400 font-bold py-2 px-3 rounded-lg text-xs hover:bg-blue-500/10 transition-all active:scale-95 min-h-[44px]"
                    title={t('sales.receipt.generate') || 'Generate Receipt'}
                  >
                    📄 {t('sales.receipt.generate') || 'Receipt'}
                  </button>
                  <button
                    onClick={() => shareOnWhatsApp(sale)}
                    className="bg-transparent border border-green-500/50 text-green-400 font-bold py-2 px-3 rounded-lg text-xs hover:bg-green-500/10 transition-all active:scale-95 min-h-[44px]"
                    title={t('sales.share.whatsapp') || 'Share on WhatsApp'}
                  >
                    📱 WhatsApp
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            className="text-center p-8 text-[#F5F5DC]/70 bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg"
            data-testid="empty-sales-message"
          >
            {t('sales.empty')}
          </div>
        )}
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={editingSale ? t('sales.editSale') || 'Edit Sale' : t('sales.addSale')}
        >
          <SaleForm onSave={handleSaveSale} onCancel={handleCloseModal} editingSale={editingSale} />
        </Modal>
      )}

      {deletingSaleId && (
        <Modal
          isOpen={!!deletingSaleId}
          onClose={() => setDeletingSaleId(null)}
          title={t('sales.deleteConfirmTitle') || 'Delete Sale'}
        >
          <div className="space-y-4">
            <p className="text-[#F5F5DC]/80">
              {t('sales.deleteConfirmMessage') ||
                'Are you sure you want to delete this sale? This will restore product quantities.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingSaleId(null)}
                className="bg-transparent border border-[#F5F5DC]/50 font-bold py-2.5 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95 min-h-[44px]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleDeleteSale(deletingSaleId)}
                className="bg-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-700 transition-colors active:scale-95 min-h-[44px]"
              >
                {t('common.delete') || 'Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

interface SaleFormProps {
  onSave: (saleData: Omit<Sale, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => void;
  onCancel: () => void;
  editingSale?: Sale | null;
}

const SaleForm: React.FC<SaleFormProps> = ({ onSave, onCancel, editingSale }) => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const { formatCurrency } = useCurrency();
  const { showNotification } = useUI();
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [items, setItems] = useState<Omit<SaleItem, 'productName' | 'cost'>[]>(
    () =>
      editingSale?.items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        price: item.price,
        variantLabel: item.variantLabel,
      })) || [],
  );
  const [clientId, setClientId] = useState<string | undefined>(editingSale?.clientId);
  const [errors, setErrors] = useState<{ general?: string; items?: { [key: number]: string } }>({});

  const availableProducts = useMemo(() => {
    return state.products.filter((p) => p.quantity > 0 && p.isActive !== false);
  }, [state.products]);

  const findProductByScanCode = (code: string): Product | null => {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    const match = state.products.find(
      (p) =>
        p.isActive !== false &&
        p.quantity > 0 &&
        ((p.sku || '').trim().toLowerCase() === normalized || p.id.trim().toLowerCase() === normalized),
    );
    return match ? normalizeProduct(match) : null;
  };

  const addScannedProductToCart = (code: string) => {
    const product = findProductByScanCode(code);
    if (!product) {
      const translated = t('sales.scan.notFound');
      const msg =
        !translated || translated === 'sales.scan.notFound'
          ? `Producto no encontrado: ${code}`
          : `${translated}: ${code}`;
      setScanFeedback(msg);
      showNotification(msg, 'error');
      return;
    }

    const variants = getProductVariants(product);
    const selectedVariant = variants[0] || null;
    const price = selectedVariant?.price ?? product.price ?? 0;

    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.productId === product.id &&
          (item.productVariantId || selectedVariant?.id) === (selectedVariant?.id || item.productVariantId),
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        const current = { ...next[existingIndex] };
        current.quantity = (current.quantity || 0) + 1;
        next[existingIndex] = current;
        return next;
      }
      const newItem: Omit<SaleItem, 'productName' | 'cost'> = {
        productId: product.id,
        productVariantId: selectedVariant?.id,
        quantity: 1,
        price,
      };
      if (selectedVariant) {
        (newItem as { variantLabel?: string }).variantLabel = getProductVariantDisplay(product, selectedVariant);
      }
      return [...prev, newItem];
    });

    const translated = t('sales.scan.added');
    const okMsg =
      !translated || translated === 'sales.scan.added' ? `Agregado: ${product.name}` : `${translated}: ${product.name}`;
    setScanFeedback(okMsg);
    showNotification(okMsg, 'success');
  };

  useBarcodeScanner({
    onScan: addScannedProductToCart,
    enabled: !isScannerOpen,
  });

  const getSelectedProduct = (productId: string): Product | null => {
    const product = state.products.find((p) => p.id === productId);
    return product ? normalizeProduct(product) : null;
  };

  const getSelectedVariant = (product: Product | null, variantId?: string) => {
    if (!product) return null;
    const variants = getProductVariants(product);
    if (variants.length === 0) return null;
    if (variantId) {
      return variants.find((variant) => variant.id === variantId) || variants[0];
    }
    return variants[0];
  };

  const openImagePreview = (product: Product | null, variant?: ReturnType<typeof getSelectedVariant>) => {
    const imageUrl = variant?.imageUrl || product?.imageUrl;
    if (!imageUrl) return;

    setPreviewImage({
      url: imageUrl,
      label: variant
        ? `${product?.name || ''} - ${product ? getProductVariantDisplay(product, variant) || variant.label : variant.label}`.trim()
        : product?.name || '',
    });
  };

  const handleItemChange = (index: number, field: 'productId' | 'quantity' | 'price', value: string) => {
    const newItems = [...items];
    const currentItem = { ...newItems[index] };

    if (field === 'productId') {
      const product = getSelectedProduct(value);
      const variants = product ? getProductVariants(product) : [];
      const selectedVariant = variants[0] || null;
      currentItem.productId = value;
      currentItem.productVariantId = selectedVariant?.id;
      currentItem.price = selectedVariant?.price ?? product?.price ?? 0;
      currentItem.quantity = 1;
      if (selectedVariant) {
        (currentItem as any).variantLabel = product ? getProductVariantDisplay(product, selectedVariant) : undefined;
      } else {
        delete (currentItem as any).variantLabel;
      }
    } else if (field === 'quantity') {
      currentItem.quantity = Number(value) || 1;
    } else if (field === 'price') {
      currentItem.price = Number(value) || 0;
    }

    newItems[index] = currentItem;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1, price: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleVariantChange = (index: number, variantId: string) => {
    const newItems = [...items];
    const currentItem = { ...newItems[index] };
    const product = getSelectedProduct(currentItem.productId);
    const variant = getSelectedVariant(product, variantId);

    currentItem.productVariantId = variant?.id;
    currentItem.price = variant?.price ?? product?.price ?? 0;
    if (variant) {
      (currentItem as any).variantLabel = product ? getProductVariantDisplay(product, variant) : undefined;
    }

    newItems[index] = currentItem;
    setItems(newItems);
  };

  const validate = () => {
    const newErrors: { general?: string; items?: { [key: number]: string } } = { items: {} };
    let isValid = true;
    if (items.length === 0) {
      newErrors.general = t('validation.saleItemsRequired');
      return false;
    }

    const isOffline = !state.peers.some(
      (p) => p.id !== state.localPeerId && (p.status === 'connected' || p.status === 'verified'),
    );
    const numPeers = state.peers.length || 1;
    const isMultiTerminalOffline = isOffline && numPeers > 1;

    items.forEach((item, index) => {
      const product = getSelectedProduct(item.productId);
      const variant = getSelectedVariant(product, item.productVariantId);
      if (!product) {
        if (!newErrors.items) newErrors.items = {};
        newErrors.items[index] = t('validation.selectProduct');
        isValid = false;
      } else if (item.productVariantId && variant && item.quantity > variant.quantity) {
        if (!newErrors.items) newErrors.items = {};
        newErrors.items[index] = t('validation.insufficientStock', { stock: variant.quantity });
        isValid = false;
      } else if (!item.productVariantId && item.quantity > product.quantity) {
        if (!newErrors.items) newErrors.items = {};
        newErrors.items[index] = t('validation.insufficientStock', { stock: product.quantity });
        isValid = false;
      } else if (isMultiTerminalOffline) {
        const availableStock = variant ? variant.quantity : product.quantity;
        const cap = Math.max(1, Math.floor(availableStock / numPeers));
        if (item.quantity > cap) {
          if (!newErrors.items) newErrors.items = {};
          newErrors.items[index] =
            t('validation.offlineCapExceeded', { cap }) || `Límite de reserva offline excedido. Cap autorizado: ${cap}`;
          isValid = false;
        }
      }
      if (item.quantity <= 0) {
        if (!newErrors.items) newErrors.items = {};
        newErrors.items[index] = t('validation.quantityPositive');
        isValid = false;
      }
    });
    setErrors(newErrors);
    return isValid;
  };

  const { totalPrice, totalProfit } = items.reduce(
    (acc, item) => {
      const product = getSelectedProduct(item.productId);
      const variant = getSelectedVariant(product, item.productVariantId);
      if (product) {
        acc.totalPrice += item.price * item.quantity;
        acc.totalProfit += (item.price - (variant?.cost ?? product.cost)) * item.quantity;
      }
      return acc;
    },
    { totalPrice: 0, totalProfit: 0 },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const saleItems: SaleItem[] = items.map((item) => {
        const product = getSelectedProduct(item.productId);
        const variant = getSelectedVariant(product, item.productVariantId);
        if (!product) {
          throw new Error('Product not found');
        }
        return {
          ...item,
          productVariantId: variant?.id,
          variantLabel: product && variant ? getProductVariantDisplay(product, variant) : undefined,
          productName:
            product && variant ? `${product.name} - ${getProductVariantDisplay(product, variant)}` : product.name,
          cost: variant?.cost ?? product.cost,
          supplierId: product.supplierId,
        };
      });
      onSave({
        date: editingSale?.date || new Date().toISOString(),
        items: saleItems,
        totalPrice,
        profit: totalProfit,
        clientId,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="sale-form">
      {isScannerOpen && (
        <BarcodeScanner
          onScan={(code) => {
            setIsScannerOpen(false);
            addScannedProductToCart(code);
          }}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            data-testid="sale-scan-button"
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2.5 px-4 rounded-lg hover:bg-yellow-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
          >
            <ScanBarcode size={18} aria-hidden="true" />
            {t('sales.scan.button') || t('scanner.title') || 'Escanear'}
          </button>
          <input
            type="text"
            data-testid="sale-barcode-capture"
            data-barcode-capture="true"
            placeholder={t('sales.scan.placeholder') || 'Escanear código o SKU…'}
            className="flex-1 min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm min-h-[44px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const value = (e.target as HTMLInputElement).value.trim();
                if (value) {
                  addScannedProductToCart(value);
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
            aria-label={t('sales.scan.placeholder') || 'Barcode'}
          />
        </div>
        {scanFeedback && (
          <p className="text-xs text-[#F5F5DC]/70" data-testid="sale-scan-feedback">
            {scanFeedback}
          </p>
        )}
        {items.map((item, index) => {
          const product = getSelectedProduct(item.productId);
          const variants = product ? getProductVariants(product) : [];
          const selectedVariant = getSelectedVariant(product, item.productVariantId);
          return (
            <div key={index} className="flex flex-col gap-2 p-3 rounded-md bg-[#121212]">
              <div className="flex items-center gap-2">
                <select
                  value={item.productId}
                  onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                  className="flex-1 min-w-0 p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md text-sm min-h-[44px]"
                  data-testid={`sale-item-product-${index}`}
                >
                  <option value="" disabled>
                    {t('sales.form.selectProduct')}
                  </option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>{`${p.name} (${t('common.stock')}: ${p.quantity})`}</option>
                  ))}
                </select>
                <button
                  data-testid={`remove-sale-item-button-${index}`}
                  type="button"
                  onClick={() => removeItem(index)}
                  className="bg-transparent border border-red-500/50 text-red-400 font-bold py-2.5 px-3 rounded-lg hover:bg-red-500/10 transition-all active:scale-95 flex-shrink-0 text-sm min-h-[44px]"
                >
                  🗑️
                </button>
              </div>
              {(product?.imageUrl || selectedVariant?.imageUrl) && (
                <button
                  type="button"
                  onClick={() => openImagePreview(product, selectedVariant)}
                  className="flex w-full items-center gap-3 rounded-md border border-[#F5F5DC]/15 bg-[#1a1a1a] p-2 text-left transition-colors hover:border-[#F5F5DC]/30 active:scale-[0.99]"
                  aria-label={t('common.product')}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/20">
                    <img
                      src={selectedVariant?.imageUrl || product?.imageUrl || ''}
                      alt={selectedVariant ? selectedVariant.label || product?.name || '' : product?.name || ''}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#F5F5DC]">{product?.name || ''}</p>
                    <p className="truncate text-xs text-[#F5F5DC]/60">
                      {selectedVariant
                        ? product
                          ? getProductVariantDisplay(product, selectedVariant) || selectedVariant.label
                          : selectedVariant.label
                        : t('common.product')}
                    </p>
                    <p className="text-[11px] text-[#F5F5DC]/45">
                      {t('inventory.form.clickImageToPreview') || 'Toca la imagen para verla grande'}
                    </p>
                  </div>
                  <ImageIcon className="h-4 w-4 shrink-0 text-[#F5F5DC]/50" aria-hidden="true" />
                </button>
              )}
              {variants.length > 1 && (
                <select
                  value={item.productVariantId || variants[0]?.id || ''}
                  onChange={(e) => handleVariantChange(index, e.target.value)}
                  className="w-full p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md text-sm min-h-[44px]"
                  data-testid={`sale-item-variant-${index}`}
                >
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {product ? getProductVariantDisplay(product, variant) : variant.label || 'Default'} (
                      {t('common.stock')}: {variant.quantity})
                    </option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  data-testid={`sale-item-quantity-${index}`}
                  type="number"
                  placeholder={t('common.quantity')}
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  min="1"
                  max={product?.quantity}
                  className="w-full p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md text-sm min-h-[44px]"
                />
                <input
                  data-testid={`sale-item-price-${index}`}
                  type="number"
                  placeholder={t('common.price')}
                  value={item.price}
                  onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md text-sm min-h-[44px]"
                />
              </div>
              {selectedVariant && (
                <p className="text-[11px] text-[#F5F5DC]/50">
                  {product?.name || ''} -{' '}
                  {product
                    ? getProductVariantDisplay(product, selectedVariant) || selectedVariant.label
                    : selectedVariant.label}
                </p>
              )}
              {errors.items?.[index] && <p className="text-red-400 text-xs">{errors.items[index]}</p>}
            </div>
          );
        })}
        <button
          data-testid="add-sale-item-button"
          type="button"
          onClick={addItem}
          className="w-full bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2.5 px-4 rounded-lg hover:bg-yellow-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
        >
          + {t('sales.form.addItem')}
        </button>
        {errors.general && <p className="text-red-400 text-xs mt-1">{errors.general}</p>}

        <div className="border-t border-[#F5F5DC]/20 pt-4">
          <select
            data-testid="sale-client-select"
            value={clientId || ''}
            onChange={(e) => setClientId(e.target.value || undefined)}
            className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 min-h-[44px]"
          >
            <option value="">{t('sales.form.selectClientOptional')}</option>
            {state.clients
              .filter((c) => c.isActive !== false)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-6 border-t border-[#F5F5DC]/20 pt-4 gap-4">
        <div>
          <p className="text-sm text-[#F5F5DC]/70">
            {t('sales.total')}: <span className="font-bold text-lg text-[#F5F5DC]">{formatCurrency(totalPrice)}</span>
          </p>
          <p className="text-xs text-[#F5F5DC]/60">
            {t('sales.profit')}: <span className="font-semibold text-green-400">{formatCurrency(totalProfit)}</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row justify-end gap-3 w-full sm:w-auto">
          <button
            data-testid="cancel-sale-button"
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto bg-transparent border border-[#F5F5DC]/50 font-bold py-2.5 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95 min-h-[44px]"
          >
            {t('common.cancel')}
          </button>
          <button
            data-testid="save-sale-button"
            type="submit"
            className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95 min-h-[44px]"
          >
            {t('common.save')}
          </button>
        </div>
      </div>

      {previewImage &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={() => setPreviewImage(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111111] p-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#F5F5DC]">{previewImage.label}</p>
                  <p className="text-xs text-[#F5F5DC]/50">
                    {t('inventory.form.previewImage') || 'Vista previa de la imagen'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-[#F5F5DC]/80 hover:bg-white/10"
                  aria-label={t('modal.close')}
                >
                  <X size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="block w-full overflow-hidden rounded-xl border border-white/10 bg-black/30"
                aria-label={previewImage.label}
              >
                <img src={previewImage.url} alt={previewImage.label} className="max-h-[72vh] w-full object-contain" />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </form>
  );
};

export default Sales;
