import type { User } from 'p2p-mesh-core';
import type React from 'react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

interface SubscriptionContextType {
  isPro: boolean;
  isPyme: boolean;
  isFree: boolean;
  tier: User['subscriptionTier'];
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const value = useMemo(
    () => ({
      isPro: true,
      isPyme: true,
      isFree: false,
      tier: 'pro' as const,
    }),
    [],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
