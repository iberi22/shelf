import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import defaultFeaturesJson from '../../../.gitcore/features.json';

export interface Feature {
  id: string;
  name: string;
  status: 'draft' | 'approved' | 'implemented' | 'validated';
  sdlc?: string;
  priority: string;
  category: string;
  description: string;
  user_story?: string;
  actor?: string;
  dependencies?: string[];
  technologies?: string[];
  acceptance_criteria?: string[];
}

export interface FeatureFlagMetadata {
  protocol_version: string;
  project: string;
  project_display: string;
  description: string;
  created: string;
  updated: string;
  version: string;
  sdlc_phase: string;
  total_features: number;
  features_implemented: number;
  implementation_percentage: number;
}

interface FeatureFlagContextType {
  features: Feature[];
  metadata: FeatureFlagMetadata;
  overrides: Record<string, boolean>;
  isEnabled: (id: string) => boolean;
  toggleFeature: (id: string) => Promise<void>;
  resetOverrides: () => void;
  isLoading: boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextType | undefined>(undefined);

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [features, setFeatures] = useState<Feature[]>(defaultFeaturesJson.features as Feature[]);
  const [metadata, setMetadata] = useState<FeatureFlagMetadata>(defaultFeaturesJson.metadata as FeatureFlagMetadata);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load overrides from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('shelf_feature_overrides');
      if (stored) {
        setOverrides(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load feature overrides from localStorage', e);
    }
  }, []);

  // Fetch latest features from dev API server if running in development mode
  useEffect(() => {
    let active = true;
    const loadDevFeatures = async () => {
      if (import.meta.env.DEV) {
        try {
          const response = await fetch('/api/features');
          if (response.ok && active) {
            const data = await response.json();
            setFeatures(data.features);
            setMetadata(data.metadata);
          }
        } catch (e) {
          console.warn('Vite dev features API is not reachable, falling back to static features.json', e);
        }
      }
      setIsLoading(false);
    };

    loadDevFeatures();
    return () => {
      active = false;
    };
  }, []);

  // Checks if a feature is enabled
  const isEnabled = useCallback(
    (id: string) => {
      // 1. Check local storage overrides first
      if (overrides[id] !== undefined) {
        return overrides[id];
      }
      // 2. Fall back to feature.json status
      const feature = features.find((f) => f.id === id);
      if (!feature) return false;
      return feature.status === 'implemented' || feature.status === 'validated';
    },
    [features, overrides],
  );

  // Toggles the state of a feature
  const toggleFeature = async (id: string) => {
    const feature = features.find((f) => f.id === id);
    if (!feature) return;

    const currentlyEnabled = isEnabled(id);
    const targetStatus = currentlyEnabled ? 'draft' : 'implemented';

    // 1. Update local storage overrides for immediate local effect
    const updatedOverrides = {
      ...overrides,
      [id]: !currentlyEnabled,
    };
    setOverrides(updatedOverrides);
    localStorage.setItem('shelf_feature_overrides', JSON.stringify(updatedOverrides));

    // 2. If in dev mode, also try to save back to the .gitcore/features.json file
    if (import.meta.env.DEV) {
      const updatedFeatures = features.map((f) =>
        f.id === id ? { ...f, status: targetStatus as Feature['status'] } : f,
      );

      try {
        const response = await fetch('/api/features', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            metadata,
            features: updatedFeatures,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          // Update state with updated features and recalculated metadata from server
          setFeatures(updatedFeatures);
          setMetadata(data.metadata);

          // Clear the override for this feature since it's now saved on disk
          const cleanOverrides = { ...updatedOverrides };
          delete cleanOverrides[id];
          setOverrides(cleanOverrides);
          localStorage.setItem('shelf_feature_overrides', JSON.stringify(cleanOverrides));
        } else {
          console.error('Failed to sync feature toggle to disk');
        }
      } catch (e) {
        console.error('Error syncing feature toggle to disk', e);
      }
    }
  };

  const resetOverrides = () => {
    setOverrides({});
    localStorage.removeItem('shelf_feature_overrides');
  };

  return (
    <FeatureFlagContext.Provider
      value={{
        features,
        metadata,
        overrides,
        isEnabled,
        toggleFeature,
        resetOverrides,
        isLoading,
      }}
    >
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlagsContext = () => {
  const context = useContext(FeatureFlagContext);
  if (context === undefined) {
    throw new Error('useFeatureFlagsContext must be used within a FeatureFlagProvider');
  }
  return context;
};
