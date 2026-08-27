import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'classic' | 'swal';

export const DEFAULT_THEME: Theme = 'classic';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'shelf-theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY);
      if (savedTheme === 'classic' || savedTheme === 'swal') {
        return savedTheme;
      }
    } catch (_error) {
      // Fallback on storage errors
    }
    return DEFAULT_THEME;
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch (_error) {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'classic') {
      root.removeAttribute('data-theme');
    } else {
      root.dataset.theme = theme;
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
