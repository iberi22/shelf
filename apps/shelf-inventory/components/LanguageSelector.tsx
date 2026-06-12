import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';

interface LanguageSelectorProps {
  direction?: 'up' | 'down';
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ direction = 'up' }) => {
  const { locale, setLocale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'en' as const, name: 'English', flag: '🇺🇸' },
    { code: 'es' as const, name: 'Español', flag: '🇪🇸' },
    { code: 'pt' as const, name: 'Português', flag: '🇧🇷' },
    { code: 'zh' as const, name: '中文 (Mandarin)', flag: '🇨🇳' },
    { code: 'hi' as const, name: 'हिन्दी (Hindi)', flag: '🇮🇳' },
    { code: 'fr' as const, name: 'Français (French)', flag: '🇫🇷' },
    { code: 'ar' as const, name: 'العربية (Arabic)', flag: '🇸🇦' },
    { code: 'bn' as const, name: 'বাংলা (Bengali)', flag: '🇧🇩' },
    { code: 'ru' as const, name: 'Русский (Russian)', flag: '🇷🇺' },
    { code: 'ur' as const, name: 'اردو (Urdu)', flag: '🇵🇰' },
    { code: 'id' as const, name: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'de' as const, name: 'Deutsch (German)', flag: '🇩🇪' },
    { code: 'ja' as const, name: '日本語 (Japanese)', flag: '🇯🇵' },
    { code: 'mr' as const, name: 'मराठी (Marathi)', flag: '🇮🇳' },
    { code: 'te' as const, name: 'తెలుగు (Telugu)', flag: '🇮🇳' },
    { code: 'tr' as const, name: 'Türkçe (Turkish)', flag: '🇹🇷' },
    { code: 'ta' as const, name: 'தமிழ் (Tamil)', flag: '🇮🇳' },
    { code: 'vi' as const, name: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'tl' as const, name: 'Filipino (Tagalog)', flag: '🇵🇭' },
    { code: 'it' as const, name: 'Italiano (Italian)', flag: '🇮🇹' },
  ];

  const currentLanguage = languages.find((lang) => lang.code === locale) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLanguageChange = (code: any) => {
    setLocale(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-foreground/10 transition-all active:scale-95"
        aria-label="Select language"
      >
        <span className="text-xl">{currentLanguage.flag}</span>
        <span className="hidden sm:inline text-sm font-medium">{currentLanguage.code.toUpperCase()}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute ${direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 w-56 bg-primary border border-foreground/20 rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto z-50`}
        >
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-foreground/10 transition-colors ${
                locale === lang.code ? 'bg-foreground/5 font-semibold' : ''
              }`}
            >
              <span className="text-2xl">{lang.flag}</span>
              <span className="text-sm">{lang.name}</span>
              {locale === lang.code && (
                <svg
                  className="w-5 h-5 ml-auto text-foreground"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
