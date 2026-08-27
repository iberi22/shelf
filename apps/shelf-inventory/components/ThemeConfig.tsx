import { Hexagon, Moon, Palette } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { useI18n } from '../context/I18nContext';
import { useTheme } from '../context/ThemeContext';
import CollapsibleCard from './CollapsibleCard';

/**
 * ThemeConfig — dual-theme (classic / swal) selection.
 * Also keeps the <meta name="theme-color"> tag in sync with the active theme.
 */
const ThemeConfig: React.FC = () => {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'swal' ? '#020617' : '#1e1e1e');
    }
  }, [theme]);

  return (
    <CollapsibleCard
      title={t('settings.appearance.title')}
      icon={<Palette className="h-5 w-5" />}
      testId="settings-appearance-card"
      defaultOpen={true}
    >
      <div className="flex flex-col gap-3">
        <div className="inline-flex p-1 rounded-lg bg-surface border border-foreground/20 gap-1.5 w-full sm:w-auto self-start">
          <button
            type="button"
            aria-pressed={theme === 'classic'}
            onClick={() => setTheme('classic')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all cursor-pointer ${
              theme === 'classic'
                ? 'bg-surface-alt text-foreground shadow-sm ring-2 ring-foreground/80'
                : 'text-foreground/70 hover:text-foreground hover:bg-surface-alt/50'
            }`}
          >
            <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('settings.appearance.themeClassic')}</span>
          </button>
          <button
            type="button"
            aria-pressed={theme === 'swal'}
            onClick={() => setTheme('swal')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all cursor-pointer ${
              theme === 'swal'
                ? 'bg-surface-alt text-foreground shadow-sm ring-2 ring-foreground/80'
                : 'text-foreground/70 hover:text-foreground hover:bg-surface-alt/50'
            }`}
          >
            <Hexagon className="h-4 w-4 shrink-0 text-accent-green" aria-hidden="true" />
            <span>{t('settings.appearance.themeSwal')}</span>
          </button>
        </div>
        <p className="text-xs text-foreground/60">{t('settings.appearance.description')}</p>
      </div>
    </CollapsibleCard>
  );
};

export default ThemeConfig;
