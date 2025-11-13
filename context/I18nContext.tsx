
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';

type Translations = { [key: string]: any };

const loadedTranslations: { en?: Translations, es?: Translations, pt?: Translations } = {};

type Locale = 'en' | 'es' | 'pt';

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
    const browserLang = navigator.language.split(/[-_]/)[0];
    // Use English as a safer default if the browser language is not supported
    return (['en', 'es', 'pt'].includes(browserLang)) ? browserLang as Locale : 'en';
}

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useLocalStorage<Locale>('shelfLocale', getInitialLocale());
  const [translations, setTranslations] = useState<{ en: Translations, es: Translations, pt: Translations } | null>(null);

  // Effect to load translation files from the server
  useEffect(() => {
    const fetchTranslations = async () => {
        try {
            const [en, es, pt] = await Promise.all([
                fetch('/locales/en.json').then(res => res.json()),
                fetch('/locales/es.json').then(res => res.json()),
                fetch('/locales/pt.json').then(res => res.json())
            ]);
            setTranslations({ en, es, pt });
        } catch (error) {
            console.error("Failed to load translations:", error);
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

  const t = useCallback((key: string, options?: { [key: string]: any }): any => {
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
        let fallbackResult: any = translations['en'];
        for (const fk of keys) {
            fallbackResult = fallbackResult?.[fk];
            if (fallbackResult === undefined) {
                console.warn(`Translation key "${key}" not found.`);
                return key;
            }
        }
        result = fallbackResult;
    }
    
    if (typeof result !== 'string' && !returnObjects) {
        console.warn(`Translation for key "${key}" is not a string. Pass 'returnObjects: true' if you want the object/array.`);
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
  }, [locale, translations]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {translations ? children : <div className="flex h-screen w-full items-center justify-center bg-[#121212] text-[#F5F5DC]">Loading...</div>}
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
