import { p2pManager } from 'p2p-mesh-core';
import { useEffect, useState } from 'react';
import AccountRecoveryModal from './components/AccountRecoveryModal';
import LandingPage from './components/LandingPage';
import LocalLoginModal from './components/LocalLoginModal';
import LocalSignupModal from './components/LocalSignupModal';
import LockScreen from './components/LockScreen';
import Notification from './components/Notification';
import P2PRecoveryModal from './components/P2PRecoveryModal';
import RecoveryApprovalModal from './components/RecoveryApprovalModal';
import SubscriptionModal from './components/SubscriptionModal';
import UpdateNotification from './components/UpdateNotification';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { I18nProvider } from './context/I18nContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { UIProvider, useUI } from './context/UIContext';
import useErrorMonitoring from './hooks/useErrorMonitoring';
import useLocalStorage from './hooks/useLocalStorage';
import MainApp from './MainApp';

type ModalType = 'local-login' | 'local-signup' | 'recovery-seed' | 'recovery-p2p' | null;

interface PendingRecoveryRequest {
  requestId: string;
  email: string;
  deviceName: string;
  fromPeerId: string;
}

const AppContainer = () => {
  useErrorMonitoring();
  const [hasVisited, setHasVisited] = useLocalStorage('hasVisited', false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [pendingRecoveryRequest, setPendingRecoveryRequest] = useState<PendingRecoveryRequest | null>(null);
  const { isLoading, loadingMessage, notification, hideNotification, showNotification } = useUI();
  const { isLocked, isLocalAccount, user } = useAuth();

  // Handle invitation links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isInvite = params.get('invite') === 'true';
    const inviterPeerId = params.get('peerId');
    const invitedEmail = params.get('email');

    if (isInvite && inviterPeerId) {
      console.log('Detected invitation from peer:', inviterPeerId);
      p2pManager.connect(inviterPeerId);
      showNotification(`Conectando con el equipo de ${invitedEmail || 'invitación'}...`, 'info');

      // Clear params from URL without reload
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [showNotification]);

  // Listen for incoming P2P recovery requests (master device)
  useEffect(() => {
    if (!isLocalAccount || !user) return;

    p2pManager.onRecoveryRequest((requestId, email, deviceName, fromPeerId) => {
      setPendingRecoveryRequest({ requestId, email, deviceName, fromPeerId });
    });
  }, [isLocalAccount, user]);

  const showMainApp = () => setHasVisited(true);

  const closeModal = () => setActiveModal(null);
  const openLoginModal = () => setActiveModal('local-login');

  const switchToLocalSignup = () => setActiveModal('local-signup');
  const switchToLocalLogin = () => setActiveModal('local-login');
  const switchToSeedRecovery = () => setActiveModal('recovery-seed');

  const handleRecovered = () => {
    closeModal();
    // Reload to pick up the new local account
    window.location.reload();
  };

  if (!hasVisited) {
      return <LandingPage onNavigate={showMainApp} />;
  }

  if (isLocked) {
    return <LockScreen />;
  }

  return (
    <>
      <MainApp onLoginClick={openLoginModal} />

      {/* Local auth modals */}
      {activeModal === 'local-login' && (
        <LocalLoginModal
          onClose={closeModal}
          onSwitchToSignup={switchToLocalSignup}
          onSwitchToRecovery={switchToSeedRecovery}
        />
      )}
      {activeModal === 'local-signup' && <LocalSignupModal onClose={closeModal} onSwitchToLogin={switchToLocalLogin} />}

      {/* Recovery modals */}
      {activeModal === 'recovery-seed' && (
        <AccountRecoveryModal onClose={closeModal} onRecovered={handleRecovered} onSwitchToLogin={switchToLocalLogin} />
      )}
      {activeModal === 'recovery-p2p' && (
        <P2PRecoveryModal
          onClose={closeModal}
          onRecovered={handleRecovered}
          onSwitchToSeedRecovery={switchToSeedRecovery}
        />
      )}

      {/* P2P recovery approval (shown on master device when a request arrives) */}
      {pendingRecoveryRequest && (
        <RecoveryApprovalModal request={pendingRecoveryRequest} onClose={() => setPendingRecoveryRequest(null)} />
      )}

      <SubscriptionModal />

      {isLoading && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]">
          <div className="text-center">
            <div className="text-4xl animate-spin mb-4">⚙️</div>
            <p className="text-lg">{loadingMessage}</p>
          </div>
        </div>
      )}
      {notification && <Notification {...notification} onClose={hideNotification} />}
    </>
  );
};

const App = () => (
  <I18nProvider>
    <UIProvider>
      <AuthProvider>
        <CurrencyProvider>
          <SubscriptionProvider>
            <AppProvider>
              <AppContainer />
              <UpdateNotification />
            </AppProvider>
          </SubscriptionProvider>
        </CurrencyProvider>
      </AuthProvider>
    </UIProvider>
  </I18nProvider>
);

export default App;
