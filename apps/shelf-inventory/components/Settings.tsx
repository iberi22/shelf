import type { InventoryConfig, InventoryFieldDefinition, RestoreStatePayload } from 'p2p-mesh-core';
import { dbSync, decryptData, deriveKey, encryptData, getSessionKey } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import useLocalStorage from '../hooks/useLocalStorage';
import { createInventoryField, DEFAULT_INVENTORY_CONFIG, normalizeInventoryConfig } from '../lib/inventoryConfig';
import AuditLogViewer from './AuditLogViewer';
import DataRecovery from './DataRecovery';
import DeviceManagementPanel from './DeviceManagementPanel';
import ImportCSVModal from './ImportCSVModal';
import InviteMemberModal from './InviteMemberModal';
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

  const { isPyme } = useSubscription();
  const { user, hasAppLock, setAppLock } = useAuth();
  const [newPin, setNewPin] = useState('');

  useEffect(() => {
    setInventoryConfigDraft(normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG));
  }, [state.inventoryConfig]);

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

  const saveInventoryConfig = () => {
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
    window.location.href = `mailto:soporte@tudominio.com?subject=${subject}&body=${body}`;

    showNotification(t('settings.feedback.success'), 'success');
    setFeedback('');
  };

  const isAdmin = state.role === 'admin' || team.find((m) => m.email === user?.email)?.role === 'owner';

  return (
    <>
      <div className="pb-10">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">{t('settings.title')}</h2>

        <div className="flex flex-col gap-6 md:gap-8 min-w-0">
          {/* General Settings */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.general.title')}</h3>
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
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#F5F5DC]">Configuración de inventario</h3>
                <p className="text-xs text-[#F5F5DC]/70 mt-1">
                  Ajusta los campos del producto, los atributos de variante y las medidas sugeridas desde aquí.
                </p>
              </div>
              <button
                type="button"
                onClick={saveInventoryConfig}
                className="w-full md:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-opacity-80 text-sm active:scale-95"
              >
                Guardar configuración
              </button>
            </div>

            <div className="mt-5 space-y-6">
              <div className="rounded-lg border border-white/5 bg-[#121212] p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="font-semibold text-[#F5F5DC]">Atributos de variante</h4>
                    <p className="text-xs text-[#F5F5DC]/55">Ejemplo: Color, Medida, Material.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addVariantAttribute}
                    className="bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-1.5 rounded-md text-xs hover:bg-white/5"
                  >
                    + Agregar más
                  </button>
                </div>
                <div className="space-y-2">
                  {inventoryConfigDraft.variantAttributes.map((attribute, index) => (
                    <div key={`${attribute}-${index}`} className="flex gap-2">
                      <input
                        value={attribute}
                        onChange={(e) => updateVariantAttribute(index, e.target.value)}
                        className="flex-1 p-2.5 bg-[#0f0f0f] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder={`Atributo ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeVariantAttribute(index)}
                        className="px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#121212] p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="font-semibold text-[#F5F5DC]">Medidas sugeridas</h4>
                    <p className="text-xs text-[#F5F5DC]/55">Se muestran como botones rápidos al editar productos.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addMeasureOption}
                    className="bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-1.5 rounded-md text-xs hover:bg-white/5"
                  >
                    + Agregar más
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {inventoryConfigDraft.measureOptions.map((option, index) => (
                    <div key={`${option}-${index}`} className="flex gap-2">
                      <input
                        value={option}
                        onChange={(e) => updateMeasureOption(index, e.target.value)}
                        className="flex-1 p-2.5 bg-[#0f0f0f] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder={`Medida ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeMeasureOption(index)}
                        className="px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#121212] p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="font-semibold text-[#F5F5DC]">Campos del producto</h4>
                    <p className="text-xs text-[#F5F5DC]/55">Puedes cambiar nombre, tipo y agregar nuevos campos.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addInventoryField}
                    className="bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-1.5 rounded-md text-xs hover:bg-white/5"
                  >
                    + Agregar campo
                  </button>
                </div>
                <div className="space-y-3">
                  {inventoryConfigDraft.fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center rounded-md border border-[#F5F5DC]/10 p-3 bg-[#0f0f0f]"
                    >
                      <input
                        value={field.key}
                        onChange={(e) => updateInventoryField(index, { key: e.target.value })}
                        className="w-full p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder="Clave"
                      />
                      <input
                        value={field.label}
                        onChange={(e) => updateInventoryField(index, { label: e.target.value })}
                        className="w-full p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                        placeholder="Etiqueta"
                      />
                      <select
                        value={field.type}
                        onChange={(e) =>
                          updateInventoryField(index, { type: e.target.value as InventoryFieldDefinition['type'] })
                        }
                        className="w-full p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                      >
                        <option value="text">Texto</option>
                        <option value="color">Color</option>
                        <option value="measure">Medida</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeInventoryField(index)}
                        className="px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs min-h-[44px]"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <P2PSyncManager />

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
            <h3 className="text-xl font-bold text-[#F5F5DC]">🔒 {t('settings.security.title') || 'Seguridad'}</h3>
            <p className="text-xs text-[#F5F5DC]/70 mt-1 mb-4">
              {t('settings.security.description') || 'Configura un PIN para proteger el acceso a la aplicación.'}
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-[#F5F5DC]/90">
                    {t('settings.security.appLock') || 'Bloqueo de Aplicación'}
                  </label>
                  <p className="text-xs text-[#F5F5DC]/60">{hasAppLock ? 'Protegido con PIN' : 'Sin protección'}</p>
                </div>
                {hasAppLock && (
                  <button
                    onClick={() => setAppLock(null)}
                    className="text-sm font-bold text-red-400 hover:text-red-300 transition-colors"
                  >
                    {t('settings.security.disable') || 'Desactivar'}
                  </button>
                )}
              </div>

              {!hasAppLock ? (
                <div className="flex gap-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Nuevo PIN (ej. 1234)"
                    className="flex-1 p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
                  />
                  <button
                    onClick={async () => {
                      if (newPin.length >= 4) {
                        await setAppLock(newPin);
                        setNewPin('');
                        showNotification('PIN configurado correctamente', 'success');
                      } else {
                        showNotification('El PIN debe tener al menos 4 dígitos', 'error');
                      }
                    }}
                    className="bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-opacity-80 transition-all text-sm"
                  >
                    {t('settings.security.enable') || 'Activar'}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-[#F5F5DC]/5 rounded-lg border border-[#F5F5DC]/10">
                  <p className="text-xs text-[#F5F5DC]/60 italic">
                    {t('settings.security.lockedNote') || 'La aplicación se bloqueará automáticamente al recargar.'}
                  </p>
                </div>
              )}
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
    </>
  );
};

export default Settings;
