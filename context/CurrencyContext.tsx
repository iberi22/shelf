
import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';

type NumberFormat = 'en-US' | 'de-DE';

interface CurrencyContextType {
  currencyCode: string;
  setCurrencyCode: (currency: string) => void;
  numberFormat: NumberFormat;
  setNumberFormat: (format: NumberFormat) => void;
  formatCurrency: (value: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currencyCode, setCurrencyCode] = useLocalStorage<string>('currencyCode', 'USD');
  const [numberFormat, setNumberFormat] = useLocalStorage<NumberFormat>('numberFormat', 'en-US');

  const formatCurrency = useCallback((value: number): string => {
    if (typeof value !== 'number') {
      return '';
    }
    try {
      return new Intl.NumberFormat(numberFormat, {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch (e) {
      console.error('Error formatting currency (falling back):', e);
      // Fallback for invalid currency codes, though UI should prevent this.
      return `${currencyCode} ${value.toFixed(2)}`;
    }
  }, [currencyCode, numberFormat]);
  

  const value = { currencyCode, setCurrencyCode, numberFormat, setNumberFormat, formatCurrency };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
