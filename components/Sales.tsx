import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSortableTable } from '../hooks/useSortableTable';
import type { Sale, SaleItem } from '../types';
import Modal from './Modal';

const Sales: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { t } = useI18n();
  const { formatCurrency } = useCurrency();

  const activeSales = useMemo(() => state.sales.filter((s) => s.isActive !== false), [state.sales]);

  const {
    items: sortedSales,
    requestSort,
    getSortIndicator,
  } = useSortableTable<Sale>(activeSales, { key: 'date', direction: 'desc' });

  const generateReceipt = (sale: Sale) => {
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

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSaveSale = (saleData: Omit<Sale, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => {
    const newSale = {
      id: new Date().toISOString(),
      ...saleData,
    } as Sale;
    dispatch({ type: 'ADD_SALE', payload: newSale });
    handleCloseModal();
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC]">{t('sales.title')}</h2>
        <button
          onClick={handleOpenModal}
          className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 text-sm"
          data-testid="add-sale-button"
        >
          {t('sales.addSale')}
        </button>
      </div>

      {/* Desktop table */}
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-[#F5F5DC]/10">
              <tr>
                <SortableHeader sortKey="date" labelKey="sales.date" />
                <th className="p-4">{t('common.products')}</th>
                <SortableHeader sortKey="totalPrice" labelKey="sales.total" />
                <SortableHeader sortKey="profit" labelKey="sales.profit" />
                <th className="p-4">{t('common.client')}</th>
                <th className="p-4">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedSales.length > 0 ? (
                sortedSales.map((sale) => (
                  <tr
                    key={sale.id}
                    data-testid={`sale-row-${sale.id}`}
                    className="border-t border-[#F5F5DC]/20 hover:bg-foreground/5 transition-colors duration-200"
                  >
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-[#F5F5DC]/70" data-testid="empty-sales-message">
                    {t('sales.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden grid grid-cols-1 gap-3">
        {sortedSales.length > 0 ? (
          sortedSales.map((sale) => (
            <div
              key={sale.id}
              className="bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-3 active:scale-[0.98] transition-transform"
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
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={t('sales.addSale')}>
          <SaleForm onSave={handleSaveSale} onCancel={handleCloseModal} />
        </Modal>
      )}
    </div>
  );
};

interface SaleFormProps {
  onSave: (saleData: Omit<Sale, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const SaleForm: React.FC<SaleFormProps> = ({ onSave, onCancel }) => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const { formatCurrency } = useCurrency();
  const [items, setItems] = useState<Omit<SaleItem, 'productName' | 'cost'>[]>([]);
  const [clientId, setClientId] = useState<string | undefined>();
  const [errors, setErrors] = useState<{ general?: string; items?: { [key: number]: string } }>({});

  const availableProducts = useMemo(() => {
    return state.products.filter((p) => p.quantity > 0 && p.isActive !== false);
  }, [state.products]);

  const handleItemChange = (index: number, field: 'productId' | 'quantity' | 'price', value: string) => {
    const newItems = [...items];
    const currentItem = { ...newItems[index] };

    if (field === 'productId') {
      const product = state.products.find((p) => p.id === value);
      currentItem.productId = value;
      currentItem.price = product?.price ?? 0;
      currentItem.quantity = 1;
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

  const validate = () => {
    const newErrors: { general?: string; items?: { [key: number]: string } } = { items: {} };
    let isValid = true;
    if (items.length === 0) {
      newErrors.general = t('validation.saleItemsRequired');
      return false;
    }

    items.forEach((item, index) => {
      const product = state.products.find((p) => p.id === item.productId);
      if (!product) {
        if (!newErrors.items) newErrors.items = {};
        newErrors.items[index] = t('validation.selectProduct');
        isValid = false;
      } else if (item.quantity > product.quantity) {
        if (!newErrors.items) newErrors.items = {};
        newErrors.items[index] = t('validation.insufficientStock', { stock: product.quantity });
        isValid = false;
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

  const { totalPrice, totalProfit } = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const product = state.products.find((p) => p.id === item.productId);
        if (product) {
          acc.totalPrice += item.price * item.quantity;
          acc.totalProfit += (item.price - product.cost) * item.quantity;
        }
        return acc;
      },
      { totalPrice: 0, totalProfit: 0 },
    );
  }, [items, state.products]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const saleItems: SaleItem[] = items.map((item) => {
        const product = state.products.find((p) => p.id === item.productId);
        if (!product) {
          throw new Error('Product not found');
        }
        return {
          ...item,
          productName: product.name,
          cost: product.cost,
        };
      });
      onSave({
        date: new Date().toISOString(),
        items: saleItems,
        totalPrice,
        profit: totalProfit,
        clientId,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="sale-form">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {items.map((item, index) => {
          const product = state.products.find((p) => p.id === item.productId);
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
    </form>
  );
};

export default Sales;
