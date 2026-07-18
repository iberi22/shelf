import type { Product, PurchaseOrder, PurchaseOrderItem } from 'p2p-mesh-core';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import { useSortableTable } from '../hooks/useSortableTable';
import { getProductVariantDisplay, getProductVariants, normalizeProduct } from '../lib/productVariants';
import { InfiniteTable } from './InfiniteTable';
import Modal from './Modal';

const PurchaseOrders: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const canEdit = state.role === 'admin' || state.permissions?.canEditPurchaseOrders !== false;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const { t } = useI18n();
  const { showNotification } = useUI();

  const activePOs = useMemo(
    () =>
      state.purchaseOrders.filter((po) => {
        if (po.isActive === false) return false;
        if (!state.activeBranchId) return true;
        return po.branchId === state.activeBranchId;
      }),
    [state.purchaseOrders, state.activeBranchId],
  );

  const {
    items: sortedPOs,
    requestSort,
    getSortIndicator,
  } = useSortableTable<PurchaseOrder>(activePOs, { key: 'orderDate', direction: 'desc' });

  const handleOpenModal = (po: PurchaseOrder | null = null) => {
    if (!canEdit && !po) return;
    setEditingPO(po);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingPO(null);
    setIsModalOpen(false);
  };

  const handleSavePO = (poData: Omit<PurchaseOrder, 'id' | 'isActive' | 'updatedBy' | 'updatedAt'>) => {
    if (!canEdit) return;
    if (editingPO) {
      dispatch({ type: 'UPDATE_PURCHASE_ORDER', payload: { ...editingPO, ...poData } as PurchaseOrder });
    } else {
      const newPO = {
        id: new Date().toISOString(),
        ...poData,
        branchId: state.activeBranchId || undefined,
      } as PurchaseOrder;
      dispatch({ type: 'ADD_PURCHASE_ORDER', payload: newPO });
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (!canEdit) return;
    if (window.confirm(t('purchases.deleteConfirm'))) {
      dispatch({ type: 'DELETE_PURCHASE_ORDER', payload: id });
    }
  };

  const handleMarkAsReceived = (po: PurchaseOrder) => {
    if (!canEdit) return;
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

  const handleCancel = (po: PurchaseOrder) => {
    if (!canEdit || po.status !== 'pending') return;
    if (window.confirm(t('purchases.cancelConfirm') || 'Cancel this purchase order?')) {
      const updatedPO: PurchaseOrder = {
        ...po,
        status: 'cancelled',
      };
      dispatch({ type: 'UPDATE_PURCHASE_ORDER', payload: updatedPO });
      showNotification(t('purchases.cancelSuccess') || 'Purchase order cancelled', 'info');
    }
  };

  const statusLabel = (status: PurchaseOrder['status']) => {
    if (status === 'received') return t('purchases.statusReceived');
    if (status === 'cancelled') return t('purchases.statusCancelled') || 'Cancelled';
    return t('purchases.statusPending');
  };

  const statusClass = (status: PurchaseOrder['status']) => {
    if (status === 'received') return 'bg-green-500/20 text-green-300';
    if (status === 'cancelled') return 'bg-red-500/20 text-red-300';
    return 'bg-yellow-500/20 text-yellow-300';
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 flex-wrap">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC] shrink-0">{t('purchases.title')}</h2>
        {canEdit && (
          <button
            onClick={() => handleOpenModal()}
            className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 text-sm"
            data-testid="add-purchase-order-button"
          >
            {t('purchases.addPurchaseOrder')}
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <InfiniteTable
          data={sortedPOs}
          height="calc(100vh - 200px)"
          emptyContent={<div className="text-center p-8 text-[#F5F5DC]/70">{t('purchases.empty')}</div>}
          fixedHeaderContent={() => (
            <tr>
              <SortableHeader sortKey="supplierName" labelKey="common.supplier" />
              <SortableHeader sortKey="status" labelKey="common.status" />
              <SortableHeader sortKey="orderDate" labelKey="purchases.orderDate" />
              <th className="p-4">{t('common.items')}</th>
              {canEdit && <th className="p-4">{t('common.actions')}</th>}
            </tr>
          )}
          itemContent={(_, po) => (
            <>
              <td className="p-4">{po.supplierName}</td>
              <td className="p-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClass(po.status)}`}>
                  {statusLabel(po.status)}
                </span>
              </td>
              <td className="p-4">{po.orderDate}</td>
              <td className="p-4">{po.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
              {canEdit && (
                <td className="p-4 flex items-center gap-4">
                  <button
                    onClick={() => handleOpenModal(po)}
                    className="text-yellow-400 transition-transform active:scale-95"
                    aria-label={t('common.editItem', { item: po.id })}
                  >
                    ✏️
                  </button>
                  {po.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleMarkAsReceived(po)}
                        className="text-green-400 transition-transform active:scale-95"
                        title={t('purchases.markAsReceived')}
                        data-testid="po-mark-received"
                      >
                        ✔️
                      </button>
                      <button
                        onClick={() => handleCancel(po)}
                        className="text-orange-400 transition-transform active:scale-95"
                        title={t('purchases.cancel') || 'Cancel'}
                        data-testid="po-cancel"
                      >
                        🚫
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(po.id)}
                    className="text-red-400 transition-transform active:scale-95"
                    aria-label={t('common.deleteItem', { item: po.id })}
                  >
                    🗑️
                  </button>
                </td>
              )}
            </>
          )}
        />
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden grid grid-cols-1 gap-3">
        {sortedPOs.length > 0 ? (
          sortedPOs.map((po) => (
            <div
              key={po.id}
              className="w-full bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-3 active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-[#F5F5DC] truncate">{po.supplierName}</p>
                  <p className="text-xs text-[#F5F5DC]/50 mt-0.5">
                    {t('purchases.orderDate')}: {po.orderDate}
                  </p>
                </div>
                <span className={`flex-shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${statusClass(po.status)}`}>
                  {statusLabel(po.status)}
                </span>
              </div>
              <p className="text-xs text-[#F5F5DC]/70 mb-3">
                {t('common.items')}: {po.items.reduce((sum, item) => sum + item.quantity, 0)}
              </p>
              {canEdit && (
                <div className="flex gap-2 pt-2 border-t border-[#F5F5DC]/10">
                  <button
                    onClick={() => handleOpenModal(po)}
                    className="flex-1 bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2.5 px-3 rounded-lg hover:bg-yellow-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                  >
                    ✏️ {t('common.edit')}
                  </button>
                  {po.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleMarkAsReceived(po)}
                        className="flex-1 bg-transparent border border-green-500/50 text-green-400 font-bold py-2.5 px-3 rounded-lg hover:bg-green-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                      >
                        ✔️ {t('purchases.markAsReceived')}
                      </button>
                      <button
                        onClick={() => handleCancel(po)}
                        className="flex-1 bg-transparent border border-orange-500/50 text-orange-400 font-bold py-2.5 px-3 rounded-lg hover:bg-orange-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                        data-testid="po-cancel-mobile"
                      >
                        🚫
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(po.id)}
                    className="flex-1 bg-transparent border border-red-500/50 text-red-400 font-bold py-2.5 px-3 rounded-lg hover:bg-red-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                  >
                    🗑️ {t('common.delete')}
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center p-8 text-[#F5F5DC]/70 bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg">
            {t('purchases.empty')}
          </div>
        )}
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
    () =>
      purchaseOrder?.items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        cost: item.cost,
        variantLabel: item.variantLabel,
      })) || [{ productId: '', quantity: 1, cost: 0 }],
  );
  const [errors, setErrors] = useState<{ [key: string]: any }>({});

  const isEditingReceived = purchaseOrder?.status === 'received';

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
    const product =
      field === 'productId' ? getSelectedProduct(String(value)) : getSelectedProduct(newItems[index].productId);

    if (field === 'productId') {
      const variants = product ? getProductVariants(product) : [];
      const selectedVariant = variants[0] || null;
      newItems[index] = {
        ...newItems[index],
        productId: String(value),
        productVariantId: selectedVariant?.id,
        cost: selectedVariant?.cost ?? product?.cost ?? 0,
        variantLabel: product && selectedVariant ? getProductVariantDisplay(product, selectedVariant) : undefined,
      };
    } else if (field === 'productVariantId') {
      const selectedVariant = getSelectedVariant(product, String(value));
      newItems[index] = {
        ...newItems[index],
        productVariantId: selectedVariant?.id,
        cost: selectedVariant?.cost ?? product?.cost ?? 0,
        variantLabel: product && selectedVariant ? getProductVariantDisplay(product, selectedVariant) : undefined,
      };
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
        const product = getSelectedProduct(item.productId);
        const variant = getSelectedVariant(product, item.productVariantId);
        return {
          ...item,
          quantity: Number(item.quantity),
          productVariantId: variant?.id,
          variantLabel: product && variant ? getProductVariantDisplay(product, variant) : undefined,
          cost: Number(item.cost),
          productName:
            variant && product
              ? `${product.name} - ${getProductVariantDisplay(product, variant)}`
              : product?.name || 'Unknown',
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
            className={`w-full p-2.5 bg-[#121212] border rounded-md min-h-[44px] ${errors.supplierId ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
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
            <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-md bg-[#121212]">
              <select
                value={item.productId}
                onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                className="w-full sm:flex-1 p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md min-h-[44px]"
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
              {(() => {
                const product = getSelectedProduct(item.productId);
                const variants = product ? getProductVariants(product) : [];
                return variants.length > 1 ? (
                  <select
                    value={item.productVariantId || variants[0]?.id || ''}
                    onChange={(e) => handleItemChange(index, 'productVariantId', e.target.value)}
                    className="w-full sm:flex-1 p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md min-h-[44px]"
                    disabled={isEditingReceived}
                    data-testid={`purchase-order-item-variant-${index}`}
                  >
                    {variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {product ? getProductVariantDisplay(product, variant) : variant.label || 'Default'} (
                        {t('common.stock')}: {variant.quantity})
                      </option>
                    ))}
                  </select>
                ) : null;
              })()}
              <div className="grid grid-cols-2 sm:flex gap-2">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  min="1"
                  className="w-full sm:w-20 p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md min-h-[44px]"
                  disabled={isEditingReceived}
                  data-testid={`purchase-order-item-quantity-${index}`}
                />
                <input
                  type="number"
                  value={item.cost}
                  onChange={(e) => handleItemChange(index, 'cost', e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full sm:w-24 p-2.5 bg-[#1e1e1e] border border-[#F5F5DC]/30 rounded-md min-h-[44px]"
                  disabled={isEditingReceived}
                  data-testid={`purchase-order-item-cost-${index}`}
                />
                {!isEditingReceived && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="bg-transparent border border-red-500/50 text-red-400 font-bold py-2.5 px-3 rounded-lg hover:bg-red-500/10 transition-all active:scale-95 flex-shrink-0 text-sm min-h-[44px]"
                    data-testid={`remove-purchase-order-item-button-${index}`}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {!isEditingReceived && (
          <button
            type="button"
            onClick={addItem}
            className="w-full bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2.5 px-4 rounded-lg hover:bg-yellow-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
            data-testid="add-purchase-order-item-button"
          >
            + {t('purchases.form.addItem')}
          </button>
        )}
        {errors.general && <p className="text-red-400 text-xs mt-1">{errors.general}</p>}
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 w-full">
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto bg-transparent border border-[#F5F5DC]/50 font-bold py-2.5 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95 min-h-[44px]"
          data-testid="cancel-purchase-order-button"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95 min-h-[44px]"
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
