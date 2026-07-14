import { p2pManager } from 'p2p-mesh-core';
import { useEffect, useState } from 'react';
import LandingPage from './components/LandingPage';
import LockScreen from './components/LockScreen';
import Notification from './components/Notification';
import RecoveryApprovalModal from './components/RecoveryApprovalModal';
import SubscriptionModal from './components/SubscriptionModal';
import UpdateNotification from './components/UpdateNotification';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { FeatureFlagProvider } from './context/FeatureFlagContext';
import { I18nProvider } from './context/I18nContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { UIProvider, useUI } from './context/UIContext';
import useErrorMonitoring from './hooks/useErrorMonitoring';
import useLocalStorage from './hooks/useLocalStorage';
import { telemetry } from './lib/telemetry';
import MainApp from './MainApp';

interface PendingRecoveryRequest {
  requestId: string;
  email: string;
  deviceName: string;
  fromPeerId: string;
}

const AppContainer = () => {
  useErrorMonitoring();
  const [hasVisited, setHasVisited] = useLocalStorage('hasVisited', false);
  const [pendingRecoveryRequest, setPendingRecoveryRequest] = useState<PendingRecoveryRequest | null>(null);
  const { isLoading, loadingMessage, notification, hideNotification, showNotification } = useUI();
  const { isLocked, isLocalAccount, user } = useAuth();

  // Track app init
  useEffect(() => {
    telemetry.trackEvent('app_init', {
      is_pwa: window.matchMedia('(display-mode: standalone)').matches,
      viewport_width: window.innerWidth,
    });
  }, []);

  // Handle invitation links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviterPeerId = params.get('peerId');
    const invitedEmail = params.get('email');

    // Support backwards compatibility for old links that only had peerId without invite=true
    if (inviterPeerId) {
      console.log('Detected invitation from peer:', inviterPeerId);
      p2pManager.connect(inviterPeerId);
      showNotification(`Conectando con el equipo de ${invitedEmail || 'invitación'}...`, 'info');

      // Clear params from URL without reload
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [showNotification]);

  useEffect(() => {
    const root = document.documentElement;
    const setAppHeight = () => {
      root.style.setProperty('--app-height', `${window.innerHeight}px`);
    };

    setAppHeight();

    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    window.visualViewport?.addEventListener('resize', setAppHeight);

    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
      window.visualViewport?.removeEventListener('resize', setAppHeight);
    };
  }, []);

  // Listen for incoming P2P recovery requests (master device)
  useEffect(() => {
    if (!isLocalAccount || !user) return;

    p2pManager.onRecoveryRequest((requestId, email, deviceName, fromPeerId) => {
      setPendingRecoveryRequest({ requestId, email, deviceName, fromPeerId });
    });
  }, [isLocalAccount, user]);

  const showMainApp = () => setHasVisited(true);

  if (!hasVisited) {
    return <LandingPage onNavigate={showMainApp} />;
  }

  if (isLocked) {
    return <LockScreen />;
  }

  return (
    <>
      <MainApp />

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
  <FeatureFlagProvider>
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
  </FeatureFlagProvider>
);

export default App;
