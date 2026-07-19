import { Check, Layers, Sparkles, X } from 'lucide-react';
import type { Product } from 'p2p-mesh-core';
import type React from 'react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';

export interface ProductConflictGroup {
  key: string;
  type: 'sku' | 'name';
  products: Product[];
}

// Conflict detection logic
export const detectProductConflicts = (products: Product[]): ProductConflictGroup[] => {
  const activeProducts = products.filter((p) => p.isActive !== false);
  const groupsBySku = new Map<string, Product[]>();
  const groupsByName = new Map<string, Product[]>();

  for (const p of activeProducts) {
    const sku = p.sku?.trim().toLowerCase();
    if (sku) {
      if (!groupsBySku.has(sku)) groupsBySku.set(sku, []);
      groupsBySku.get(sku)?.push(p);
    } else {
      const name = p.name?.trim().toLowerCase();
      if (name) {
        if (!groupsByName.has(name)) groupsByName.set(name, []);
        groupsByName.get(name)?.push(p);
      }
    }
  }

  const conflicts: ProductConflictGroup[] = [];

  for (const [sku, list] of groupsBySku.entries()) {
    if (list.length > 1) {
      conflicts.push({ key: sku.toUpperCase(), type: 'sku', products: list });
    }
  }

  for (const [_name, list] of groupsByName.entries()) {
    if (list.length > 1) {
      conflicts.push({ key: list[0].name, type: 'name', products: list });
    }
  }

  return conflicts;
};

