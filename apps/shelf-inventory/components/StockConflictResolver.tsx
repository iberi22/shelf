import { AlertTriangle, Check, Sparkles, X } from 'lucide-react';
import type { Product, Sale } from 'p2p-mesh-core';
import type React from 'react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { detectBusinessConflicts, type BusinessConflict } from '../utils/businessConflicts';

interface StockConflictResolverProps {
  isOpen: boolean;
  onClose: () => void;
}

const StockConflictResolver: React.FC<StockConflictResolverProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();

  // Map of stockConflictId -> manual quantity adjustment input
  const [adjustQuantities, setAdjustQuantities] = useState<Record<string, number>>({});

  const conflicts = useMemo(() => detectBusinessConflicts(state.products, state.sales), [state.products, state.sales]);

  if (!isOpen) return null;

  const handleAdjustQuantityChange = (conflictId: string, val: string) => {
    const num = Number.parseInt(val, 10);
    setAdjustQuantities((prev) => ({
      ...prev,
      [conflictId]: Number.isNaN(num) ? 0 : num,
    }));
  };

  const handleSaveStockAdjustment = (conflict: BusinessConflict) => {
    const newQty = adjustQuantities[conflict.id] ?? 0;
    const product = state.products.find((p) => p.id === conflict.productId);

    if (!product) return;

    if (conflict.productVariantId) {
      // Find and update variant
      const updatedVariants = (product.variants || []).map((variant) =>
        variant.id === conflict.productVariantId
          ? {
              ...variant,
              quantity: newQty,
              updatedAt: new Date().toISOString(),
              updatedBy: state.localPeerId || 'local',
            }
          : variant,
      );

      // Sum quantities of all variants
      const totalQty = updatedVariants.reduce((sum, v) => sum + (v.quantity || 0), 0);

      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          ...product,
          variants: updatedVariants,
          quantity: totalQty,
          updatedAt: new Date().toISOString(),
          updatedBy: state.localPeerId || 'local',
        },
      });
    } else {
      // Base product update
      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          ...product,
          quantity: newQty,
          updatedAt: new Date().toISOString(),
          updatedBy: state.localPeerId || 'local',
        },
      });
    }

    // Clean up adjustment input
    setAdjustQuantities((prev) => {
      const updated = { ...prev };
      delete updated[conflict.id];
      return updated;
    });
  };

  const handleCancelSale = (saleId: string) => {
    dispatch({ type: 'DELETE_SALE', payload: saleId });
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col my-8 max-h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#F5F5DC]/10 bg-[#121212]">
          <h3 className="font-bold text-[#F5F5DC] flex items-center gap-2 text-lg sm:text-xl">
            <AlertTriangle className="text-yellow-400" size={20} />
            {t('p2pSync.conflictResolver.businessTitle') || 'Resolver Conflictos de Stock (Simultaneidad)'}
          </h3>
          <button
            onClick={onClose}
            className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] p-1 rounded-md hover:bg-white/5 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {conflicts.length === 0 ? (
            <div className="text-center py-12 text-[#F5F5DC]/50">
              <Sparkles size={48} className="mx-auto mb-3 text-green-400/80 animate-pulse" />
              <p className="text-sm font-medium">
                {t('p2pSync.conflictResolver.noBusinessConflicts') || 'No se detectaron conflictos de stock negativo.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs sm:text-sm text-[#F5F5DC]/70 leading-relaxed bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-md">
                ⚠️{' '}
                {t('p2pSync.conflictResolver.businessWarning') ||
                  'Se han detectado ventas simultáneas que excedieron el stock real disponible. Elige ajustar el stock nominal o cancelar una de las ventas para equilibrar el inventario.'}
              </p>

              <div className="space-y-6">
                {conflicts.map((conflict) => {
                  const inputVal = adjustQuantities[conflict.id] ?? '';

                  return (
                    <div
                      key={conflict.id}
                      className="border border-[#F5F5DC]/20 bg-[#121212]/50 p-4 rounded-lg space-y-4"
                      data-testid={`stock-conflict-group-${conflict.id}`}
                    >
                      {/* Product Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F5F5DC]/10 pb-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-[#F5F5DC]" data-testid={`conflict-product-name-${conflict.id}`}>
                            {conflict.productName} {conflict.variantLabel ? `- ${conflict.variantLabel}` : ''}
                          </span>
                          <span className="text-xs text-red-400 mt-1 font-semibold" data-testid={`conflict-product-detail-${conflict.id}`}>
                            {t('p2pSync.conflictResolver.negativeStockDetail', {
                              initial: conflict.initialStock,
                              sold: conflict.totalSold,
                              diff: conflict.negativeStock,
                            }) ||
                              `Stock Inicial: ${conflict.initialStock} | Vendido: ${conflict.totalSold} | Diferencia: ${conflict.negativeStock}`}
                          </span>
                        </div>
                      </div>

                      {/* Resolution Choices */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Option 1: Adjust Nominal Stock */}
                        <div className="p-4 rounded-lg bg-[#1a1a1a] border border-[#F5F5DC]/10 flex flex-col justify-between space-y-4">
                          <div>
                            <span className="block font-bold text-xs text-[#F5F5DC] uppercase tracking-wider mb-1">
                              Opción A: Ajustar Stock
                            </span>
                            <p className="text-xs text-[#F5F5DC]/60 leading-relaxed">
                              Mantén todas las ventas. Registra un nuevo nivel de stock para este producto.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              placeholder="Nuevo stock..."
                              value={inputVal}
                              onChange={(e) => handleAdjustQuantityChange(conflict.id, e.target.value)}
                              className="p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded text-xs w-full min-h-[40px]"
                              data-testid={`adjust-stock-input-${conflict.id}`}
                            />
                            <button
                              onClick={() => handleSaveStockAdjustment(conflict)}
                              disabled={inputVal === ''}
                              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-[#1a1a1a] font-bold rounded text-xs transition-colors shrink-0 flex items-center gap-1 active:scale-95 min-h-[40px]"
                              data-testid={`adjust-stock-btn-${conflict.id}`}
                            >
                              <Check size={14} />
                              {t('common.save') || 'Guardar'}
                            </button>
                          </div>
                        </div>

                        {/* Option 2: Overlapping/Conflicting Sales */}
                        <div className="p-4 rounded-lg bg-[#1a1a1a] border border-[#F5F5DC]/10 flex flex-col justify-between space-y-4">
                          <div>
                            <span className="block font-bold text-xs text-[#F5F5DC] uppercase tracking-wider mb-1">
                              Opción B: Cancelar una Venta
                            </span>
                            <p className="text-xs text-[#F5F5DC]/60 leading-relaxed mb-3">
                              Cancela una de las ventas concurrentes para liberar las unidades reservadas.
                            </p>

                            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                              {conflict.sales.map((sale) => {
                                const saleItem = sale.items.find(
                                  (it) =>
                                    it.productId === conflict.productId &&
                                    (!conflict.productVariantId || it.productVariantId === conflict.productVariantId),
                                );
                                if (!saleItem) return null;

                                return (
                                  <div
                                    key={sale.id}
                                    className="p-2.5 bg-[#121212] rounded border border-white/5 flex items-center justify-between text-xs gap-2"
                                    data-testid={`conflicting-sale-${sale.id}`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="font-semibold text-[#F5F5DC] truncate">
                                        Venta: {sale.id.slice(0, 8)} - Cant: {saleItem.quantity}
                                      </p>
                                      <p className="text-[10px] text-[#F5F5DC]/50 mt-0.5">
                                        Por: {sale.updatedBy?.slice(0, 8) || 'local'} |{' '}
                                        {new Date(sale.date).toLocaleTimeString()}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleCancelSale(sale.id)}
                                      className="px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600/35 text-red-400 hover:text-red-300 border border-red-500/30 rounded font-semibold text-[10px] transition-colors shrink-0 active:scale-95"
                                      data-testid={`cancel-sale-btn-${sale.id}`}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#F5F5DC]/10 bg-[#121212] flex flex-col sm:flex-row justify-between gap-3">
          <div className="text-xs text-[#F5F5DC]/50 self-center">
            {conflicts.length > 0 && `${conflicts.length} conflicto(s) de stock`}
          </div>
          <div className="flex justify-end gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-[#333] hover:bg-[#444] rounded text-[#F5F5DC] font-medium text-sm transition-colors active:scale-95"
              data-testid="close-stock-resolver-btn"
            >
              {t('p2pSync.close') || 'Cerrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default StockConflictResolver;
