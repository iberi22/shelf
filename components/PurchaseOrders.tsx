import type React from 'react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import { useSortableTable } from '../hooks/useSortableTable';
import type { PurchaseOrder, PurchaseOrderItem } from '../types';
import Modal from './Modal';

const PurchaseOrders: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const { t } = useI18n();
  const { showNotification } = useUI();

  const activePOs = useMemo(() => state.purchaseOrders.filter((po) => po.isActive !== false), [state.purchaseOrders]);

  const {
    items: sortedPOs,
    requestSort,
    getSortIndicator,
  } = useSortableTable<PurchaseOrder>(activePOs, { key: 'orderDate', direction: 'desc' });

  const handleOpenModal = (po: PurchaseOrder | null = null) => {
    setEditingPO(po);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingPO(null);
    setIsModalOpen(false);
  };

  const handleSavePO = (poData: Omit<PurchaseOrder, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => {
    if (editingPO) {
      dispatch({ type: 'UPDATE_PURCHASE_ORDER', payload: { ...editingPO, ...poData } as PurchaseOrder });
    } else {
      const newPO = {
        id: new Date().toISOString(),
        ...poData,
      } as PurchaseOrder;
      dispatch({ type: 'ADD_PURCHASE_ORDER', payload: newPO });
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t('purchases.deleteConfirm'))) {
      dispatch({ type: 'DELETE_PURCHASE_ORDER', payload: id });
    }
  };

  const handleMarkAsReceived = (po: PurchaseOrder) => {
    if (window.confirm(t('purchases.markAsReceivedConfirm'))) {
      const updatedPO: PurchaseOrder = {
        ...po,
        status: 'received',
        receivedDate: new Date().toLocaleDateString('en-CA'),
      };
      dispatch({ type: 'UPDATE_PURCHASE_ORDER', payload: updatedPO });
      showNotification('Stock updated successfully!', 'success');
    }
  };

  const SortableHeader: React.FC<{ sortKey: keyof PurchaseOrder; labelKey: string }> = ({ sortKey, labelKey }) => (
    <th className="p-4">
      <button
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC]">{t('purchases.title')}</h2>
        <button
          onClick={() => handleOpenModal()}
          className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 text-sm"
          data-testid="add-purchase-order-button"
        >
          {t('purchases.addPurchaseOrder')}
        </button>
      </div>

      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px] md:min-w-[700px]">
            <thead className="bg-[#F5F5DC]/10">
              <tr>
                <SortableHeader sortKey="supplierName" labelKey="common.supplier" />
                <SortableHeader sortKey="status" labelKey="common.status" />
                <SortableHeader sortKey="orderDate" labelKey="purchases.orderDate" />
                <th className="p-4">{t('common.items')}</th>
                <th className="p-4">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPOs.length > 0 ? (
                sortedPOs.map((po) => (
                  <tr
                    key={po.id}
                    className="border-t border-[#F5F5DC]/20 hover:bg-foreground/5 transition-colors duration-200"
                  >
                    <td className="p-4">{po.supplierName}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${po.status === 'received' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}
                      >
                        {po.status === 'received' ? t('purchases.statusReceived') : t('purchases.statusPending')}
                      </span>
                    </td>
                    <td className="p-4">{po.orderDate}</td>
                    <td className="p-4">{po.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                    <td className="p-4 flex items-center gap-4">
                      <button
                        onClick={() => handleOpenModal(po)}
                        className="text-yellow-400 transition-transform active:scale-95"
                        aria-label={t('common.editItem', { item: po.id })}
                      >
                        ✏️
                      </button>
                      {po.status === 'pending' && (
                        <button
                          onClick={() => handleMarkAsReceived(po)}
                          className="text-green-400 transition-transform active:scale-95"
                          title={t('purchases.markAsReceived')}
                        >
                          ✔️
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(po.id)}
                        className="text-red-400 transition-transform active:scale-95"
                        aria-label={t('common.deleteItem', { item: po.id })}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-[#F5F5DC]/70">
                    {t('purchases.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={editingPO ? t('purchases.editPurchaseOrder') : t('purchases.addPurchaseOrder')}
        >
          <PurchaseOrderForm purchaseOrder={editingPO} onSave={handleSavePO} onCancel={handleCloseModal} />
        </Modal>
      )}
    </div>
  );
};

interface PurchaseOrderFormProps {
  purchaseOrder: PurchaseOrder | null;
  onSave: (poData: Omit<PurchaseOrder, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const PurchaseOrderForm: React.FC<PurchaseOrderFormProps> = ({ purchaseOrder, onSave, onCancel }) => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const [supplierId, setSupplierId] = useState(purchaseOrder?.supplierId || '');
  const [items, setItems] = useState<Omit<PurchaseOrderItem, 'productName'>[]>(
    purchaseOrder?.items || [{ productId: '', quantity: 1, cost: 0 }],
  );
  const [errors, setErrors] = useState<{ [key: string]: any }>({});

  const isEditingReceived = purchaseOrder?.status === 'received';

  const validate = () => {
    const newErrors: { [key: string]: any } = { items: [] };
    let isValid = true;
    if (!supplierId) {
      newErrors.supplierId = t('purchases.form.selectSupplierAlert');
      isValid = false;
    }
    if (items.length === 0) {
      newErrors.general = t('validation.poItemsRequired');
      isValid = false;
    }
    items.forEach((item, index) => {
      const itemErrors: { [key: string]: string } = {};
      if (!item.productId) {
        itemErrors.productId = 'Required';
        isValid = false;
      }
      if (Number(item.quantity) <= 0) {
        itemErrors.quantity = t('validation.poItemQuantityPositive');
        isValid = false;
      }
      if (Number(item.cost) < 0) {
        itemErrors.cost = t('validation.poItemCostNonNegative');
        isValid = false;
      }
      if (Object.keys(itemErrors).length > 0) newErrors.items[index] = itemErrors;
    });
    setErrors(newErrors);
    return isValid;
  };

  const handleItemChange = (
    index: number,
    field: keyof Omit<PurchaseOrderItem, 'productName'>,
    value: string | number,
  ) => {
    const newItems = [...items];
    const product = state.products.find((p) => p.id === value);

    if (field === 'productId' && product) {
      newItems[index] = { ...newItems[index], productId: String(value), cost: product.cost };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1, cost: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const supplier = state.suppliers.find((s) => s.id === supplierId);
      if (!supplier) return;

      const enrichedItems: PurchaseOrderItem[] = items.map((item) => {
        const product = state.products.find((p) => p.id === item.productId);
        return {
          ...item,
          quantity: Number(item.quantity),
          cost: Number(item.cost),
          productName: product?.name || 'Unknown',
        };
      });

      onSave({
        supplierId,
        supplierName: supplier.name,
        items: enrichedItems,
        status: purchaseOrder?.status || 'pending',
        orderDate: purchaseOrder?.orderDate || new Date().toLocaleDateString('en-CA'),
        receivedDate: purchaseOrder?.receivedDate,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="purchase-order-form">
      <div className="space-y-4">
        <div>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={`w-full p-2 bg-[#121212] border rounded-md ${errors.supplierId ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
            disabled={isEditingReceived}
            data-testid="purchase-order-supplier-select"
          >
            <option value="" disabled>
              {t('purchases.form.selectSupplier')}
            </option>
            {state.suppliers
              .filter((s) => s.isActive !== false)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          {errors.supplierId && <p className="text-red-400 text-xs mt-1">{errors.supplierId}</p>}
        </div>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-[#121212]">
              <select
                value={item.productId}
                onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                className="flex-grow p-2 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md"
                disabled={isEditingReceived}
                data-testid={`purchase-order-item-product-${index}`}
              >
                <option value="">Select Product</option>
                {state.products
                  .filter((p) => p.isActive !== false)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                min="1"
                className="w-20 p-2 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md"
                disabled={isEditingReceived}
                data-testid={`purchase-order-item-quantity-${index}`}
              />
              <input
                type="number"
                value={item.cost}
                onChange={(e) => handleItemChange(index, 'cost', e.target.value)}
                min="0"
                step="0.01"
                className="w-24 p-2 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md"
                disabled={isEditingReceived}
                data-testid={`purchase-order-item-cost-${index}`}
              />
              {!isEditingReceived && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-red-400 transition-transform active:scale-95"
                  data-testid={`remove-purchase-order-item-button-${index}`}
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
        {!isEditingReceived && (
          <button
            type="button"
            onClick={addItem}
            className="text-sm font-bold text-yellow-400 hover:text-yellow-300 transition-transform active:scale-95"
            data-testid="add-purchase-order-item-button"
          >
            {t('purchases.form.addItem')}
          </button>
        )}
        {errors.general && <p className="text-red-400 text-xs mt-1">{errors.general}</p>}
      </div>

      <div className="flex justify-end gap-4 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95"
          data-testid="cancel-purchase-order-button"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95"
          disabled={isEditingReceived}
          data-testid="save-purchase-order-button"
        >
          {t('common.save')}
        </button>
      </div>
    </form>
  );
};

export default PurchaseOrders;
