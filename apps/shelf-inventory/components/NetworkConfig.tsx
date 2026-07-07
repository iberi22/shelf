import { Fingerprint, Languages, Lock } from 'lucide-react';
import type { RestoreStatePayload } from 'p2p-mesh-core';
import { decryptData, deriveKey, encryptData, getSessionKey } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import useLocalStorage from '../hooks/useLocalStorage';
import { isBiometricsSupported } from '../lib/webauthn';
import AuditLogViewer from './AuditLogViewer';
import DataRecovery from './DataRecovery';
import DeviceManagementPanel from './DeviceManagementPanel';
import ImportCSVModal from './ImportCSVModal';
import InviteMemberModal from './InviteMemberModal';
import LanguageSelector from './LanguageSelector';

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

const NetworkConfig: React.FC = () => {
  const { t } = useI18n();
  const {
    features,
    metadata: featuresMetadata,
    overrides,
    isEnabled: isFeatureEnabled,
    toggleFeature,
    resetOverrides,
  } = useFeatureFlags();
  const { state, dispatch } = useAppContext();
  const { showNotification, openSubscriptionModal } = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [lowStockThreshold, setLowStockThreshold] = useLocalStorage('lowStockThreshold', 5);
  const [tablePageSize, setTablePageSize] = useLocalStorage('tablePageSize', 50);
  const [useLocalOcr, setUseLocalOcr] = useLocalStorage('useLocalOcr', true);
  const [geminiApiKey, setGeminiApiKey] = useLocalStorage('geminiApiKey', '');
  const [openCodeGoKey, setOpenCodeGoKey] = useLocalStorage('openCodeGoKey', '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenCodeGoKey, setShowOpenCodeGoKey] = useState(false);
  const [openCodeGoModel, setOpenCodeGoModel] = useLocalStorage('openCodeGoModel', 'gpt-4o');
  const [aiProxyUrl, setAiProxyUrl] = useLocalStorage('aiProxyUrl', '');
  const [aiEngine, setAiEngine] = useLocalStorage<'auto' | 'local' | 'gemini' | 'nano'>('aiEngine', 'auto');
  const [localAiModel, setLocalAiModel] = useLocalStorage('localAiModel', 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  const { currencyCode, setCurrencyCode, numberFormat, setNumberFormat } = useCurrency();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const { isPyme } = useSubscription();
  const { user, hasAppLock, hasBiometricLock, setAppLock, setBiometricLock } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [biometricsSupported, setBiometricsSupported] = useState(false);

  const team = useMemo(
    () => [{ id: 'owner', email: user?.email ?? 'owner@example.com', role: 'owner' as const }, ...state.teamMembers],
    [user?.email, state.teamMembers],
  );

  const isAdmin = state.role === 'admin' || team.find((m) => m.email === user?.email)?.role === 'owner';

  useEffect(() => {
    isBiometricsSupported()
      .then(setBiometricsSupported)
      .catch(() => setBiometricsSupported(false));
  }, []);

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

  const handleInviteSent = () => {
    setInviteModalOpen(false);
    showNotification('Invitation sent successfully!', 'success');
  };

  const handleSendFeedback = () => {
    if (!feedback.trim()) return;

    const subject = encodeURIComponent('Soporte / Sugerencia - Shelf Inventory');
    const body = encodeURIComponent(feedback);
    window.open(`mailto:soporte@tudominio.com?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');

    showNotification(t('settings.feedback.success'), 'success');
    setFeedback('');
  };

  return (
    <>
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
        <h3 className="text-xl font-bold text-[#F5F5DC]">🤖 {t('settings.ai.title')}</h3>
        <p className="text-xs text-[#F5F5DC]/70 mt-1 mb-4">{t('settings.ai.description')}</p>

        <div className="space-y-4">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-[#F5F5DC]/90">OCR de Facturas Local</label>
                <p className="mt-1 text-xs text-[#F5F5DC]/60">
                  Usa Tesseract.js para procesar facturas 100% offline. Si está desactivado, se usará la API de Gemini
                  (requiere internet y API Key).
                </p>
              </div>
              <button
                onClick={() => setUseLocalOcr(!useLocalOcr)}
                className={`bg-transparent border border-[#F5F5DC]/30 text-[#F5F5DC] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-[#F5F5DC]/10 transition-all text-sm ${useLocalOcr ? 'bg-[#4ADE80]/10 border-[#4ADE80]/30' : ''}`}
              >
                {useLocalOcr ? 'Local (Activado)' : 'Cloud (Gemini)'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="aiEngine" className="block text-sm font-medium text-[#F5F5DC]/90 mb-1">
              {t('settings.ai.engine')}
            </label>
            <select
              id="aiEngine"
              value={aiEngine}
              onChange={(e) => setAiEngine(e.target.value as any)}
              className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
            >
              <option value="auto">{t('settings.ai.engineAuto')}</option>
              <option value="local">{t('settings.ai.engineLocal')}</option>
              <option value="gemini">{t('settings.ai.engineGemini')}</option>
              <option value="nano">{t('settings.ai.engineNano')}</option>
            </select>
          </div>

          {aiEngine === 'local' && (
            <div>
              <label htmlFor="localAiModel" className="block text-sm font-medium text-[#F5F5DC]/90 mb-1">
                {t('settings.ai.localModel')}
              </label>
              <select
                id="localAiModel"
                value={localAiModel}
                onChange={(e) => setLocalAiModel(e.target.value)}
                className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
              >
                <option value="Phi-3-mini-4k-instruct-q4f16_1-MLC">{t('settings.ai.modelSmall')}</option>
                <option value="Qwen2.5-1.5B-Instruct-q4f16_1-MLC">{t('settings.ai.modelMedium')}</option>
                <option value="Llama-3-8B-Instruct-q4f16_1-MLC">Large (Llama 3 8B - Heavy)</option>
              </select>
              <p className="mt-2 text-[10px] text-[#F5F5DC]/50 italic">
                * Los modelos locales se descargan al navegador y pueden ocupar entre 1GB y 5GB.
              </p>
            </div>
          )}

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
              {t('settings.ai.proxyUrl')}
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
                <label className="block text-sm font-medium text-[#F5F5DC]/90">Contraseña o PIN de la aplicación</label>
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

      {/* Feature Flags / Control de Funcionalidades */}
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-bold text-[#F5F5DC]">Control de Funcionalidades (GitCore)</h3>
            <p className="text-xs text-[#F5F5DC]/70 mt-1">
              Protocolo: v{featuresMetadata.protocol_version} | Proyecto: {featuresMetadata.project_display} v
              {featuresMetadata.version}
            </p>
          </div>
          {Object.keys(overrides).length > 0 && (
            <button
              onClick={resetOverrides}
              className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold py-1 px-3 border border-red-500/30 rounded transition-all cursor-pointer"
            >
              Restablecer
            </button>
          )}
        </div>

        <div className="bg-background/30 rounded-lg p-3 mb-4 text-xs text-[#F5F5DC]/70 border border-[#F5F5DC]/10 flex flex-col md:flex-row md:justify-around gap-2 text-center">
          <div>
            Progreso: <strong>{featuresMetadata.implementation_percentage}%</strong>
          </div>
          <div>
            Implementadas:{' '}
            <strong>
              {featuresMetadata.features_implemented}/{featuresMetadata.total_features}
            </strong>
          </div>
          <div>
            Última actualización: <strong>{featuresMetadata.updated}</strong>
          </div>
          <div>
            Modo:{' '}
            <strong className={import.meta.env.DEV ? 'text-yellow-400' : 'text-green-400'}>
              {import.meta.env.DEV ? 'Desarrollo (Sync Disco)' : 'Producción (Overrides)'}
            </strong>
          </div>
        </div>

        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {features.map((feature) => {
            const enabled = isFeatureEnabled(feature.id);
            const hasOverride = overrides[feature.id] !== undefined;

            return (
              <div
                key={feature.id}
                className={`flex items-start justify-between p-3 rounded-lg border transition-all ${
                  enabled ? 'bg-[#4ADE80]/5 border-[#4ADE80]/20' : 'bg-[#ef4444]/5 border-[#ef4444]/10 opacity-70'
                }`}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold bg-[#121212] px-1.5 py-0.5 rounded border border-[#F5F5DC]/10 text-[#F5F5DC]/80">
                      {feature.id}
                    </span>
                    <h4 className="font-bold text-sm text-[#F5F5DC] truncate">{feature.name}</h4>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-background/50 text-[#F5F5DC]/60">
                      {feature.category}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        feature.priority === 'P0'
                          ? 'bg-red-500/20 text-red-400'
                          : feature.priority === 'P1'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {feature.priority}
                    </span>
                    {hasOverride && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 animate-pulse">
                        Override
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#F5F5DC]/60 mt-1.5 leading-relaxed">{feature.description}</p>
                  {feature.technologies && feature.technologies.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {feature.technologies.map((tech) => (
                        <span
                          key={tech}
                          className="text-[10px] text-[#F5F5DC]/40 bg-[#121212]/30 px-1 py-0.2 rounded border border-[#F5F5DC]/5"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center pt-1">
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleFeature(feature.id)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#121212] border border-[#F5F5DC]/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600 peer-checked:after:bg-[#121212] peer-checked:after:border-[#121212]"></div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isImportModalOpen && <ImportCSVModal onClose={() => setIsImportModalOpen(false)} />}
      {isInviteModalOpen && (
        <InviteMemberModal onClose={() => setInviteModalOpen(false)} onInviteSent={handleInviteSent} />
      )}
    </>
  );
};

export default NetworkConfig;
