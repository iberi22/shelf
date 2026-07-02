import { Building2, Fingerprint, Languages, Lock, Pencil, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Branch, InventoryConfig, InventoryFieldDefinition, RestoreStatePayload } from 'p2p-mesh-core';
import { dbSync, decryptData, deriveKey, encryptData, getSessionKey } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import useLocalStorage from '../hooks/useLocalStorage';
import {
  createInventoryField,
  DEFAULT_INVENTORY_CONFIG,
  normalizeInventoryConfig,
  normalizeInventoryFieldKey,
} from '../lib/inventoryConfig';
import { isBiometricsSupported } from '../lib/webauthn';
import AuditLogViewer from './AuditLogViewer';
import DataRecovery from './DataRecovery';
import DeviceManagementPanel from './DeviceManagementPanel';
import ImportCSVModal from './ImportCSVModal';
import InviteMemberModal from './InviteMemberModal';
import LanguageSelector from './LanguageSelector';
import P2PSyncManager from './P2PSyncManager';

const CURRENCIES = [
  { code: 'USD', nameKey: 'settings.currency.currencies.USD' },
  { code: 'EUR', nameKey: 'settings.currency.currencies.EUR' },
  { code: 'GBP', nameKey: 'settings.currency.currencies.GBP' },
  { code: 'JPY', nameKey: 'settings.currency.currencies.JPY' },
  { code: 'BRL', nameKey: 'settings.currency.currencies.BRL' },
  { code: 'CLP', nameKey: 'settings.currency.currencies.CLP' },
  { code: 'COP', nameKey: 'settings.currency.currencies.COP' },
  { code: 'MXN', nameKey: 'settings.currency.currencies.MXN' },
];

