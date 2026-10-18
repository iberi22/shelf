import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import useLocalStorage from '../hooks/useLocalStorage';
import { BodegaFormatError } from '../lib/bodega/contract';
import { openBodegaSnapshot } from '../lib/bodega/readSnapshot';
import { type BodegaReadModel, toReadModel } from '../lib/bodega/toProducts';
import { getOrCreateInstanceId } from '../lib/xavier';
import { InventoryView } from './inventory/InventoryView';

// Note: from '../lib/bodega/writeSnapshot'
// Stubs for buildSnapshot and sealSnapshot since writeSnapshot is not merged yet in SH3-3.
const buildSnapshot = (_products: any[], _branches: any[], _opts: any) => ({
  format: 'swal-inventory-export/v1',
  items: [],
});
const sealSnapshot = (snapshot: any, _passphrase?: string) => JSON.stringify(snapshot);

const BodegaPage: React.FC = () => {
  const { state } = useAppContext();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
  const [lowStockThreshold] = useLocalStorage('lowStockThreshold', 5);

  const [passphrase, setPassphrase] = useState('');
  const [model, setModel] = useState<BodegaReadModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-surface-alt border border-foreground/20 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Bodegas Externas</h2>
        <p className="text-sm text-foreground/70 mb-4">
          Carga un archivo de instantánea de inventario (.json o .enc.json) para visualizarlo. Shelf's own data is never
          modified by this screen.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm">{error}</div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <input
            type="file"
            accept=".json,.enc.json,application/json"
            className="block w-full sm:w-auto text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-foreground/10 file:text-foreground hover:file:bg-foreground/20 transition-colors"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setError(null);
                const text = await file.text();
                const snapshot = await openBodegaSnapshot(text, passphrase);
                const readModel = toReadModel(snapshot);
                setModel(readModel);
              } catch (_err) {
                if (_err instanceof BodegaFormatError) {
                  const errorMap: Record<string, string> = {
                    formato: 'El archivo no tiene un formato válido de bodega.',
                    clave: 'La clave es incorrecta o requerida.',
                    alterado: 'El archivo ha sido alterado o está corrupto.',
                  };
                  setError(errorMap[_err.code] || _err.message);
                } else {
                  setError('Error inesperado al leer el archivo.');
                }
                setModel(null);
              }
              // Clear input value so same file can be re-selected
              e.target.value = '';
            }}
          />

          <input
            type="password"
            placeholder="Clave (opcional)"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full sm:w-48 p-2 bg-surface border border-foreground/30 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground text-sm"
          />

          <button
            onClick={() => {
              setModel(null);
              setError(null);
              setPassphrase('');
            }}
            className="px-4 py-2 text-sm text-foreground/70 border border-foreground/20 rounded-md hover:bg-foreground/10 transition-colors whitespace-nowrap"
          >
            Limpiar
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-foreground/10 flex justify-end">
          <button
            onClick={() => {
              try {
                const instanceId = getOrCreateInstanceId();
                const snapshot = buildSnapshot(state.products, state.branches || [], { instanceId });
                const content = sealSnapshot(snapshot, passphrase);

                const blob = new Blob([content], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `shelf-export-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (_err) {
                setError('Error al exportar inventario.');
              }
            }}
            className="px-4 py-2 text-sm font-semibold bg-accent-green text-primary rounded-md hover:bg-opacity-90 transition-opacity whitespace-nowrap shadow-[0_0_10px_rgba(74,222,128,0.2)]"
          >
            Exportar mi inventario
          </button>
        </div>
      </div>

      {model && (
        <div className="flex-1 bg-surface-alt border border-foreground/20 rounded-xl p-6 min-h-0 flex flex-col">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-foreground/10">
            <div>
              <span className="text-sm font-semibold text-accent-yellow mr-2">Fuente: {model.source.appId}</span>
              <span className="text-xs text-foreground/50">
                Fecha: {new Date(model.source.exportedAt).toLocaleString()}
              </span>
            </div>
            <div className="flex gap-4">
              <span className="text-sm text-foreground/70">Moneda: {model.currency}</span>
              {model.unmapped > 0 && <span className="text-sm text-red-400">Sin mapear: {model.unmapped}</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* We cast state.inventoryConfig to any because we might not have DEFAULT_INVENTORY_CONFIG imported,
                but let's import it if we can. Actually let's just pass state.inventoryConfig || { fields: [] } as any.
                Wait, InventoryView expects a proper config. We can just use the exact pattern from Inventory.tsx. */}
            <InventoryView
              products={model.products}
              config={(state.inventoryConfig as any) || { fields: [] }}
              readOnly
              formatMoney={formatCurrency}
              t={t}
              lowStockThreshold={lowStockThreshold}
              suppliers={[]}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BodegaPage;