interface ProductConflictResolverProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProductConflictResolver: React.FC<ProductConflictResolverProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();

  // Selected survivor ID per conflict group key
  const [selectedSurvivors, setSelectedSurvivors] = useState<Record<string, string>>({});

  const conflicts = useMemo(() => detectProductConflicts(state.products), [state.products]);

  if (!isOpen) return null;

  const handleSelectSurvivor = (groupKey: string, productId: string) => {
    setSelectedSurvivors((prev) => ({
      ...prev,
      [groupKey]: productId,
    }));
  };

  const getSurvivor = (group: ProductConflictGroup): Product => {
    const selectedId = selectedSurvivors[group.key];
    if (selectedId) {
      const p = group.products.find((prod) => prod.id === selectedId);
      if (p) return p;
    }
    // Default to the latest updated product
    return group.products.reduce((latest, current) => {
      const latestTime = new Date(latest.updatedAt || 0).getTime();
      const currentTime = new Date(current.updatedAt || 0).getTime();
      return currentTime > latestTime ? current : latest;
    }, group.products[0]);
  };

  const executeMergeGroup = (group: ProductConflictGroup) => {
    const survivor = getSurvivor(group);
    const totalQuantity = group.products.reduce((acc, p) => acc + (p.quantity || 0), 0);

    // Update survivor with merged quantity
    const mergedProduct: Product = {
      ...survivor,
      quantity: totalQuantity,
      updatedAt: new Date().toISOString(),
      updatedBy: state.localPeerId || 'local',
    };

    // Dispatch update for survivor
    dispatch({ type: 'UPDATE_PRODUCT', payload: mergedProduct });

    // Delete other duplicate products
    group.products.forEach((p) => {
      if (p.id !== survivor.id) {
        dispatch({ type: 'DELETE_PRODUCT', payload: p.id });
      }
    });
  };

  const handleMergeAll = () => {
    conflicts.forEach((group) => {
      executeMergeGroup(group);
    });
    onClose();
  };

  const handleMergeGroup = (group: ProductConflictGroup) => {
    executeMergeGroup(group);
    // Remove the survivor selection for this group key
    setSelectedSurvivors((prev) => {
      const updated = { ...prev };
      delete updated[group.key];
      return updated;
    });
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col my-8 max-h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#F5F5DC]/10 bg-[#121212]">
          <h3 className="font-bold text-[#F5F5DC] flex items-center gap-2 text-lg sm:text-xl">
            <Layers className="text-yellow-400" size={20} />
            {t('p2pSync.conflictResolver.title') || 'Resolver Conflictos de Productos'}
          </h3>
          <button
            onClick={onClose}
            className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] p-1 rounded-md hover:bg-white/5 transition-colors"
            aria-label={t('common.close') || 'Cerrar'}
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
                {t('p2pSync.conflictResolver.noConflicts') || 'No se encontraron conflictos de productos.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs sm:text-sm text-[#F5F5DC]/70 leading-relaxed bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-md">
                ⚠️{' '}
                {t('p2pSync.conflictResolver.warning') ||
                  'Los siguientes productos tienen el mismo SKU o nombre pero detalles diferentes. Elige qué detalles conservar. Las cantidades se sumarán.'}
              </p>

              <div className="space-y-6">
                {conflicts.map((group) => {
                  const currentSurvivor = getSurvivor(group);
                  const totalQty = group.products.reduce((acc, p) => acc + (p.quantity || 0), 0);

                  return (
                    <div
                      key={group.key}
                      className="border border-[#F5F5DC]/20 bg-[#121212]/50 p-4 rounded-lg space-y-4"
                    >
                      {/* Group Header Info */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F5F5DC]/10 pb-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-[#F5F5DC]">
                            {t('p2pSync.conflictResolver.groupLabel', {
                              type: group.type.toUpperCase(),
                              key: group.key,
                            }) || `Conflicto en ${group.type.toUpperCase()}: ${group.key}`}
                          </span>
                          <span className="text-xs text-[#F5F5DC]/50 mt-1">
                            {t('p2pSync.conflictResolver.quantityMerged', { qty: totalQty }) ||
                              `Cantidad combinada: ${totalQty}`}
                          </span>
                        </div>
                        <button
                          onClick={() => handleMergeGroup(group)}
                          className="self-start sm:self-center px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-[#1a1a1a] rounded font-bold text-xs transition-colors flex items-center gap-1.5 active:scale-95"
                        >
                          <Check size={14} />
                          {t('p2pSync.conflictResolver.mergeBtn') || 'Fusionar Grupo'}
                        </button>
                      </div>

                      {/* Side by side cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {group.products.map((prod) => {
                          const isSelected = currentSurvivor.id === prod.id;
                          return (
                            <div
                              key={prod.id}
                              onClick={() => handleSelectSurvivor(group.key, prod.id)}
                              className={`p-4 rounded-lg bg-[#1a1a1a] border-2 cursor-pointer transition-all duration-200 ${
                                isSelected
                                  ? 'border-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.2)] bg-[#211d13]'
                                  : 'border-[#F5F5DC]/10 hover:border-[#F5F5DC]/30 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3">
                                  {prod.imageUrl ? (
                                    <img
                                      src={prod.imageUrl}
                                      alt={prod.name}
                                      className="w-12 h-12 rounded object-cover border border-[#F5F5DC]/20 bg-black"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded bg-white/10 flex items-center justify-center text-xl text-[#F5F5DC]/40">
                                      📦
                                    </div>
                                  )}
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-sm text-[#F5F5DC] truncate">{prod.name}</span>
                                    <span className="text-xs text-[#F5F5DC]/60 font-mono mt-0.5">
                                      SKU: {prod.sku || 'N/A'}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-center w-5 h-5 rounded-full border border-yellow-500">
                                  {isSelected && <div className="w-3 h-3 bg-yellow-500 rounded-full" />}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                                <div className="p-2 bg-[#121212] rounded border border-white/5">
                                  <span className="block opacity-50">
                                    {t('p2pSync.conflictResolver.price', { val: '' }).split(':')[0]}
                                  </span>
                                  <span className="font-bold text-yellow-400">${prod.price?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div className="p-2 bg-[#121212] rounded border border-white/5">
                                  <span className="block opacity-50">
                                    {t('p2pSync.conflictResolver.cost', { val: '' }).split(':')[0]}
                                  </span>
                                  <span className="font-bold text-yellow-400">${prod.cost?.toFixed(2) || '0.00'}</span>
                                </div>
                              </div>

                              <div className="mt-3 flex justify-between items-center text-[10px] text-[#F5F5DC]/50 border-t border-[#F5F5DC]/5 pt-2">
                                <span className="truncate">Peer: {prod.updatedBy || 'local'}</span>
                                <span>
                                  {t('p2pSync.conflictResolver.updatedAt', {
                                    val: new Date(prod.updatedAt || 0).toLocaleDateString(),
                                  }) || `Actualizado: ${new Date(prod.updatedAt || 0).toLocaleDateString()}`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
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
            {conflicts.length > 0 && `${conflicts.length} grupo(s) de conflicto`}
          </div>
          <div className="flex justify-end gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-[#333] hover:bg-[#444] rounded text-[#F5F5DC] font-medium text-sm transition-colors active:scale-95"
            >
              {t('p2pSync.close') || 'Cerrar'}
            </button>
            {conflicts.length > 0 && (
              <button
                onClick={handleMergeAll}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-[#1a1a1a] rounded font-bold text-sm transition-colors flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Sparkles size={16} />
                {t('p2pSync.conflictResolver.autoMergeAll') || 'Auto-fusionar Todos'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ProductConflictResolver;