const Settings: React.FC = () => {
  const { t } = useI18n();
  const { state, dispatch } = useAppContext();
  const { showNotification, openSubscriptionModal } = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lowStockThreshold, setLowStockThreshold] = useLocalStorage('lowStockThreshold', 5);
  const [tablePageSize, setTablePageSize] = useLocalStorage('tablePageSize', 50);
  const [geminiApiKey, setGeminiApiKey] = useLocalStorage('geminiApiKey', '');
  const [openCodeGoKey, setOpenCodeGoKey] = useLocalStorage('openCodeGoKey', '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenCodeGoKey, setShowOpenCodeGoKey] = useState(false);
  const [openCodeGoModel, setOpenCodeGoModel] = useLocalStorage('openCodeGoModel', 'gpt-4o');
  const [aiProxyUrl, setAiProxyUrl] = useLocalStorage('aiProxyUrl', '');
  const { currencyCode, setCurrencyCode, numberFormat, setNumberFormat } = useCurrency();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [inventoryConfigDraft, setInventoryConfigDraft] = useState<InventoryConfig>(
    normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG),
  );
  const [inventoryConfigErrors, setInventoryConfigErrors] = useState<string[]>([]);

  const { isPyme } = useSubscription();
  const { user, hasAppLock, hasBiometricLock, setAppLock, setBiometricLock } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [biometricsSupported, setBiometricsSupported] = useState(false);

  useEffect(() => {
    setInventoryConfigDraft(normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG));
  }, [state.inventoryConfig]);

  useEffect(() => {
    isBiometricsSupported()
      .then(setBiometricsSupported)
      .catch(() => setBiometricsSupported(false));
  }, []);

  const team = [
    { id: 'owner', email: user?.email ?? 'owner@example.com', role: 'owner' as const },
    ...state.teamMembers,
  ];

  const handleCreateBackup = async () => {
    try {
      const backupData = JSON.stringify(state);

      const password = window.prompt(
        t('settings.backup.passwordPrompt') ||
          'Introduce una contraseña para cifrar el respaldo (déjalo en blanco para usar la clave de este dispositivo):',
      );
      if (password === null) return; // User cancelled

      const key = password ? await deriveKey(password) : await getSessionKey();
      const encryptedData = await encryptData(backupData, key);

      const blob = new Blob([encryptedData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shelf_backup_${new Date().toISOString().split('T')[0]}.encrypted`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification(t('settings.backup.success'), 'success');
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Error al cifrar el respaldo', 'error');
    }
  };

  const handleRestoreChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('File content is not readable');

        let decryptedText = text;

        try {
          JSON.parse(text);
          // If this succeeds, it's an old unencrypted backup
        } catch {
          // It's likely encrypted
          const password = window.prompt(
            t('settings.restore.passwordPrompt') ||
              'Introduce la contraseña del respaldo (déjalo en blanco si se creó en este dispositivo sin contraseña):',
          );

          if (password === null) {
            throw new Error('Operación cancelada');
          }

          const key = password ? await deriveKey(password) : await getSessionKey();
          decryptedText = await decryptData(text, key);
        }

        const parsedData = JSON.parse(decryptedText);

        // Basic validation
        if (
          !('products' in parsedData && 'sales' in parsedData && 'clients' in parsedData && 'suppliers' in parsedData)
        ) {
          throw new Error(t('settings.restore.invalidFileError'));
        }

        if (window.confirm(t('settings.restore.confirmation'))) {
          dispatch({ type: 'RESTORE_STATE', payload: parsedData as RestoreStatePayload });
          showNotification(t('settings.restore.success'), 'success');
        }
      } catch (error) {
        console.error('Restore failed:', error);
        const message = error instanceof Error ? error.message : t('settings.restore.genericError');
        if (message !== 'Operación cancelada') {
          showNotification(message, 'error');
        }
      } finally {
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    if (window.confirm(t('settings.resetConfirmation'))) {
      dispatch({ type: 'RESET_DATA' });
      showNotification(t('settings.dataResetSuccess'), 'success');
    }
  };

  const updateInventoryField = (index: number, patch: Partial<InventoryFieldDefinition>) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)),
    }));
  };

  const normalizeInventoryFieldAt = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index
          ? { ...field, key: normalizeInventoryFieldKey(field.key, `field_${fieldIndex + 1}`) }
          : field,
      ),
    }));
  };

  const addInventoryField = () => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: [...current.fields, createInventoryField(current.fields.length)],
    }));
  };

  const removeInventoryField = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const updateVariantAttribute = (index: number, value: string) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      variantAttributes: current.variantAttributes.map((attribute, attributeIndex) =>
        attributeIndex === index ? value : attribute,
      ),
    }));
  };

  const addVariantAttribute = () => {
    setInventoryConfigDraft((current) => ({
      ...current,
      variantAttributes: [...current.variantAttributes, `Atributo ${current.variantAttributes.length + 1}`],
    }));
  };

  const removeVariantAttribute = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      variantAttributes: current.variantAttributes.filter((_, attributeIndex) => attributeIndex !== index),
    }));
  };

  const updateMeasureOption = (index: number, value: string) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      measureOptions: current.measureOptions.map((option, optionIndex) => (optionIndex === index ? value : option)),
    }));
  };

  const addMeasureOption = () => {
    setInventoryConfigDraft((current) => ({
      ...current,
      measureOptions: [...current.measureOptions, `Medida ${current.measureOptions.length + 1}`],
    }));
  };

  const removeMeasureOption = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      measureOptions: current.measureOptions.filter((_, optionIndex) => optionIndex !== index),
    }));
  };

  const updateInventorySyncSetting = (patch: Partial<InventoryConfig>) => {
    setInventoryConfigDraft((current) => normalizeInventoryConfig({ ...current, ...patch }));
  };

  const inventoryConfigSummary = useMemo(
    () => [
      { label: 'Campos visibles', value: inventoryConfigDraft.fields.length },
      { label: 'Atributos de variante', value: inventoryConfigDraft.variantAttributes.filter(Boolean).length },
      { label: 'Medidas sugeridas', value: inventoryConfigDraft.measureOptions.filter(Boolean).length },
    ],
    [inventoryConfigDraft.fields.length, inventoryConfigDraft.measureOptions, inventoryConfigDraft.variantAttributes],
  );

  const validateInventoryConfigDraft = () => {
    const errors: string[] = [];
    const normalizedFields = inventoryConfigDraft.fields.map((field, index) => ({
      ...field,
      key: normalizeInventoryFieldKey(field.key, `field_${index + 1}`),
      label: field.label.trim(),
    }));
    const keys = normalizedFields.map((field) => field.key);
    const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
    const variantAttributes = inventoryConfigDraft.variantAttributes
      .map((attribute) => attribute.trim())
      .filter(Boolean);
    const duplicateVariantAttributes = variantAttributes.filter(
      (attribute, index) =>
        variantAttributes.findIndex((candidate) => candidate.toLowerCase() === attribute.toLowerCase()) !== index,
    );

    if (normalizedFields.length === 0) errors.push('Agrega al menos un campo de producto.');
    if (normalizedFields.some((field) => !field.label)) errors.push('Cada campo necesita una etiqueta visible.');
    if (duplicateKeys.length > 0) errors.push('Hay claves de campos duplicadas. Usa una clave unica por parametro.');
    if (variantAttributes.length === 0) errors.push('Agrega al menos un atributo para variantes.');
    if (duplicateVariantAttributes.length > 0) errors.push('Hay atributos de variante repetidos.');

    setInventoryConfigErrors(errors);
    return errors.length === 0;
  };

  const saveInventoryConfig = () => {
    if (!validateInventoryConfigDraft()) return;
    const nextConfig = normalizeInventoryConfig(inventoryConfigDraft);
    setInventoryConfigDraft(nextConfig);
    dispatch({ type: 'UPDATE_INVENTORY_CONFIG', payload: nextConfig });
    dbSync.setInventoryConfig(nextConfig);
    showNotification('Configuración de inventario guardada', 'success');
  };

  const handleInviteSent = () => {
    setInviteModalOpen(false);
    showNotification('Invitation sent successfully!', 'success');
  };

  const handleSendFeedback = () => {
    if (!feedback.trim()) return;

    const subject = encodeURIComponent('Soporte / Sugerencia - Shelf Inventory');
    const body = encodeURIComponent(feedback);
    // Reemplaza esto con tu correo real
    window.open(`mailto:soporte@tudominio.com?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');

    showNotification(t('settings.feedback.success'), 'success');
    setFeedback('');
  };

  const isAdmin = state.role === 'admin' || team.find((m) => m.email === user?.email)?.role === 'owner';

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchType, setBranchType] = useState<'sucursal' | 'bodega'>('sucursal');

  const handleAddBranch = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchAddress('');
    setBranchType('sucursal');
    setIsBranchModalOpen(true);
  };

  const handleEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchAddress(branch.address || '');
    setBranchType(branch.type || 'sucursal');
    setIsBranchModalOpen(true);
  };

  const handleDeleteBranch = (branchId: string) => {
    const hasProducts = state.products.some((p) => p.branchId === branchId && p.isActive);
    if (hasProducts) {
      showNotification(t('settings.branches.deleteErrorHasProducts'), 'error');
      return;
    }

    if (window.confirm(t('settings.branches.deleteConfirm'))) {
      dispatch({ type: 'DELETE_BRANCH', payload: branchId });
      showNotification(t('settings.branches.successDelete'), 'success');
    }
  };

  const handleSaveBranch = () => {
    if (!branchName.trim()) return;

    if (editingBranch) {
      dispatch({
        type: 'UPDATE_BRANCH',
        payload: {
          ...editingBranch,
          name: branchName.trim(),
          address: branchAddress.trim(),
          type: branchType,
        },
      });
      showNotification(t('settings.branches.successUpdate'), 'success');
    } else {
      const newBranch = {
        id: crypto.randomUUID(),
        name: branchName.trim(),
        address: branchAddress.trim(),
        type: branchType,
        isActive: true,
        createdAt: Date.now(),
      };
      dispatch({ type: 'ADD_BRANCH', payload: newBranch as Branch });
      showNotification(t('settings.branches.successAdd'), 'success');
    }
    setIsBranchModalOpen(false);
  };

  return (
    <>
      <div className="pb-10">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">{t('settings.title')}</h2>

        <div className="flex w-full min-w-0 flex-col gap-6 md:gap-8 [&>*]:w-full [&>*]:min-w-0 [&>*]:max-w-full">
          {/* General Settings */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.general.title')}</h3>
            <div className="mt-4 flex flex-col gap-3 rounded-md border border-[#F5F5DC]/10 bg-[#121212] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F5DC]/90">
                  <Languages className="h-4 w-4 text-[#4ADE80]" aria-hidden="true" />
                  Idioma
                </div>
                <p className="mt-1 text-xs text-[#F5F5DC]/60">Cambia el idioma de la interfaz desde configuracion.</p>
              </div>
              <div className="self-start sm:self-center" data-testid="settings-language-selector">
                <LanguageSelector direction="down" />
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="lowStockThreshold" className="block text-sm font-medium text-[#F5F5DC]/90">
                {t('settings.lowStockThreshold')}
              </label>
              <p className="text-xs text-[#F5F5DC]/70 mb-2">{t('settings.lowStockThresholdDescription')}</p>
              <input
                id="lowStockThreshold"
                data-testid="low-stock-input"
                type="number"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                min="0"
                className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="tablePageSize" className="block text-sm font-medium text-[#F5F5DC]/90">
                Tamaño de página de tablas
              </label>
              <p className="text-xs text-[#F5F5DC]/70 mb-2">
                Define cuántos registros se muestran por página en inventario, ventas, compras y contactos.
              </p>
              <input
                id="tablePageSize"
                data-testid="table-page-size-input"
                type="number"
                value={tablePageSize}
                onChange={(e) => setTablePageSize(Math.max(1, Number(e.target.value) || 50))}
                min="1"
                step="1"
                className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
              />
            </div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-[#4ADE80]" aria-hidden="true" />
                  <h3 className="text-xl font-bold text-[#F5F5DC]">Configuracion de articulos</h3>
                </div>
                <p className="text-xs text-[#F5F5DC]/70 mt-1">
                  Ajusta los campos del producto, los atributos de variante y las medidas sugeridas desde aquí.
                </p>
              </div>
              <button
                type="button"
                onClick={saveInventoryConfig}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F5F5DC] px-4 py-2.5 text-sm font-bold text-[#121212] min-h-[44px] hover:bg-opacity-80 active:scale-95 md:w-auto"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Guardar configuracion
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {inventoryConfigSummary.map((item) => (
                <div key={item.label} className="rounded-md border border-white/10 bg-[#121212] p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#F5F5DC]/45">{item.label}</div>
                  <div className="mt-1 text-2xl font-bold text-[#F5F5DC]">{item.value}</div>
                </div>
              ))}
            </div>

            {inventoryConfigErrors.length > 0 && (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {inventoryConfigErrors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-6">
              <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-[#F5F5DC]">Gobierno y sincronizacion</h4>
                    <p className="text-xs text-[#F5F5DC]/55">
                      Controla cómo el host aplica cambios de productos enviados por otros nodos.
                    </p>
                  </div>
                  <span className="rounded-full border border-[#F5F5DC]/15 bg-[#0f0f0f] px-3 py-1 text-xs text-[#F5F5DC]/65">
                    Historial: {inventoryConfigDraft.productHistoryLimit} cambios
                  </span>
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-[#F5F5DC]/10 bg-[#0f0f0f] p-3">
                  <input
                    type="checkbox"
                    checked={inventoryConfigDraft.autoApplyProductUpdates}
                    onChange={(event) => updateInventorySyncSetting({ autoApplyProductUpdates: event.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#4f9d69]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#F5F5DC]">
                      Aplicar actualizaciones automáticamente
                    </span>
                    <span className="mt-1 block text-xs text-[#F5F5DC]/55">
                      Si está activo, los cambios de producto con permiso se aplican sin revisión manual y se conserva
                      una versión anterior para restaurar.
                    </span>
                  </span>
                </label>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
                <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-[#F5F5DC]">Estructura de variantes</h4>
                    <p className="text-xs text-[#F5F5DC]/55">
                      Define que diferencia una variante vendible: Color, Medida o Material.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addVariantAttribute}
                    className="w-full bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-2 rounded-md text-xs hover:bg-white/5 sm:w-auto"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Atributo
                    </span>
                  </button>
                </div>
                <div className="space-y-2">
                  {inventoryConfigDraft.variantAttributes.map((attribute, index) => (
                    <div key={`${attribute}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0">
                      <input
                        value={attribute}
                        onChange={(e) => updateVariantAttribute(index, e.target.value)}
                        className="w-full min-w-0 p-2.5 bg-[#0f0f0f] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder={`Atributo ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeVariantAttribute(index)}
                        className="min-h-[44px] px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
                <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-[#F5F5DC]">Listas sugeridas</h4>
                    <p className="text-xs text-[#F5F5DC]/55">Valores rapidos para los campos de tipo medida.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addMeasureOption}
                    className="w-full bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-2 rounded-md text-xs hover:bg-white/5 sm:w-auto"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Medida
                    </span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {inventoryConfigDraft.measureOptions.map((option, index) => (
                    <div key={`${option}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0">
                      <input
                        value={option}
                        onChange={(e) => updateMeasureOption(index, e.target.value)}
                        className="w-full min-w-0 p-2.5 bg-[#0f0f0f] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder={`Medida ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeMeasureOption(index)}
                        className="min-h-[44px] px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
                <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-[#F5F5DC]">Ficha maestra del producto</h4>
                    <p className="text-xs text-[#F5F5DC]/55">
                      Campos que describen el articulo completo y aparecen al agregar inventario.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addInventoryField}
                    className="w-full bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-2 rounded-md text-xs hover:bg-white/5 sm:w-auto"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Agregar campo
                    </span>
                  </button>
                </div>
                <div className="space-y-3">
                  {inventoryConfigDraft.fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-1 gap-2 rounded-md border border-[#F5F5DC]/10 p-3 bg-[#0f0f0f] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                    >
                      <input
                        value={field.key}
                        onBlur={() => normalizeInventoryFieldAt(index)}
                        onChange={(e) => updateInventoryField(index, { key: e.target.value })}
                        className="w-full min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder="Clave"
                      />
                      <input
                        value={field.label}
                        onChange={(e) => updateInventoryField(index, { label: e.target.value })}
                        className="w-full min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder="Etiqueta"
                      />
                      <select
                        value={field.type}
                        onChange={(e) =>
                          updateInventoryField(index, { type: e.target.value as InventoryFieldDefinition['type'] })
                        }
                        className="w-full min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                      >
                        <option value="text">Texto</option>
                        <option value="color">Color</option>
                        <option value="measure">Medida</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeInventoryField(index)}
                        className="w-full px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs min-h-[44px] md:w-auto"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <P2PSyncManager />

          {/* Branches Management */}
          {isAdmin && (
            <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-[#4ADE80]" aria-hidden="true" />
                    <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.branches.title')}</h3>
                  </div>
                  <p className="text-xs text-[#F5F5DC]/70 mt-1">{t('settings.branches.description')}</p>
                </div>
                <button
                  data-testid="add-branch-button"
                  onClick={handleAddBranch}
                  className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-opacity-80 text-sm active:scale-95"
                >
                  <Plus className="h-4 w-4 inline mr-1" />
                  {t('settings.branches.add')}
                </button>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#F5F5DC]/10 text-[#F5F5DC]/50 text-xs uppercase tracking-wider">
                      <th className="py-3 px-4 font-semibold">{t('settings.branches.table.name')}</th>
                      <th className="py-3 px-4 font-semibold">{t('settings.branches.table.type')}</th>
                      <th className="py-3 px-4 font-semibold hidden md:table-cell">{t('settings.branches.table.id')}</th>
                      <th className="py-3 px-4 font-semibold">{t('settings.branches.table.createdAt')}</th>
                      <th className="py-3 px-4 font-semibold text-right">{t('settings.branches.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5DC]/10">
                    {state.branches.filter((b) => b.isActive).length > 0 ? (
                      state.branches
                        .filter((b) => b.isActive)
                        .map((branch) => (
                          <tr key={branch.id} className="text-[#F5F5DC]/90 text-sm hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4 font-medium">
                            <div>{branch.name}</div>
                            {branch.address && (
                              <div className="text-[10px] text-[#F5F5DC]/50 mt-0.5">{branch.address}</div>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-[10px] uppercase tracking-wider bg-[#F5F5DC]/10 px-2 py-0.5 rounded border border-[#F5F5DC]/20">
                              {branch.type === 'bodega'
                                ? t('settings.branches.types.bodega')
                                : t('settings.branches.types.sucursal')}
                            </span>
                          </td>
                          <td className="py-4 px-4 hidden md:table-cell">
                            <code className="text-[10px] bg-[#121212] px-1.5 py-0.5 rounded border border-[#F5F5DC]/10 text-[#F5F5DC]/40">
                              {branch.id}
                            </code>
                          </td>
                          <td className="py-4 px-4">{new Date(branch.createdAt).toLocaleDateString()}</td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleEditBranch(branch)}
                                className="p-2 text-[#4ADE80] hover:bg-[#4ADE80]/10 rounded-md transition-colors"
                                title={t('common.edit')}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteBranch(branch.id)}
                                className="p-2 text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                                title={t('common.delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-[#F5F5DC]/40 italic">
                          {t('settings.branches.empty')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DeviceManagementPanel />

          {isAdmin && <AuditLogViewer />}

          <DataRecovery />

          {/* Currency Settings */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.currency.title')}</h3>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label htmlFor="currencySymbol" className="block text-sm font-medium text-[#F5F5DC]/90">
                  {t('settings.currency.symbol')}
                </label>
                <p className="text-xs text-[#F5F5DC]/70 mb-2">{t('settings.currency.symbolDescription')}</p>
                <select
                  id="currencySymbol"
                  data-testid="currency-select"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
                >
                  {CURRENCIES.map(({ code, nameKey }) => (
                    <option key={code} value={code}>
                      {t(nameKey)} ({code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="numberFormat" className="block text-sm font-medium text-[#F5F5DC]/90">
                  {t('settings.currency.format')}
                </label>
                <p className="text-xs text-[#F5F5DC]/70 mb-2">{t('settings.currency.formatDescription')}</p>
                <select
                  id="numberFormat"
                  data-testid="number-format-select"
                  value={numberFormat}
                  onChange={(e) => setNumberFormat(e.target.value as any)}
                  className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
                >
                  <option value="en-US">1,234.56 ({t('settings.currency.formats.en-US')})</option>
                  <option value="de-DE">1.234,56 ({t('settings.currency.formats.de-DE')})</option>
                </select>
              </div>
            </div>
          </div>

          {/* Team Management */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.team.title')}</h3>
                <p className="text-xs text-[#F5F5DC]/70 mt-1">{t('settings.team.description')}</p>
              </div>
              {isPyme ? (
                <button
                  onClick={() => setInviteModalOpen(true)}
                  className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-opacity-80 text-sm active:scale-95"
                >
                  {t('settings.team.invite')}
                </button>
              ) : (
                <button
                  onClick={openSubscriptionModal}
                  className="w-full sm:w-auto bg-sky-500 text-background font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-sky-400 text-sm active:scale-95"
                >
                  {t('subscription.upgradeToPyme')}
                </button>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {team.length > 0 ? (
                team.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-md bg-background/50"
                  >
                    <span className="truncate min-w-0">{member.email}</span>
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      <span className="text-[10px] sm:text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10">
                        {member.role}
                      </span>
                      {isAdmin && member.role !== 'owner' && (
                        <button
                          onClick={() => dispatch({ type: 'DELETE_TEAM_MEMBER', payload: member.id })}
                          className="text-red-400 hover:text-red-300 text-xs p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#F5F5DC]/50 text-center py-2 italic">
                  {t('settings.team.noMembers') || 'No team members added yet.'}
                </p>
              )}
            </div>
          </div>

          {/* AI Settings */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">🤖 {t('settings.ai.title') || 'Configuración de IA'}</h3>
            <p className="text-xs text-[#F5F5DC]/70 mt-1 mb-4">
              {t('settings.ai.description') || 'Configura tus propias llaves para el asistente de IA.'}
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="geminiApiKey" className="block text-sm font-medium text-[#F5F5DC]/90">
                    Gemini API Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="text-xs text-[#F5F5DC]/60 hover:text-[#F5F5DC]"
                  >
                    {showGeminiKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <input
                  id="geminiApiKey"
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="openCodeGoKey" className="block text-sm font-medium text-[#F5F5DC]/90">
                    OpenCodeGo Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowOpenCodeGoKey(!showOpenCodeGoKey)}
                    className="text-xs text-[#F5F5DC]/60 hover:text-[#F5F5DC]"
                  >
                    {showOpenCodeGoKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <input
                  id="openCodeGoKey"
                  type={showOpenCodeGoKey ? 'text' : 'password'}
                  value={openCodeGoKey}
                  onChange={(e) => setOpenCodeGoKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC] mb-3"
                />

                <label htmlFor="openCodeGoModel" className="block text-sm font-medium text-[#F5F5DC]/90">
                  Modelo de OpenCodeGo
                </label>
                <input
                  id="openCodeGoModel"
                  type="text"
                  value={openCodeGoModel}
                  onChange={(e) => setOpenCodeGoModel(e.target.value)}
                  placeholder="ej. deepseek-v4-flash, gpt-4o"
                  className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
                />
              </div>

              <div>
                <label htmlFor="aiProxyUrl" className="block text-sm font-medium text-[#F5F5DC]/90">
                  {t('settings.ai.proxyUrl') || 'URL del Proxy Local (Opcional)'}
                </label>
                <input
                  id="aiProxyUrl"
                  type="text"
                  value={aiProxyUrl}
                  onChange={(e) => setAiProxyUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
                />
              </div>
            </div>
          </div>

          {/* Feedback and Support */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.feedback.title')}</h3>
            <p className="text-xs text-[#F5F5DC]/70 mt-1 mb-4">{t('settings.feedback.description')}</p>
            <textarea
              data-testid="feedback-textarea"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t('settings.feedback.placeholder')}
              className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 min-h-[100px] focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
            />
            <button
              data-testid="feedback-submit-button"
              onClick={handleSendFeedback}
              disabled={!feedback.trim()}
              className="w-full mt-2 text-sm bg-foreground/90 text-background font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-foreground transition-colors active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
            >
              {t('settings.feedback.button')}
            </button>
          </div>

          {/* App Lock Settings */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#4ADE80]" aria-hidden="true" />
              <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.security.title') || 'Seguridad'}</h3>
            </div>
            <p className="text-xs text-[#F5F5DC]/70 mt-1 mb-4">
              Configura una contraseña, PIN o huella digital para proteger el acceso al inventario.
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label className="block text-sm font-medium text-[#F5F5DC]/90">
                      Contraseña o PIN de la aplicación
                    </label>
                    <p className="text-xs text-[#F5F5DC]/60">
                      {hasAppLock ? 'Protegido con contraseña/PIN' : 'Sin contraseña local'}
                    </p>
                  </div>
                  {hasAppLock && (
                    <button
                      data-testid="disable-app-lock-button"
                      onClick={() => setAppLock(null)}
                      className="text-sm font-bold text-red-400 hover:text-red-300 transition-colors"
                    >
                      {t('settings.security.disable') || 'Desactivar'}
                    </button>
                  )}
                </div>

                {!hasAppLock ? (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      data-testid="new-app-lock-input"
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="Nueva contraseña o PIN"
                      className="min-w-0 flex-1 p-2.5 bg-[#0f0f0f] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
                    />
                    <button
                      data-testid="enable-app-lock-button"
                      onClick={async () => {
                        if (newPin.length >= 4) {
                          await setAppLock(newPin);
                          setNewPin('');
                          showNotification('Contraseña de acceso configurada correctamente', 'success');
                        } else {
                          showNotification('La contraseña o PIN debe tener al menos 4 caracteres', 'error');
                        }
                      }}
                      className="bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-opacity-80 transition-all text-sm"
                    >
                      {t('settings.security.enable') || 'Activar'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 p-3 bg-[#F5F5DC]/5 rounded-lg border border-[#F5F5DC]/10">
                    <p className="text-xs text-[#F5F5DC]/60 italic">
                      {t('settings.security.lockedNote') || 'La aplicación se bloqueará automáticamente al recargar.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-[#4ADE80]" aria-hidden="true" />
                      <label className="block text-sm font-medium text-[#F5F5DC]/90">Huella digital</label>
                    </div>
                    <p className="mt-1 text-xs text-[#F5F5DC]/60">
                      {biometricsSupported
                        ? hasBiometricLock
                          ? 'Huella habilitada para desbloquear la aplicación.'
                          : 'Usa el autenticador biométrico del dispositivo.'
                        : 'Este navegador o dispositivo no reporta biometría disponible.'}
                    </p>
                  </div>
                  <button
                    data-testid="toggle-biometric-lock-button"
                    disabled={!biometricsSupported}
                    onClick={async () => {
                      await setBiometricLock(!hasBiometricLock);
                      showNotification(
                        !hasBiometricLock ? 'Huella digital activada' : 'Huella digital desactivada',
                        'success',
                      );
                    }}
                    className="bg-transparent border border-[#F5F5DC]/30 text-[#F5F5DC] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-[#F5F5DC]/10 transition-all text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasBiometricLock ? 'Desactivar huella' : 'Activar huella'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Data Management */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.data.title')}</h3>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Import */}
              <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-foreground/20">
                <h4 className="font-bold text-[#F5F5DC]">{t('settings.import.button')}</h4>
                <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.import.cardDescription')}</p>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="w-full mt-2 text-sm bg-transparent border border-foreground/50 font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-foreground/10 transition-colors active:scale-95"
                >
                  {t('settings.import.button')}
                </button>
              </div>

              {/* Backup */}
              <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-foreground/20">
                <h4 className="font-bold text-[#F5F5DC]">{t('settings.backup.button')}</h4>
                <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.backup.description')}</p>
                <button
                  onClick={handleCreateBackup}
                  className="w-full mt-2 text-sm bg-transparent border border-foreground/50 font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-foreground/10 transition-colors active:scale-95"
                >
                  {t('settings.backup.button')}
                </button>
              </div>

              {/* Restore */}
              <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-foreground/20">
                <h4 className="font-bold text-[#F5F5DC]">{t('settings.restore.button')}</h4>
                <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.restore.description')}</p>
                <input
                  type="file"
                  accept="application/json"
                  ref={fileInputRef}
                  onChange={handleRestoreChange}
                  className="hidden"
                  id="restore-file-input"
                />
                <label
                  htmlFor="restore-file-input"
                  className="w-full mt-2 cursor-pointer text-center text-sm bg-transparent border border-foreground/50 font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-foreground/10 transition-colors active:scale-95"
                >
                  {t('settings.restore.button')}
                </label>
              </div>

              {/* Reset */}
              <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-red-500/30">
                <h4 className="font-bold text-red-400">{t('settings.reset.button')}</h4>
                <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.reset.description')}</p>
                <button
                  onClick={handleResetData}
                  className="w-full mt-2 text-sm bg-transparent border border-red-500/50 text-red-400 font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-red-500/10 transition-colors active:scale-95"
                >
                  {t('settings.reset.button')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {isImportModalOpen && <ImportCSVModal onClose={() => setIsImportModalOpen(false)} />}
      {isInviteModalOpen && (
        <InviteMemberModal onClose={() => setInviteModalOpen(false)} onInviteSent={handleInviteSent} />
      )}

      {isBranchModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#F5F5DC] mb-4">
                {editingBranch ? t('settings.branches.edit') : t('settings.branches.new')}
              </h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="branch-name" className="block text-sm font-medium text-[#F5F5DC]/70 mb-1">
                    {t('settings.branches.nameLabel')}
                  </label>
                  <input
                    id="branch-name"
                    data-testid="branch-name-input"
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder={t('settings.branches.namePlaceholder')}
                    className="w-full p-3 bg-[#121212] border border-[#F5F5DC]/20 rounded-lg text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#4ADE80]/50 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="branch-address" className="block text-sm font-medium text-[#F5F5DC]/70 mb-1">
                    {t('settings.branches.addressLabel')}
                  </label>
                  <input
                    id="branch-address"
                    data-testid="branch-address-input"
                    type="text"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    placeholder={t('settings.branches.addressPlaceholder')}
                    className="w-full p-3 bg-[#121212] border border-[#F5F5DC]/20 rounded-lg text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#4ADE80]/50 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="branch-type" className="block text-sm font-medium text-[#F5F5DC]/70 mb-1">
                    {t('settings.branches.typeLabel')}
                  </label>
                  <select
                    id="branch-type"
                    data-testid="branch-type-select"
                    value={branchType}
                    onChange={(e) => setBranchType(e.target.value as 'sucursal' | 'bodega')}
                    className="w-full p-3 bg-[#121212] border border-[#F5F5DC]/20 rounded-lg text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#4ADE80]/50 transition-all"
                  >
                    <option value="sucursal">{t('settings.branches.types.sucursal')}</option>
                    <option value="bodega">{t('settings.branches.types.bodega')}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setIsBranchModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-[#F5F5DC]/20 text-[#F5F5DC]/70 rounded-lg font-bold hover:bg-white/5 transition-all active:scale-95"
                >
                  {t('common.cancel')}
                </button>
                <button
                  data-testid="save-branch-button"
                  onClick={handleSaveBranch}
                  disabled={!branchName.trim()}
                  className="flex-1 px-4 py-3 bg-[#F5F5DC] text-[#121212] rounded-lg font-bold hover:bg-opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingBranch ? t('common.save') : t('settings.branches.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Settings;
