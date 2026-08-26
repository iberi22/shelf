import type { InventoryConfig } from 'p2p-mesh-core';
import { p2pManager } from 'p2p-mesh-core';
import { useEffect, useState } from 'react';
import BusinessOnboarding from './components/BusinessOnboarding';
import LandingPage from './components/LandingPage';
import LockScreen from './components/LockScreen';
import Notification from './components/Notification';
import RecoveryApprovalModal from './components/RecoveryApprovalModal';
import UpdateNotification from './components/UpdateNotification';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { FeatureFlagProvider } from './context/FeatureFlagContext';
import { I18nProvider } from './context/I18nContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { SwalNodeProvider } from './context/SwalNodeContext';
import { ThemeProvider } from './context/ThemeContext';
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
  const { dispatch } = useAppContext();
  const isTestOrDevSkip =
    import.meta.env.MODE === 'test' ||
    import.meta.env.VITE_SKIP_LANDING === 'true' ||
    import.meta.env.VITE_TEST_MODE === 'true' ||
    window.location.search.includes('test=true') ||
    window.location.search.includes('skipLanding=true') ||
    window.location.search.includes('testMode=true') ||
    Boolean((window as any).__E2E_TEST__) ||
    Boolean((window as any).Cypress);

  const [hasVisited, setHasVisited] = useLocalStorage('hasVisited', isTestOrDevSkip);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useLocalStorage(
    'hasCompletedOnboarding',
    isTestOrDevSkip,
  );

  useEffect(() => {
    if (isTestOrDevSkip) {
      try {
        localStorage.setItem('hasVisited', 'true');
        localStorage.setItem('shelfWelcomeSeen', 'true');
        localStorage.setItem('hasCompletedOnboarding', 'true');
      } catch (_e) {
        // ignore storage errors
      }
    }
  }, [isTestOrDevSkip]);
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
  const handleOnboardingComplete = (config: InventoryConfig) => {
    dispatch({ type: 'UPDATE_INVENTORY_CONFIG', payload: config });
    setHasCompletedOnboarding(true);
  };

  const shouldSkipLanding = hasVisited || isTestOrDevSkip;

  if (!shouldSkipLanding) {
    return <LandingPage onNavigate={showMainApp} />;
  }

  if (!hasCompletedOnboarding) {
    return <BusinessOnboarding onComplete={handleOnboardingComplete} />;
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
  <SwalNodeProvider>
    <ThemeProvider>
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
    </ThemeProvider>
  </SwalNodeProvider>
);

export default App;
