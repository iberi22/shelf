import type { User } from 'p2p-mesh-core';
import type React from 'react';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  isPro: boolean;
  isPyme: boolean;
  isFree: boolean;
  tier: User['subscriptionTier'];
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SHELF_TIER_CHANGED_EVENT = 'shelf-tier-changed';

function resolveTier(user: User | null): User['subscriptionTier'] {
  if (typeof localStorage !== 'undefined') {
    const override = localStorage.getItem('shelf_subscription_tier_override');
    if (override === 'free' || override === 'pro' || override === 'pyme') {
      return override;
    }
    if (localStorage.getItem('shelf_demo_full_access') === 'true') {
      return 'pyme';
    }
  }
  if (!user) return 'free';
  return user.subscriptionTier ?? 'free';
}

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [tierEpoch, setTierEpoch] = useState(0);

  useEffect(() => {
    const bump = () => setTierEpoch((n) => n + 1);
    window.addEventListener(SHELF_TIER_CHANGED_EVENT, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(SHELF_TIER_CHANGED_EVENT, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const value = useMemo(() => {
    void tierEpoch;
    const tier = resolveTier(user);
    const isPyme = tier === 'pyme';
    const isPro = tier === 'pro' || isPyme;
    const isFree = !isPro;
    return { isPro, isPyme, isFree, tier };
  }, [user, tierEpoch]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
