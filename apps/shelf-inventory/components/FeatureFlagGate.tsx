import type React from 'react';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

interface FeatureFlagGateProps {
  featureId: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const FeatureFlagGate: React.FC<FeatureFlagGateProps> = ({ featureId, fallback = null, children }) => {
  const { isEnabled, isLoading } = useFeatureFlags();

  if (isLoading) {
    return null; // Or a loading spinner if preferred, but usually quiet is better for features gating
  }

  if (isEnabled(featureId)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export default FeatureFlagGate;
