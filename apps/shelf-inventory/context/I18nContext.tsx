import type React from 'react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

type Translations = { [key: string]: any };

type Locale =
  | 'en'
  | 'es'
  | 'pt'
  | 'zh'
  | 'hi'
  | 'fr'
  | 'ar'
  | 'bn'
  | 'ru'
  | 'ur'
  | 'id'
  | 'de'
  | 'ja'
  | 'mr'
  | 'te'
  | 'tr'
  | 'ta'
  | 'vi'
  | 'tl'
  | 'it';

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, options?: { [key: string]: any }) => any;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const getInitialLocale = (): Locale => {
  if (typeof window === 'undefined') {
    return 'en'; // Default to English on server
  }

  // Check if user has manually set a locale before
  const savedLocale = localStorage.getItem('shelfLocale');
  const userHasSetLocale = localStorage.getItem('shelfLocaleSetByUser');

  // If user has explicitly set a locale, use it
  if (userHasSetLocale === 'true' && savedLocale) {
    return savedLocale as Locale;
  }

  // Otherwise, detect from browser
  const fullLang = navigator.language || navigator.languages?.[0] || 'en';
  const browserLang = fullLang.split(/[-_]/)[0].toLowerCase();

  // Map of supported languages
  const supportedLocales: Locale[] = [
    'en',
    'es',
    'pt',
    'zh',
    'hi',
    'fr',
    'ar',
    'bn',
    'ru',
    'ur',
    'id',
    'de',
    'ja',
    'mr',
    'te',
    'tr',
    'ta',
    'vi',
    'tl',
    'it',
  ];

  // Return the browser language if supported, otherwise default to English
  const detectedLocale = supportedLocales.includes(browserLang as Locale) ? (browserLang as Locale) : 'en';

  // Save the detected locale (but not marked as user-set)
  localStorage.setItem('shelfLocale', detectedLocale);

  return detectedLocale;
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>(getInitialLocale());
  const [translations, setTranslations] = useState<{ [key in Locale]?: Translations } | null>(null);

  // Custom setLocale that marks it as user-set
  const handleSetLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem('shelfLocale', newLocale);
    localStorage.setItem('shelfLocaleSetByUser', 'true');
  }, []);

  // Effect to load translation files from the server
  useEffect(() => {
    const fetchTranslations = async () => {
      try {
        const localesList: Locale[] = [
          'en',
          'es',
          'pt',
          'zh',
          'hi',
          'fr',
          'ar',
          'bn',
          'ru',
          'ur',
          'id',
          'de',
          'ja',
          'mr',
          'te',
          'tr',
          'ta',
          'vi',
          'tl',
          'it',
        ];
        const results = await Promise.all(
          localesList.map((code) => fetch(`/locales/${code}.json?v=${Date.now()}`).then((res) => res.json())),
        );
        const transObj: { [key in Locale]?: Translations } = {};
        localesList.forEach((code, index) => {
          transObj[code] = results[index];
        });
        setTranslations(transObj);
      } catch (error) {
        console.error('Failed to load translations:', error);
      }
    };
    fetchTranslations();
  }, []);

  // Effect to update the document's lang attribute whenever the locale changes.
  // This is crucial for accessibility and for browsers to offer automatic translation.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback(
    (key: string, options?: { [key: string]: any }): any => {
      if (!translations) {
        return key; // Return key if translations are not loaded yet
      }

      const { returnObjects, ...replacements } = options || {};

      const keys = key.split('.');
      let result: any = translations[locale];
      for (const k of keys) {
        result = result?.[k];
        if (result === undefined) break;
      }

      if (result === undefined) {
        let fallbackResult: any = translations.en;
        for (const fk of keys) {
          fallbackResult = fallbackResult?.[fk];
          if (fallbackResult === undefined) {
            return key;
          }
        }
        result = fallbackResult;
      }

      if (typeof result !== 'string' && !returnObjects) {
        console.warn(
          `Translation for key "${key}" is not a string. Pass 'returnObjects: true' if you want the object/array.`,
        );
        return key;
      }

      if (typeof result === 'string' && Object.keys(replacements).length > 0) {
        return Object.entries(replacements).reduce((acc, [k, v]) => {
          // Use a regex with 'g' flag to replace all occurrences
          const regex = new RegExp(`{{${k}}}`, 'g');
          return acc.replace(regex, String(v));
        }, result);
      }

      return result;
    },
    [locale, translations],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t }}>
      {translations ? (
        children
      ) : (
        <div className="flex h-screen w-full items-center justify-center bg-[#121212] text-[#F5F5DC]">Loading...</div>
      )}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
