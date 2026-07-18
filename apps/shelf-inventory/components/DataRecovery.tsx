import { Trash2 } from 'lucide-react';
import type { AuditEntry } from 'p2p-mesh-core';
import type React from 'react';
import { useAppContext } from '../context/AppContext';
import CollapsibleCard from './CollapsibleCard';

const DataRecovery: React.FC = () => {
  const { state, dispatch } = useAppContext();

  const inactiveProducts = state.products.filter((p) => p.isActive === false);
  const inactiveClients = state.clients.filter((c) => c.isActive === false);
  const inactiveSuppliers = state.suppliers.filter((s) => s.isActive === false);
  const inactivePOs = state.purchaseOrders.filter((po) => po.isActive === false);

  const hasInactiveItems =
    inactiveProducts.length > 0 || inactiveClients.length > 0 || inactiveSuppliers.length > 0 || inactivePOs.length > 0;

  const handleRecover = (type: AuditEntry['entityType'], id: string) => {
    dispatch({ type: 'RECOVER_ITEM', payload: { type, id } });
  };

  const RenderSection = ({ title, items, type }: { title: string; items: any[]; type: AuditEntry['entityType'] }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <h4 className="text-sm font-bold text-[#F5F5DC]/80 mb-2 border-b border-[#F5F5DC]/10 pb-1 uppercase tracking-wider">
          {title}
        </h4>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center p-2 rounded-md bg-[#121212] border border-[#F5F5DC]/5"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{item.name || item.supplierName || item.id}</span>
                <span className="text-[10px] text-[#F5F5DC]/40 font-mono">ID: {item.id}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRecover(type, item.id)}
                className="text-xs font-bold text-green-400 hover:text-green-300 px-2 py-1 bg-green-500/10 rounded transition-colors cursor-pointer"
              >
                Recover
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <CollapsibleCard
      title="Data Recovery"
      description="Items deleted in the app are kept here for recovery. Restoring an item will make it visible again."
      icon={<Trash2 className="h-5 w-5" />}
      testId="settings-data-recovery-card"
    >
      {hasInactiveItems ? (
        <div className="max-h-[400px] overflow-y-auto pr-2">
          <RenderSection title="Products" items={inactiveProducts} type="product" />
          <RenderSection title="Clients" items={inactiveClients} type="client" />
          <RenderSection title="Suppliers" items={inactiveSuppliers} type="supplier" />
          <RenderSection title="Purchase Orders" items={inactivePOs} type="purchaseOrder" />
        </div>
      ) : (
        <div className="text-center p-8 text-[#F5F5DC]/50 italic text-sm">
          No items currently available for recovery.
        </div>
      )}
    </CollapsibleCard>
  );
};

export default DataRecovery;
