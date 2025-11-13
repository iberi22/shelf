
import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { User } from '../types';

interface SubscriptionContextType {
  isPro: boolean;
  isPyme: boolean;
  isFree: boolean;
  tier: User['subscriptionTier'];
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const tier = user?.subscriptionTier ?? 'free';

  const value = useMemo(() => ({
    isPro: tier === 'pro' || tier === 'pyme',
    isPyme: tier === 'pyme',
    isFree: tier === 'free',
    tier: tier,
  }), [tier]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
