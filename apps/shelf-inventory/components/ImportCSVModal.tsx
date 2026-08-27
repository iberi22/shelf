import type { ImportStrategy } from 'p2p-mesh-core';
import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import {
  CANONICAL_CSV_HEADERS,
  type CanonicalCsvHeader,
  parseProductCsvAtomic,
  previewCsvHeaders,
} from '../lib/csvProductImport';
import Modal from './ui/Modal';

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
  const [rowErrors, setRowErrors] = useState<string[]>([]);

  // Interactive mapping state
  const [csvText, setCsvText] = useState<string>('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [userMapping, setUserMapping] = useState<(CanonicalCsvHeader | null)[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      setCsvText('');
      setRawHeaders([]);
      setUserMapping([]);
      return;
    }
    const nameOk = selectedFile.name.toLowerCase().endsWith('.csv');
    const typeOk =
      !selectedFile.type ||
      selectedFile.type === 'text/csv' ||
      selectedFile.type === 'application/vnd.ms-excel' ||
      selectedFile.type === 'text/plain';
    if (nameOk || typeOk) {
      setFile(selectedFile);
      setRowErrors([]);
      try {
        const text = await selectedFile.text();
        setCsvText(text);
        const { rawHeaders: headers, suggestedMapping } = previewCsvHeaders(text);
        setRawHeaders(headers);
        setUserMapping(suggestedMapping);
      } catch (_err) {
        showNotification(t('settings.import.errorReadingFile') || 'Error reading CSV file.', 'error');
        setFile(null);
        setCsvText('');
        setRawHeaders([]);
        setUserMapping([]);
      }
    } else {
      setFile(null);
      setCsvText('');
      setRawHeaders([]);
      setUserMapping([]);
      showNotification(t('settings.import.invalidFile') || 'Please select a valid .csv file.', 'error');
    }
  };

  const handleMappingChange = (index: number, val: CanonicalCsvHeader | 'ignore') => {
    setUserMapping((prev) => {
      const next = [...prev];
      next[index] = val === 'ignore' ? null : val;
      return next;
    });
  };

  // Required: name must be mapped to enable import
  const isNameMapped = userMapping.includes('name');

  const handleImport = async () => {
    if (!file || !csvText) {
      showNotification(t('settings.import.noFileSelected') || 'No file selected.', 'error');
      return;
    }
    setIsLoading(true);
    setRowErrors([]);

    try {
      const result = parseProductCsvAtomic(csvText, { columnMapping: userMapping });

      if (!result.ok) {
        setRowErrors(result.errors.slice(0, 8).map((e) => `L${e.line}: ${e.message}`));
        const msg =
          result.abortReason ||
          result.errors[0]?.message ||
          t('settings.import.invalidHeaderError') ||
          'Import aborted — nothing was imported.';
        showNotification(t('settings.import.rollback') || `Importación fallida, cambios revertidos: ${msg}`, 'error');
        return;
      }

      dispatch({ type: 'IMPORT_PRODUCTS', payload: { products: result.products, strategy } });
      showNotification(
        t('settings.import.success', { count: result.products.length }) ||
          `Imported ${result.products.length} products`,
        'success',
      );
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      showNotification(t('settings.import.error', { error: message }) || message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={t('settings.import.title')}>
      <div className="space-y-6" data-testid="import-csv-modal">
        <p className="text-sm text-foreground/70">{t('settings.import.description')}</p>

        <a
          href="/template.csv"
          download="shelf_template.csv"
          className="inline-block text-sm font-semibold text-yellow-400 hover:text-yellow-300 transition-colors"
          data-testid="import-csv-template-link"
        >
          {t('settings.import.downloadTemplate')}
        </a>

        <div>
          <label htmlFor="csv-upload" className="block text-sm font-medium text-foreground mb-2">
            {t('settings.import.selectFile')}
          </label>
          <input
            id="csv-upload"
            data-testid="import-csv-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-foreground/10 file:text-foreground hover:file:bg-foreground/20"
          />
          <p className="text-xs text-foreground/60 mt-1" data-testid="import-csv-file-name">
            {file ? file.name : t('settings.import.noFileSelected')}
          </p>
        </div>

        {rawHeaders.length > 0 && (
          <div className="border border-foreground/30 bg-surface rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              {t('settings.import.mapColumns') || 'Map CSV Columns'}
            </h4>
            <p className="text-xs text-foreground/70">
              {t('settings.import.mapColumnsDesc') ||
                'Select which field matches each column in your file. The Product Name field is required.'}
            </p>
            <div className="max-h-[240px] overflow-y-auto space-y-3 pr-1">
              {rawHeaders.map((header, index) => {
                const mappedVal = userMapping[index] ?? 'ignore';
                return (
                  <div
                    key={`${header}-${index}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-foreground/10 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-xs font-medium text-foreground/80 truncate max-w-[200px]" title={header}>
                      {header}
                    </span>
                    <select
                      data-testid={`csv-map-${index}`}
                      value={mappedVal}
                      onChange={(e) => handleMappingChange(index, e.target.value as CanonicalCsvHeader | 'ignore')}
                      className="bg-surface-alt border border-foreground/30 text-foreground text-xs rounded-md p-1 min-h-[44px] focus:ring-yellow-400 focus:border-yellow-400 w-full sm:w-auto"
                    >
                      <option value="ignore">{t('settings.import.ignoreColumn') || '(Ignore)'}</option>
                      {CANONICAL_CSV_HEADERS.map((canon) => (
                        <option key={canon} value={canon}>
                          {canon === 'name' ? `${canon} *` : canon}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {!isNameMapped && (
              <p className="text-xs text-yellow-300">
                {t('settings.import.nameRequiredError') || '* Product Name mapping is required to enable import.'}
              </p>
            )}
          </div>
        )}

        <div>
          <p className="block text-sm font-medium text-foreground mb-2">{t('settings.import.conflictStrategy')}</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="strategy"
                value="skip"
                data-testid="import-csv-strategy-skip"
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
                data-testid="import-csv-strategy-update"
                checked={strategy === 'update'}
                onChange={() => setStrategy('update')}
                className="form-radio bg-background border-foreground/50 text-yellow-400 focus:ring-yellow-400"
              />
              {t('settings.import.strategyUpdate')}
            </label>
          </div>
        </div>

        {rowErrors.length > 0 && (
          <div
            className="text-xs text-yellow-300/90 bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-3 space-y-1"
            data-testid="import-csv-row-errors"
          >
            <p className="font-semibold">{t('settings.import.rowErrors') || 'Some rows were skipped:'}</p>
            {rowErrors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-4 mt-4">
          <button
            type="button"
            onClick={onClose}
            data-testid="import-csv-cancel"
            className="bg-transparent border border-foreground/50 font-bold py-2 px-4 rounded-lg hover:bg-foreground/10 transition-colors active:scale-95"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!file || isLoading || !isNameMapped}
            data-testid="import-csv-submit"
            className="bg-foreground text-surface font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('settings.import.importing') : t('settings.import.button')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ImportCSVModal;
