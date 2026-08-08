/**
 * BusinessOnboarding — First-launch wizard
 *
 * Asks the user what type of business they have, then applies
 * the corresponding preset to configure inventory attributes.
 *
 * Flow:
 *   1. Welcome screen
 *   2. Select business type (from presets grid)
 *   3. Preview configuration (variant attributes, options)
 *   4. Confirm → save to inventoryConfig → redirect to main app
 */

import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { BUSINESS_PRESETS, type BusinessPreset, presetToInventoryConfig } from '../lib/businessPresets';
import { normalizeInventoryConfig } from '../lib/inventoryConfig';

interface BusinessOnboardingProps {
  onComplete: (config: ReturnType<typeof normalizeInventoryConfig>) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  retail: 'Tienda / Retail',
  food: 'Alimentos y Bebidas',
  manufacturing: 'Manufactura / Construcción',
  services: 'Servicios',
  general: 'General',
};

const CATEGORY_ICONS: Record<string, string> = {
  retail: '🏪',
  food: '🍽️',
  manufacturing: '🏭',
  services: '🔧',
  general: '📦',
};

export default function BusinessOnboarding({ onComplete }: BusinessOnboardingProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<'welcome' | 'select' | 'preview' | 'confirm'>('welcome');
  const [selectedPreset, setSelectedPreset] = useState<BusinessPreset | null>(null);

  const categories = Array.from(new Set(BUSINESS_PRESETS.map((p) => p.category)));

  const handleSelectPreset = (preset: BusinessPreset) => {
    setSelectedPreset(preset);
    setStep('preview');
  };

  const handleConfirm = () => {
    if (!selectedPreset) return;
    const config = normalizeInventoryConfig(presetToInventoryConfig(selectedPreset));
    onComplete(config);
  };

  // ─── Welcome Step ───
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="text-6xl">📦</div>
          <h1 className="text-2xl font-bold text-[#F5F5DC]">{t('onboarding.title')}</h1>
          <p className="text-[#F5F5DC]/60 text-sm leading-relaxed">{t('onboarding.subtitle')}</p>
          <p className="text-[#F5F5DC]/40 text-xs">{t('onboarding.customizationNote')}</p>
          <button
            type="button"
            onClick={() => setStep('select')}
            className="w-full py-3 px-6 bg-[#EAB308] hover:bg-[#CA8A04] text-black font-bold rounded-lg transition-all active:scale-95"
          >
            {t('onboarding.setupBtn')}
          </button>
          <button
            type="button"
            onClick={() => {
              // Skip onboarding — use default config
              const config = normalizeInventoryConfig(null);
              onComplete(config);
            }}
            className="w-full py-2 px-6 text-[#F5F5DC]/40 hover:text-[#F5F5DC]/60 text-xs transition-colors"
          >
            {t('onboarding.skipBtn')}
          </button>
        </div>
      </div>
    );
  }

  // ─── Select Step ───
  if (step === 'select') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-[#F5F5DC]">{t('onboarding.businessTypeTitle')}</h2>
            <p className="text-[#F5F5DC]/50 text-sm">{t('onboarding.businessTypeSubtitle')}</p>
          </div>

          {categories.map((category) => (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold text-[#F5F5DC]/40 uppercase tracking-wider flex items-center gap-2">
                <span>{CATEGORY_ICONS[category]}</span>
                {t(`onboarding.categories.${category}`) || CATEGORY_LABELS[category]}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {BUSINESS_PRESETS.filter((p) => p.category === category).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`text-left p-3 rounded-lg border transition-all active:scale-[0.98] ${
                      selectedPreset?.id === preset.id
                        ? 'border-[#EAB308]/60 bg-[#EAB308]/10'
                        : 'border-[#F5F5DC]/10 bg-[#121212] hover:border-[#F5F5DC]/25 hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{preset.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#F5F5DC]">{preset.name}</div>
                        <div className="text-xs text-[#F5F5DC]/50 mt-0.5">{preset.description}</div>
                        {preset.variantAttributes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {preset.variantAttributes.map((attr) => (
                              <span
                                key={attr}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-[#F5F5DC]/5 text-[#F5F5DC]/40"
                              >
                                {attr}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setStep('welcome')}
            className="w-full py-2 text-[#F5F5DC]/30 hover:text-[#F5F5DC]/50 text-xs transition-colors"
          >
            {t('onboarding.backBtn')}
          </button>
        </div>
      </div>
    );
  }

  // ─── Preview Step ───
  if (step === 'preview' && selectedPreset) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-4">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-center space-y-2">
            <span className="text-4xl">{selectedPreset.icon}</span>
            <h2 className="text-xl font-bold text-[#F5F5DC]">{selectedPreset.name}</h2>
            <p className="text-[#F5F5DC]/50 text-sm">{t('onboarding.previewTitle')}</p>
          </div>

          <div className="space-y-3">
            {/* Variant Attributes */}
            {selectedPreset.variantAttributes.length > 0 && (
              <div className="rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#EAB308] uppercase tracking-wider">
                  {t('onboarding.variantDimensions')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedPreset.variantAttributes.map((attr) => (
                    <span
                      key={attr}
                      className="text-sm px-3 py-1 rounded-full border border-[#EAB308]/30 bg-[#EAB308]/10 text-[#EAB308]"
                    >
                      {attr}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Color Options */}
            {selectedPreset.colorOptions.length > 0 && (
              <div className="rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#F5F5DC]/60 uppercase tracking-wider">
                  {t('onboarding.colors', { count: selectedPreset.colorOptions.length })}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPreset.colorOptions.map((c) => (
                    <div key={c.name} className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 rounded-full border border-[#F5F5DC]/20"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="text-xs text-[#F5F5DC]/70">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Measure Options */}
            {selectedPreset.measureOptions.length > 0 && (
              <div className="rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#F5F5DC]/60 uppercase tracking-wider">
                  {t('onboarding.measurements', { count: selectedPreset.measureOptions.length })}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPreset.measureOptions.map((m) => (
                    <span
                      key={m}
                      className="text-xs px-2 py-0.5 rounded-full border border-[#F5F5DC]/15 text-[#F5F5DC]/60"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Material Options */}
            {selectedPreset.materialOptions.length > 0 && (
              <div className="rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#22C55E] uppercase tracking-wider">
                  {t('onboarding.materials', { count: selectedPreset.materialOptions.length })}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPreset.materialOptions.map((m) => (
                    <span
                      key={m}
                      className="text-xs px-2 py-0.5 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Units */}
            <div className="rounded-lg border border-[#F5F5DC]/10 bg-[#121212] p-4 space-y-2">
              <h3 className="text-xs font-semibold text-[#F5F5DC]/60 uppercase tracking-wider">
                {t('onboarding.suggestedUnits')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selectedPreset.suggestedUnits.map((u) => (
                  <span
                    key={u}
                    className="text-xs px-2 py-0.5 rounded-full border border-[#F5F5DC]/15 text-[#F5F5DC]/50"
                  >
                    {u}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('select')}
              className="flex-1 py-2.5 px-4 border border-[#F5F5DC]/20 text-[#F5F5DC]/60 rounded-lg hover:bg-[#F5F5DC]/5 transition-colors text-sm"
            >
              {t('onboarding.changeBtn')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-2.5 px-4 bg-[#EAB308] hover:bg-[#CA8A04] text-black font-bold rounded-lg transition-all active:scale-95 text-sm"
            >
              {t('onboarding.confirmBtn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
