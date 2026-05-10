import { useState } from 'react';
import LandingPage from './components/LandingPage';
import LoginModal from './components/LoginModal';
import Notification from './components/Notification';
import SignupModal from './components/SignupModal';
import SubscriptionModal from './components/SubscriptionModal';
import UpdateNotification from './components/UpdateNotification';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { I18nProvider } from './context/I18nContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { UIProvider, useUI } from './context/UIContext';
import useErrorMonitoring from './hooks/useErrorMonitoring';
import useLocalStorage from './hooks/useLocalStorage';
import MainApp from './MainApp';

type ModalType = 'login' | 'signup' | null;

const AppContainer = () => {
  useErrorMonitoring();
  const [hasVisited, setHasVisited] = useLocalStorage('hasVisited', false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const { isLoading, loadingMessage, notification, hideNotification } = useUI();

  const showMainApp = () => setHasVisited(true);

  const closeModal = () => setActiveModal(null);
  const openLoginModal = () => setActiveModal('login');

  const switchToSignup = () => setActiveModal('signup');
  const switchToLogin = () => setActiveModal('login');

  if (!hasVisited) {
    return <LandingPage onNavigate={showMainApp} onLoginClick={openLoginModal} />;
  }

  return (
    <>
      <MainApp onLoginClick={openLoginModal} />
      <UpdateNotification />
      {activeModal === 'login' && <LoginModal onClose={closeModal} onSwitchToSignup={switchToSignup} />}
      {activeModal === 'signup' && <SignupModal onClose={closeModal} onSwitchToLogin={switchToLogin} />}
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
            </AppProvider>
          </SubscriptionProvider>
        </CurrencyProvider>
      </AuthProvider>
    </UIProvider>
  </I18nProvider>
);

export default App;
