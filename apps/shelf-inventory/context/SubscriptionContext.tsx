/**
 * SubscriptionContext — SWAL monetization model (2026-07)
 *
 * ALL features are free. There is no Pro / Pyme tier.
 * Monetization is exclusively:
 *   - Backend persistence infrastructure (subscription)
 *   - AI model credits via OpenRouter (DeepSeek v4 Flash)
 *
 * This context is kept as a thin shim so that we can track
 * whether the user has an active backend subscription
 * (= persistent cloud sync is enabled). It does NOT gate any features.
 */
import type React from 'react';
import { createContext, type ReactNode, useContext } from 'react';

interface SubscriptionContextType {
  /** True when user has an active backend infrastructure subscription */
  hasBackend: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SHELF_TIER_CHANGED_EVENT = 'shelf-tier-changed';

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // In the future this will check if the user has paid for backend persistence.
  // For now, backend sync is always opt-in and all features work locally.
  const hasBackend = false;

  return <SubscriptionContext.Provider value={{ hasBackend }}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
