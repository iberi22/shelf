import { Languages } from 'lucide-react';
import type React from 'react';
import { useI18n } from '../context/I18nContext';
import LanguageSelector from './LanguageSelector';

/**
 * LanguageConfig — i18n locale switching (20 languages via LanguageSelector).
 */
const LanguageConfig: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3 rounded-md border border-foreground/10 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
          <Languages className="h-4 w-4 text-accent-green" aria-hidden="true" />
          {t('settings.language') || t('common.language') || 'Language'}
        </div>
        <p className="mt-1 text-xs text-foreground/60">{t('settings.languageDescription')}</p>
      </div>
      <div className="self-start sm:self-center" data-testid="settings-language-selector">
        <LanguageSelector direction="down" />
      </div>
    </div>
  );
};

export default LanguageConfig;
