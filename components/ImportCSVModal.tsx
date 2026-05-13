import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import type { ImportStrategy, Product } from '../types';
import Modal from './Modal';

interface ImportCSVModalProps {
  onClose: () => void;
}

const ImportCSVModal: React.FC<ImportCSVModalProps> = ({ onClose }) => {
  const { t } = useI18n();
  const { showNotification } = useUI();
  const { dispatch } = useAppContext();
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy>('skip');
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      setFile(null);
      showNotification('Please select a valid .csv file.', 'error');
    }
  };

  const handleImport = async () => {
    if (!file) {
      showNotification('No file selected.', 'error');
      return;
    }
    setIsLoading(true);

    try {
      const text = await file.text();
      const rows = text.split('\n').filter((row) => row.trim() !== '');
      const header = rows[0]
        .trim()
        .split(',')
        .map((h) => h.trim());
      const expectedHeader = ['name', 'sku', 'quantity', 'price', 'cost', 'imageUrl'];

      // Validate header
      if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
        throw new Error(t('settings.import.invalidHeaderError'));
      }

      const productsToImport: Omit<Product, 'id'>[] = rows.slice(1).map((row) => {
        const values = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        const [name, sku, quantity, price, cost, imageUrl] = values.map((v) => v.replace(/"/g, '').trim());
        return {
          name: name || 'Unnamed Product',
          sku: sku || undefined,
          quantity: parseInt(quantity, 10) || 0,
          price: parseFloat(price) || 0,
          cost: parseFloat(cost) || 0,
          imageUrl: imageUrl || undefined,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: 'import',
        };
      });

      dispatch({ type: 'IMPORT_PRODUCTS', payload: { products: productsToImport, strategy } });
      showNotification(t('settings.import.success', { count: productsToImport.length }), 'success');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      showNotification(t('settings.import.error', { error: message }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={t('settings.import.title')}>
      <div className="space-y-6">
        <p className="text-sm text-foreground/70">{t('settings.import.description')}</p>

        <a
          href="/template.csv"
          download="shelf_template.csv"
          className="inline-block text-sm font-semibold text-yellow-400 hover:text-yellow-300 transition-colors"
        >
          {t('settings.import.downloadTemplate')}
        </a>

        <div>
          <label htmlFor="csv-upload" className="block text-sm font-medium text-foreground mb-2">
            {t('settings.import.selectFile')}
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-foreground/10 file:text-foreground hover:file:bg-foreground/20"
          />
          <p className="text-xs text-foreground/60 mt-1">{file ? file.name : t('settings.import.noFileSelected')}</p>
        </div>

        <div>
          <p className="block text-sm font-medium text-foreground mb-2">{t('settings.import.conflictStrategy')}</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="strategy"
                value="skip"
                checked={strategy === 'skip'}
                onChange={() => setStrategy('skip')}
                className="form-radio bg-background border-foreground/50 text-yellow-400 focus:ring-yellow-400"
              />
              {t('settings.import.strategySkip')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="strategy"
                value="update"
                checked={strategy === 'update'}
                onChange={() => setStrategy('update')}
                className="form-radio bg-background border-foreground/50 text-yellow-400 focus:ring-yellow-400"
              />
              {t('settings.import.strategyUpdate')}
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-4 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!file || isLoading}
            className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('settings.import.importing') : t('settings.import.button')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ImportCSVModal;
