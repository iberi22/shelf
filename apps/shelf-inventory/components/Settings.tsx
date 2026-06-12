import type { RestoreStatePayload, TeamMember } from 'p2p-mesh-core';
import type React from 'react';
import { useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import useLocalStorage from '../hooks/useLocalStorage';
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

  const { isPyme } = useSubscription();
  const { user, hasAppLock, setAppLock } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [googleClientId, setGoogleClientId] = useLocalStorage('googleClientId', '');

  const { uploadBackup, downloadBackup, isLoading: isDriveLoading } = useGoogleDrive(googleClientId);

  const team = [
    { id: 'owner', email: user?.email ?? 'owner@example.com', role: 'owner' as const },
    ...state.teamMembers,
  ];

  const handleCreateBackup = () => {
    const backupData = JSON.stringify(state, null, 2);
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shelf_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification(t('settings.backup.success'), 'success');
  };

  const handleRestoreChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('File content is not readable');
        const parsedData = JSON.parse(text);

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
        showNotification(message, 'error');
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

  const handleDriveBackup = async () => {
    if (!googleClientId) {
      showNotification('Por favor, configura tu Google Client ID primero.', 'error');
      return;
    }
    const success = await uploadBackup(state);
    if (success) {
      showNotification('Respaldo en Google Drive exitoso', 'success');
    } else {
      showNotification('Error al respaldar en Google Drive', 'error');
    }
  };

  const handleDriveRestore = async () => {
    if (!googleClientId) {
      showNotification('Por favor, configura tu Google Client ID primero.', 'error');
      return;
    }
    const data = await downloadBackup();
    if (data) {
      if (window.confirm(t('settings.restore.confirmation'))) {
        dispatch({ type: 'RESTORE_STATE', payload: data as RestoreStatePayload });
        showNotification(t('settings.restore.success'), 'success');
      }
    } else {
      showNotification('No se encontró respaldo en Google Drive', 'error');
    }
  };

  const handleInviteSent = () => {
    setInviteModalOpen(false);
    showNotification('Invitation sent successfully!', 'success');
  };

  const handleSendFeedback = () => {
    if (!feedback.trim()) return;
    console.log('Feedback submitted:', feedback);
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
                  <div key={member.id} className="flex justify-between items-center p-2 rounded-md bg-background/50">
                    <span className="truncate mr-2">{member.email}</span>
                    <div className="flex items-center gap-2">
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
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Import */}
              <div className="flex flex-col gap-2 p-4 rounded-md bg-background/50 border border-foreground/20">
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
              <div className="flex flex-col gap-2 p-4 rounded-md bg-background/50 border border-foreground/20">
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
              <div className="flex flex-col gap-2 p-4 rounded-md bg-background/50 border border-foreground/20">
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
              <div className="flex flex-col gap-2 p-4 rounded-md bg-background/50 border border-red-500/30">
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

            {/* Cloud Backup (Google Drive) */}
            <div className="mt-8 border-t border-[#F5F5DC]/10 pt-6">
              <h4 className="text-lg font-bold text-[#F5F5DC] mb-2">☁️ Respaldo en la Nube (Google Drive)</h4>
              <p className="text-xs text-[#F5F5DC]/70 mb-4">
                Guarda una copia de seguridad directamente en tu cuenta de Google Drive para mayor seguridad.
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="googleClientId" className="block text-sm font-medium text-[#F5F5DC]/90 mb-1">
                    Google Client ID
                  </label>
                  <input
                    id="googleClientId"
                    type="text"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="Tu Client ID de Google Cloud Console"
                    className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30 focus:outline-none focus:ring-1 focus:ring-[#F5F5DC] mb-2"
                  />
                  <p className="text-[10px] text-[#F5F5DC]/40">
                    Opcional: Si quieres automatizar la subida, crea un proyecto en{' '}
                    <a
                      href="https://console.cloud.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-400"
                    >
                      Google Cloud Console
                    </a>{' '}
                    y habilita la 'Google Drive API' para obtener un Client ID.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleCreateBackup}
                    className="flex-1 bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    💾 Descargar Respaldo Local (.json)
                  </button>
                  <button
                    onClick={handleDriveBackup}
                    disabled={isDriveLoading}
                    className="flex-1 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-all text-sm disabled:opacity-50"
                  >
                    {isDriveLoading ? 'Subiendo...' : '☁️ Subir a mi Drive'}
                  </button>
                  <button
                    onClick={handleDriveRestore}
                    disabled={isDriveLoading}
                    className="flex-1 bg-transparent border border-blue-600 text-blue-400 font-bold py-2 px-4 rounded-lg hover:bg-blue-600/10 transition-all text-sm disabled:opacity-50"
                  >
                    {isDriveLoading ? 'Descargando...' : 'Restaurar desde Drive'}
                  </button>
                </div>
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
