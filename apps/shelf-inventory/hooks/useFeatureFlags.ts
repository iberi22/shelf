import { useFeatureFlagsContext } from '../context/FeatureFlagContext';

export const useFeatureFlags = () => {
  const { features, metadata, overrides, isEnabled, toggleFeature, resetOverrides, isLoading } =
    useFeatureFlagsContext();

  return {
    features,
    metadata,
    overrides,
    isEnabled,
    toggleFeature,
    resetOverrides,
    isLoading,
  };
};
