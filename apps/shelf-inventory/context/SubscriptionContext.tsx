import type { User } from 'p2p-mesh-core';
import type React from 'react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  isPro: boolean;
  isPyme: boolean;
  isFree: boolean;
  tier: User['subscriptionTier'];
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

function resolveTier(user: User | null): User['subscriptionTier'] {
  if (!user) return 'free';
  // Explicit demo flag can unlock full access without lying about subscription
  if (typeof localStorage !== 'undefined' && localStorage.getItem('shelf_demo_full_access') === 'true') {
    return 'pyme';
  }
  return user.subscriptionTier ?? 'free';
}

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const value = useMemo(() => {
    const tier = resolveTier(user);
    const isPyme = tier === 'pyme';
    const isPro = tier === 'pro' || isPyme;
    const isFree = !isPro;
    return { isPro, isPyme, isFree, tier };
  }, [user]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
