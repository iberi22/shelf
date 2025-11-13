
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import Modal from './Modal';
import { Sale, SaleItem } from '../types';
import { useI18n } from '../context/I18nContext';
import { useCurrency } from '../context/CurrencyContext';
import { useSortableTable } from '../hooks/useSortableTable';

const Sales: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { t } = useI18n();
  const { formatCurrency } = useCurrency();
  const { items: sortedSales, requestSort, getSortIndicator } = useSortableTable<Sale>(state.sales, { key: 'date', direction: 'desc' });

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };
  
  const handleSaveSale = (saleData: Omit<Sale, 'id'>) => {
    const newSale: Sale = {
        id: new Date().toISOString(),
        ...saleData,
    };
    dispatch({ type: 'ADD_SALE', payload: newSale });
    handleCloseModal();
  };

  const SortableHeader: React.FC<{ sortKey: keyof Sale; labelKey: string; }> = ({ sortKey, labelKey }) => (
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">{t('sales.title')}</h2>
        <button onClick={handleOpenModal} className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95" data-testid="add-sale-button">
          {t('sales.addSale')}
        </button>
      </div>

      <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-[#F5F5DC]/10">
              <tr>
                <SortableHeader sortKey="date" labelKey="sales.date" />
                <th className="p-4">{t('common.products')}</th>
                <SortableHeader sortKey="totalPrice" labelKey="sales.total" />
                <SortableHeader sortKey="profit" labelKey="sales.profit" />
                <th className="p-4">{t('common.client')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedSales.length > 0 ? sortedSales.map(sale => (
                <tr key={sale.id} data-testid={`sale-row-${sale.id}`} className="border-t border-[#F5F5DC]/20 hover:bg-foreground/5 transition-colors duration-200">
                  <td className="p-4">{new Date(sale.date).toLocaleDateString()}</td>
                  <td className="p-4">{sale.items.map(item => `${item.productName} (x${item.quantity})`).join(', ')}</td>
                  <td className="p-4">{formatCurrency(sale.totalPrice)}</td>
                  <td className="p-4">{formatCurrency(sale.profit)}</td>
                  <td className="p-4">{sale.clientName || t('common.notAvailable')}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-[#F5F5DC]/70" data-testid="empty-sales-message">
                      {t('sales.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
    onSave: (saleData: Omit<Sale, 'id'>) => void;
    onCancel: () => void;
}

const SaleForm: React.FC<SaleFormProps> = ({ onSave, onCancel }) => {
    const { t } = useI18n();
    const { state } = useAppContext();
    const { formatCurrency } = useCurrency();
    const [items, setItems] = useState<Omit<SaleItem, 'productName' | 'cost'>[]>([]);
    const [clientId, setClientId] = useState<string | undefined>();
    const [errors, setErrors] = useState<{ general?: string, items?: { [key: number]: string } }>({});

    const availableProducts = useMemo(() => {
        return state.products.filter(p => p.quantity > 0);
    }, [state.products]);

    const handleItemChange = (index: number, field: 'productId' | 'quantity' | 'price', value: string) => {
        const newItems = [...items];
        const currentItem = { ...newItems[index] };
        
        if (field === 'productId') {
            const product = state.products.find(p => p.id === value);
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
        const newErrors: { general?: string, items?: { [key: number]: string } } = { items: {} };
        let isValid = true;
        if (items.length === 0) {
            newErrors.general = t('validation.saleItemsRequired');
            return false;
        }

        items.forEach((item, index) => {
            const product = state.products.find(p => p.id === item.productId);
            if (!product) {
                newErrors.items![index] = t('validation.selectProduct');
                isValid = false;
            } else if (item.quantity > product.quantity) {
                newErrors.items![index] = t('validation.insufficientStock', { stock: product.quantity });
                isValid = false;
            }
            if (item.quantity <= 0) {
                newErrors.items![index] = t('validation.quantityPositive');
                isValid = false;
            }
        });
        setErrors(newErrors);
        return isValid;
    };

    const { totalPrice, totalProfit } = useMemo(() => {
        return items.reduce((acc, item) => {
            const product = state.products.find(p => p.id === item.productId);
            if (product) {
                acc.totalPrice += item.price * item.quantity;
                acc.totalProfit += (item.price - product.cost) * item.quantity;
            }
            return acc;
        }, { totalPrice: 0, totalProfit: 0 });
    }, [items, state.products]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            const saleItems: SaleItem[] = items.map(item => {
                const product = state.products.find(p => p.id === item.productId)!;
                return {
                    ...item,
                    productName: product.name,
                    cost: product.cost
                };
            });
            onSave({
                date: new Date().toISOString(),
                items: saleItems,
                totalPrice,
                profit: totalProfit,
                clientId
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} data-testid="sale-form">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {items.map((item, index) => {
                    const product = state.products.find(p => p.id === item.productId);
                    return (
                        <div key={index} className="flex flex-col gap-2 p-2 rounded-md bg-[#121212]">
                            <div className="flex items-center gap-2">
                                <select 
                                    value={item.productId} 
                                    onChange={e => handleItemChange(index, 'productId', e.target.value)}
                                    className="flex-grow p-2 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md"
                                    data-testid={`sale-item-product-${index}`}
                                >
                                    <option value="" disabled>{t('sales.form.selectProduct')}</option>
                                    {availableProducts.map(p => <option key={p.id} value={p.id}>{`${p.name} (${t('common.stock')}: ${p.quantity})`}</option>)}
                                </select>
                                <button data-testid={`remove-sale-item-button-${index}`} type="button" onClick={() => removeItem(index)} className="text-red-400 transition-transform active:scale-95">🗑️</button>
                            </div>
                            <div className="flex items-center gap-2">
                                <input data-testid={`sale-item-quantity-${index}`} type="number" placeholder={t('common.quantity')} value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} min="1" max={product?.quantity} className="w-1/2 p-2 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md" />
                                <input data-testid={`sale-item-price-${index}`} type="number" placeholder={t('common.price')} value={item.price} onChange={e => handleItemChange(index, 'price', e.target.value)} min="0" step="0.01" className="w-1/2 p-2 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md" />
                            </div>
                             {errors.items?.[index] && <p className="text-red-400 text-xs">{errors.items[index]}</p>}
                        </div>
                    );
                })}
                <button data-testid="add-sale-item-button" type="button" onClick={addItem} className="text-sm font-bold text-yellow-400 hover:text-yellow-300 transition-transform active:scale-95">{t('sales.form.addItem')}</button>
                {errors.general && <p className="text-red-400 text-xs mt-1">{errors.general}</p>}

                <div className="border-t border-[#F5F5DC]/20 pt-4">
                    <select data-testid="sale-client-select" value={clientId || ''} onChange={e => setClientId(e.target.value || undefined)} className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30">
                        <option value="">{t('sales.form.selectClientOptional')}</option>
                        {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex justify-between items-center mt-6 border-t border-[#F5F5DC]/20 pt-4">
                <div>
                    <p className="text-sm text-[#F5F5DC]/70">{t('sales.total')}: <span className="font-bold text-lg text-[#F5F5DC]">{formatCurrency(totalPrice)}</span></p>
                    <p className="text-xs text-[#F5F5DC]/60">{t('sales.profit')}: <span className="font-semibold text-green-400">{formatCurrency(totalProfit)}</span></p>
                </div>
                <div className="flex justify-end gap-4">
                    <button data-testid="cancel-sale-button" type="button" onClick={onCancel} className="bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95">{t('common.cancel')}</button>
                    <button data-testid="save-sale-button" type="submit" className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95">{t('common.save')}</button>
                </div>
            </div>
        </form>
    );
};

export default Sales;