import type React from 'react';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

interface NotificationState {
  message: string;
  type: 'error' | 'success' | 'info';
  durationMs?: number;
}

interface UIContextProps {
  isLoading: boolean;
  loadingMessage: string;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  isSubscriptionModalOpen: boolean;
  openSubscriptionModal: () => void;
  closeSubscriptionModal: () => void;
  notification: NotificationState | null;
  showNotification: (message: string, type: NotificationState['type'], durationMs?: number) => void;
  hideNotification: () => void;
}

const UIContext = createContext<UIContextProps | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [isSubscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const showLoading = useCallback((message = 'Loading...') => {
    setLoadingMessage(message);
    setIsLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const openSubscriptionModal = useCallback(() => setSubscriptionModalOpen(true), []);
  const closeSubscriptionModal = useCallback(() => setSubscriptionModalOpen(false), []);

  const showNotification = useCallback(
    (message: string, type: NotificationState['type'], durationMs?: number) => {
      setNotification({ message, type, durationMs });
    },
    [],
  );

  const hideNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return (
    <UIContext.Provider
      value={{
        isLoading,
        loadingMessage,
        showLoading,
        hideLoading,
        isSubscriptionModalOpen,
        openSubscriptionModal,
        closeSubscriptionModal,
        notification,
        showNotification,
        hideNotification,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
