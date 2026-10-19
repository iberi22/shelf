import type React from 'react';
import { useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import useLocalStorage from '../hooks/useLocalStorage';
import { type BodegaLoadErrorCode, loadBodegaFile } from '../lib/bodega/loadFile';
import type { BodegaReadModel } from '../lib/bodega/toProducts';
import { DEFAULT_INVENTORY_CONFIG, normalizeInventoryConfig } from '../lib/inventoryConfig';
import { InventoryView } from './inventory/InventoryView';

const BodegaPage: React.FC = () => {
  const { state } = useAppContext();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
  const [lowStockThreshold] = useLocalStorage('lowStockThreshold', 5);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [model, setModel] = useState<BodegaReadModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoad = async () => {
    if (!selectedFile) return;
    setError(null);
    const result = await loadBodegaFile(selectedFile, passphrase);
    if (result.ok) {
      setModel(result.model);
    } else {
      const errorMap: Record<BodegaLoadErrorCode, string> = {
        demasiado_grande: t('bodega.fileTooLarge'),
        formato: t('bodega.invalidFormat'),
        clave: t('bodega.invalidKey'),
        alterado: t('bodega.alteredFile'),
        inesperado: result.message || t('bodega.unexpectedError'),
      };
      setError(errorMap[result.code] || result.message || t('bodega.unexpectedError'));
      setModel(null);
    }
  };

  const handleClear = () => {
    setModel(null);
    setError(null);
    setPassphrase('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-surface-alt border border-foreground/20 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-white mb-4">{t('nav.bodegas')}</h2>
        <p className="text-sm text-foreground/70 mb-4">{t('bodega.description')}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm">{error}</div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            aria-label={t('bodega.fileAriaLabel')}
            accept=".json,.enc.json,application/json"
            className="block w-full sm:w-auto text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-foreground/10 file:text-foreground hover:file:bg-foreground/20 transition-colors"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setSelectedFile(file);
            }}
          />

          <input
            type="password"
            aria-label={t('bodega.passphraseAriaLabel')}
            placeholder={t('bodega.passphrasePlaceholder')}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full sm:w-48 p-2 bg-surface border border-foreground/30 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground text-sm"
          />

          <button
            onClick={handleLoad}
            disabled={!selectedFile}
            className="px-4 py-2 text-sm font-semibold bg-accent-green text-primary rounded-md hover:bg-opacity-90 transition-opacity whitespace-nowrap shadow-[0_0_10px_rgba(74,222,128,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('bodega.loadButton')}
          </button>

          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm text-foreground/70 border border-foreground/20 rounded-md hover:bg-foreground/10 transition-colors whitespace-nowrap"
          >
            {t('common.clear')}
          </button>
        </div>
      </div>

      {model && (
        <div className="flex-1 bg-surface-alt border border-foreground/20 rounded-xl p-6 min-h-0 flex flex-col">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-foreground/10">
            <div>
              <span className="text-sm font-semibold text-accent-yellow mr-2">
                {t('bodega.source')} {model.source.appId}
              </span>
              <span className="text-xs text-foreground/50">
                {t('bodega.date')} {new Date(model.source.exportedAt).toLocaleString()}
              </span>
            </div>
            <div className="flex gap-4">
              <span className="text-sm text-foreground/70">
                {t('bodega.currency')} {model.currency}
              </span>
              {model.unmapped > 0 && (
                <span className="text-sm text-red-400">
                  {t('bodega.unmapped')} {model.unmapped}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <InventoryView
              products={model.products}
              config={normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG)}
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
