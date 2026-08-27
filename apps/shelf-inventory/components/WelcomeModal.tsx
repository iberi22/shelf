import type React from 'react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import Button from './ui/Button';
import Modal from './ui/Modal';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const { loginAsGuest } = useAuth();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('shelfWelcomeSeen', 'true');
    }
    onClose();
  };

  const handleGuestMode = async () => {
    await loginAsGuest();
    handleClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('welcome.title')}>
      <div className="space-y-6">
        <p className="text-sm md:text-base text-foreground/80 text-center">{t('welcome.subtitle')}</p>

        <div className="space-y-4">
          {/* Local Mode */}
          <div className="bg-primary/30 p-4 rounded-lg border border-foreground/10">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="text-2xl md:text-3xl">💾</div>
              <div>
                <h3 className="font-bold text-base md:text-lg mb-1 text-foreground">{t('welcome.localMode')}</h3>
                <p className="text-foreground/80 text-sm">{t('welcome.localModeDesc')}</p>
              </div>
            </div>
          </div>

          {/* Backup Responsibility */}
          <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/30">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="text-2xl md:text-3xl">⚠️</div>
              <div>
                <h3 className="font-bold text-base md:text-lg mb-1 text-foreground">
                  {t('welcome.backupResponsibility')}
                </h3>
                <p className="text-foreground/80 text-sm">{t('welcome.backupResponsibilityDesc')}</p>
              </div>
            </div>
          </div>

          {/* Upgrade Option */}
          <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/30">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="text-2xl md:text-3xl">☁️</div>
              <div>
                <h3 className="font-bold text-base md:text-lg mb-1 text-foreground">{t('welcome.upgradeOption')}</h3>
                <p className="text-foreground/80 text-sm">{t('welcome.upgradeOptionDesc')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Don't show again checkbox */}
        <div className="flex items-center gap-2 justify-center pt-2">
          <input
            type="checkbox"
            id="dontShowAgain"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-4 h-4 rounded border-foreground/30 bg-primary text-foreground focus:ring-2 focus:ring-foreground/50"
          />
          <label htmlFor="dontShowAgain" className="text-sm text-foreground/80 cursor-pointer">
            {t('welcome.dontShowAgain')}
          </label>
        </div>

        {/* Get Started Button */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button variant="secondary" size="lg" onClick={handleGuestMode}>
            {t('auth.continueAsGuest')}
          </Button>
          <Button onClick={handleClose} data-testid="welcome-modal-get-started-button" size="lg">
            {t('welcome.getStarted')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default WelcomeModal;
