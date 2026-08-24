import type React from 'react';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const FeatureFlagsPanel: React.FC = () => {
  const {
    features,
    metadata: featuresMetadata,
    overrides,
    isEnabled: isFeatureEnabled,
    toggleFeature,
    resetOverrides,
  } = useFeatureFlags();

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground">Control de Funcionalidades (GitCore)</h3>
          <p className="text-xs text-foreground/70 mt-1">
            Protocolo: v{featuresMetadata.protocol_version} | Proyecto: {featuresMetadata.project_display} v
            {featuresMetadata.version}
          </p>
        </div>
        {Object.keys(overrides).length > 0 && (
          <button
            type="button"
            onClick={resetOverrides}
            className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold py-1 px-3 border border-red-500/30 rounded transition-all cursor-pointer"
          >
            Restablecer
          </button>
        )}
      </div>

      <div className="bg-background/30 rounded-lg p-3 mb-4 text-xs text-foreground/70 border border-foreground/10 flex flex-col md:flex-row md:justify-around gap-2 text-center">
        <div>
          Progreso: <strong>{featuresMetadata.implementation_percentage}%</strong>
        </div>
        <div>
          Implementadas:{' '}
          <strong>
            {featuresMetadata.features_implemented}/{featuresMetadata.total_features}
          </strong>
        </div>
        <div>
          Última actualización: <strong>{featuresMetadata.updated}</strong>
        </div>
        <div>
          Modo:{' '}
          <strong className={import.meta.env.DEV ? 'text-yellow-400' : 'text-green-400'}>
            {import.meta.env.DEV ? 'Desarrollo (Sync Disco)' : 'Producción (Overrides)'}
          </strong>
        </div>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {features.map((feature) => {
          const enabled = isFeatureEnabled(feature.id);
          const hasOverride = overrides[feature.id] !== undefined;

          return (
            <div
              key={feature.id}
              className={`flex items-start justify-between p-3 rounded-lg border transition-all ${
                enabled ? 'bg-accent-green/5 border-accent-green/20' : 'bg-accent-red/5 border-accent-red/10 opacity-70'
              }`}
            >
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] font-bold bg-surface px-1.5 py-0.5 rounded border border-foreground/10 text-foreground/80">
                    {feature.id}
                  </span>
                  <h4 className="font-bold text-sm text-foreground truncate">{feature.name}</h4>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-background/50 text-foreground/60">
                    {feature.category}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      feature.priority === 'P0'
                        ? 'bg-red-500/20 text-red-400'
                        : feature.priority === 'P1'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                    }`}
                  >
                    {feature.priority}
                  </span>
                  {hasOverride && (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 animate-pulse">
                      Override
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground/60 mt-1.5 leading-relaxed">{feature.description}</p>
                {feature.technologies && feature.technologies.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {feature.technologies.map((tech) => (
                      <span
                        key={tech}
                        className="text-[10px] text-foreground/40 bg-surface/30 px-1 py-0.2 rounded border border-foreground/5"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center pt-1">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleFeature(feature.id)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-surface border border-foreground/20 peer-focus:outline-none rounded-full peer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600 peer-checked:after:bg-surface peer-checked:after:border-surface"></div>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FeatureFlagsPanel;
