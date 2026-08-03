import { Bot, Coins, Database, Fingerprint, Languages, Lock, MessageSquare, Users } from 'lucide-react';
import type { RestoreStatePayload } from 'p2p-mesh-core';
import { canInvite, decryptData, deriveKey, encryptData, getSessionKey } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import useLocalStorage from '../hooks/useLocalStorage';
import useXavierMemory from '../hooks/useXavierMemory';
import { isBiometricsSupported } from '../lib/webauthn';
import CollapsibleCard from './CollapsibleCard';
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
  const { state, dispatch } = useAppContext();
  const { showNotification } = useUI();
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
  const [aiEngine, setAiEngine] = useLocalStorage<'auto' | 'cloud' | 'local' | 'gemini' | 'nano'>('aiEngine', 'auto');
  const [localAiModel, setLocalAiModel] = useLocalStorage('localAiModel', 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  const { currencyCode, setCurrencyCode, numberFormat, setNumberFormat } = useCurrency();

  const { add: xavierAddMem } = useXavierMemory();

  useEffect(() => {
    const prefs = {
      lowStockThreshold,
      tablePageSize,
      useLocalOcr,
      currencyCode,
      numberFormat,
      updatedAt: new Date().toISOString(),
    };
    void xavierAddMem('user/preferences', JSON.stringify(prefs));
  }, [lowStockThreshold, tablePageSize, useLocalOcr, currencyCode, numberFormat, xavierAddMem]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const { user, hasAppLock, hasBiometricLock, setAppLock, setBiometricLock } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [biometricsSupported, setBiometricsSupported] = useState(false);

  const team = useMemo(
    () => [{ id: 'owner', email: user?.email ?? 'owner@example.com', role: 'owner' as const }, ...state.teamMembers],
    [user?.email, state.teamMembers],
  );

  const isAdmin = state.role === 'admin' || team.find((m) => m.email === user?.email)?.role === 'owner';
  const mayInvite = canInvite(state.role, state.permissions) || isAdmin;

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
    <div className="flex w-full flex-col gap-6 md:gap-8">
      {/* General Settings */}
      <CollapsibleCard
        title={t('settings.general.title')}
        icon={<Languages className="h-5 w-5" />}
        testId="settings-general-card"
      >
        <div className="flex flex-col gap-3 rounded-md border border-[#F5F5DC]/10 bg-[#121212] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F5DC]/90">
              <Languages className="h-4 w-4 text-[#4ADE80]" aria-hidden="true" />
              {t('settings.language') || t('common.language') || 'Language'}
            </div>
            <p className="mt-1 text-xs text-[#F5F5DC]/60">{t('settings.languageDescription')}</p>
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
            className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
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
            className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
          />
        </div>
      </CollapsibleCard>

      {/* Currency Settings */}
      <CollapsibleCard
        title={t('settings.currency.title')}
        icon={<Coins className="h-5 w-5" />}
        testId="settings-currency-card"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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
              className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
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
              className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
            >
              <option value="en-US">1,234.56 ({t('settings.currency.formats.en-US')})</option>
              <option value="de-DE">1.234,56 ({t('settings.currency.formats.de-DE')})</option>
            </select>
          </div>
        </div>
      </CollapsibleCard>

      {/* Team Management */}
      <CollapsibleCard
        title={t('settings.team.title')}
        description={t('settings.team.description')}
        icon={<Users className="h-5 w-5" />}
        testId="settings-team-card"
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <span className="text-xs text-[#F5F5DC]/70">{t('settings.team.description')}</span>
          {mayInvite && (
            <button
              type="button"
              data-testid="invite-member-button"
              onClick={() => setInviteModalOpen(true)}
              className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-opacity-80 text-sm active:scale-95 cursor-pointer"
            >
              {t('settings.team.invite')}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {team.length > 0 ? (
            team.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-md bg-background/50 border border-[#F5F5DC]/5"
              >
                <span className="truncate min-w-0">{member.email}</span>
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                  <span className="text-[10px] sm:text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10">
                    {(() => {
                      const displayRole = member.role === 'member' ? 'collaborator' : member.role;
                      return t(`settings.team.roles.${displayRole}`) || displayRole;
                    })()}
                  </span>
                  {isAdmin && member.role !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'DELETE_TEAM_MEMBER', payload: member.id })}
                      className="text-red-400 hover:text-red-300 text-xs p-1 cursor-pointer"
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
      </CollapsibleCard>

      {/* AI Settings */}
      <CollapsibleCard
        title={`🤖 ${t('settings.ai.title')}`}
        description={t('settings.ai.description')}
        icon={<Bot className="h-5 w-5" />}
        testId="settings-ai-card"
      >
        <div className="space-y-4">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-[#F5F5DC]/90">
                  {t('settings.ai.localOcrTitle') || 'Local invoice OCR'}
                </label>
                <p className="mt-1 text-xs text-[#F5F5DC]/60">
                  {t('settings.ai.localOcrDescription') ||
                    'Use Tesseract.js for 100% offline invoice OCR. When off, Gemini API is used (requires internet and API key).'}
                </p>
              </div>
              <button
                type="button"
                data-testid="toggle-local-ocr"
                onClick={() => setUseLocalOcr(!useLocalOcr)}
                className={`bg-transparent border border-[#F5F5DC]/30 text-[#F5F5DC] font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-[#F5F5DC]/10 transition-all text-sm cursor-pointer ${useLocalOcr ? 'bg-[#4ADE80]/10 border-[#4ADE80]/30' : ''}`}
              >
                {useLocalOcr
                  ? t('settings.ai.localOcrOn') || 'Local (On)'
                  : t('settings.ai.localOcrOff') || 'Cloud (Gemini)'}
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
              <option value="cloud">{t('settings.ai.engineCloud') || 'SWAL AI / OpenRouter (Cloud)'}</option>
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
                className="text-xs text-[#F5F5DC]/60 hover:text-[#F5F5DC] cursor-pointer"
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
                className="text-xs text-[#F5F5DC]/60 hover:text-[#F5F5DC] cursor-pointer"
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
      </CollapsibleCard>

      {/* Feedback and Support */}
      <CollapsibleCard
        title={t('settings.feedback.title')}
        description={t('settings.feedback.description')}
        icon={<MessageSquare className="h-5 w-5" />}
        testId="settings-feedback-card"
      >
        <textarea
          data-testid="feedback-textarea"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t('settings.feedback.placeholder')}
          className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 min-h-[100px] focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
        />
        <button
          type="button"
          data-testid="feedback-submit-button"
          onClick={handleSendFeedback}
          disabled={!feedback.trim()}
          className="w-full mt-2 text-sm bg-foreground/90 text-background font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-foreground transition-colors active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {t('settings.feedback.button')}
        </button>
      </CollapsibleCard>

      {/* App Lock Settings / Security */}
      <CollapsibleCard
        title={t('settings.security.title') || 'Seguridad'}
        description="Configura una contraseña, PIN o huella digital para proteger el acceso al inventario."
        icon={<Lock className="h-5 w-5" />}
        testId="settings-security-card"
      >
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
                  type="button"
                  data-testid="disable-app-lock-button"
                  onClick={() => setAppLock(null)}
                  className="text-sm font-bold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
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
                  type="button"
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
                  className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-opacity-80 transition-all text-sm cursor-pointer"
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
                type="button"
                data-testid="toggle-biometric-lock-button"
                disabled={!biometricsSupported}
                onClick={async () => {
                  await setBiometricLock(!hasBiometricLock);
                  showNotification(
                    !hasBiometricLock ? 'Huella digital activada' : 'Huella digital desactivada',
                    'success',
                  );
                }}
                className="bg-transparent border border-[#F5F5DC]/30 text-[#F5F5DC] font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-[#F5F5DC]/10 transition-all text-sm disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {hasBiometricLock ? 'Desactivar huella' : 'Activar huella'}
              </button>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Data Management */}
      <CollapsibleCard
        title={t('settings.data.title')}
        icon={<Database className="h-5 w-5" />}
        testId="settings-data-card"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Import */}
          <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-[#F5F5DC]/20">
            <h4 className="font-bold text-[#F5F5DC]">{t('settings.import.button')}</h4>
            <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.import.cardDescription')}</p>
            <button
              type="button"
              data-testid="open-import-csv-button"
              onClick={() => setIsImportModalOpen(true)}
              className="w-full mt-2 text-sm bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-[#F5F5DC]/10 transition-colors active:scale-95 cursor-pointer"
            >
              {t('settings.import.button')}
            </button>
          </div>

          {/* Backup */}
          <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-[#F5F5DC]/20">
            <h4 className="font-bold text-[#F5F5DC]">{t('settings.backup.button')}</h4>
            <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.backup.description')}</p>
            <button
              type="button"
              onClick={handleCreateBackup}
              className="w-full mt-2 text-sm bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-[#F5F5DC]/10 transition-colors active:scale-95 cursor-pointer"
            >
              {t('settings.backup.button')}
            </button>
          </div>

          {/* Restore */}
          <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-[#F5F5DC]/20">
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
              className="w-full mt-2 cursor-pointer text-center text-sm bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-[#F5F5DC]/10 transition-colors active:scale-95 inline-flex items-center justify-center font-bold"
            >
              {t('settings.restore.button')}
            </label>
          </div>

          {/* Reset */}
          <div className="flex min-w-0 flex-col gap-2 p-4 rounded-md bg-background/50 border border-red-500/30">
            <h4 className="font-bold text-red-400">{t('settings.reset.button')}</h4>
            <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.reset.description')}</p>
            <button
              type="button"
              onClick={handleResetData}
              className="w-full mt-2 text-sm bg-transparent border border-red-500/50 text-red-400 font-bold py-2 px-4 rounded-lg min-h-[40px] hover:bg-red-500/10 transition-colors active:scale-95 cursor-pointer"
            >
              {t('settings.reset.button')}
            </button>
          </div>
        </div>
      </CollapsibleCard>

      {isImportModalOpen && <ImportCSVModal onClose={() => setIsImportModalOpen(false)} />}
      {isInviteModalOpen && (
        <InviteMemberModal onClose={() => setInviteModalOpen(false)} onInviteSent={handleInviteSent} />
      )}
    </div>
  );
};

export default NetworkConfig;
