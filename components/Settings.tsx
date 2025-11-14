import type React from 'react';
import { useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import useLocalStorage from '../hooks/useLocalStorage';
import type { RestoreStatePayload, TeamMember } from '../types';
import ImportCSVModal from './ImportCSVModal';
import InviteMemberModal from './InviteMemberModal';

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
  const { currencyCode, setCurrencyCode, numberFormat, setNumberFormat } = useCurrency();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const { isPyme } = useSubscription();
  const { user } = useAuth();

  // Mocked team data for UI demonstration
  const [team] = useState<TeamMember[]>([
    { id: '1', email: user?.email ?? 'owner@example.com', role: 'owner' },
    { id: '2', email: 'jane.doe@example.com', role: 'admin' },
    { id: '3', email: 'john.smith@example.com', role: 'member' },
  ]);

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

  const handleInviteSent = () => {
    setInviteModalOpen(false);
    showNotification('Invitation sent successfully!', 'success');
    // Here you would typically refresh the team list or add the invited user optimistically
  };

  const handleSendFeedback = () => {
    if (!feedback.trim()) return;
    // In a real app, this would send the feedback to a backend service.
    // For now, we simulate success.
    console.log('Feedback submitted:', feedback);
    showNotification(t('settings.feedback.success'), 'success');
    setFeedback('');
  };

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold mb-6">{t('settings.title')}</h2>

        <div className="grid gap-8 md:grid-cols-1">
          {/* General Settings */}
          <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-6 rounded-lg">
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
                className="w-full max-w-xs p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
              />
            </div>
          </div>

          {/* Currency Settings */}
          <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.currency.title')}</h3>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                  className="w-full max-w-xs p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
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
                  className="w-full max-w-xs p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
                >
                  <option value="en-US">1,234.56 ({t('settings.currency.formats.en-US')})</option>
                  <option value="de-DE">1.234,56 ({t('settings.currency.formats.de-DE')})</option>
                </select>
              </div>
            </div>
          </div>

          {/* Team Management */}
          <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-6 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.team.title')}</h3>
                <p className="text-xs text-[#F5F5DC]/70 mt-1">{t('settings.team.description')}</p>
              </div>
              {isPyme ? (
                <button
                  onClick={() => setInviteModalOpen(true)}
                  className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 text-sm active:scale-95"
                >
                  {t('settings.team.invite')}
                </button>
              ) : (
                <button
                  onClick={openSubscriptionModal}
                  className="bg-sky-500 text-background font-bold py-2 px-4 rounded-lg hover:bg-sky-400 text-sm active:scale-95"
                >
                  {t('subscription.upgradeToPyme')}
                </button>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {team.map((member) => (
                <div key={member.id} className="flex justify-between items-center p-2 rounded-md bg-background/50">
                  <span>{member.email}</span>
                  <span className="text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Feedback and Support */}
          <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.feedback.title')}</h3>
            <p className="text-xs text-[#F5F5DC]/70 mt-1 mb-4">{t('settings.feedback.description')}</p>
            <textarea
              data-testid="feedback-textarea"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t('settings.feedback.placeholder')}
              className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30 min-h-[100px] focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
            />
            <button
              data-testid="feedback-submit-button"
              onClick={handleSendFeedback}
              disabled={!feedback.trim()}
              className="w-full mt-2 text-sm bg-foreground/90 text-background font-bold py-2 px-4 rounded-lg hover:bg-foreground transition-colors active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
            >
              {t('settings.feedback.button')}
            </button>
          </div>

          {/* Data Management */}
          <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-[#F5F5DC]">{t('settings.data.title')}</h3>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Import */}
              <div className="flex flex-col gap-2 p-4 rounded-md bg-background/50 border border-foreground/20">
                <h4 className="font-bold text-[#F5F5DC]">{t('settings.import.button')}</h4>
                <p className="text-xs text-[#F5F5DC]/70 flex-grow">{t('settings.import.cardDescription')}</p>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="w-full mt-2 text-sm bg-transparent border border-foreground/50 font-bold py-2 px-4 rounded-lg hover:bg-foreground/10 transition-colors active:scale-95"
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
                  className="w-full mt-2 text-sm bg-transparent border border-foreground/50 font-bold py-2 px-4 rounded-lg hover:bg-foreground/10 transition-colors active:scale-95"
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
                  className="w-full mt-2 cursor-pointer text-center text-sm bg-transparent border border-foreground/50 font-bold py-2 px-4 rounded-lg hover:bg-foreground/10 transition-colors active:scale-95"
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
                  className="w-full mt-2 text-sm bg-transparent border border-red-500/50 text-red-400 font-bold py-2 px-4 rounded-lg hover:bg-red-500/10 transition-colors active:scale-95"
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
