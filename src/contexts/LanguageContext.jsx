import { createContext, useContext, useState, useCallback } from 'react';
import { getItem, setItem } from '../utils/safeStorage';
import en from '../locales/en.json';
import zh from '../locales/zh.json';

const locales = { en, zh };

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return getItem('drummate_language') || 'en';
  });

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === 'en' ? 'zh' : 'en';
      setItem('drummate_language', next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key, params = {}) => {
      const keys = key.split('.');
      let value = locales[language];
      for (const k of keys) {
        value = value?.[k];
      }
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
    },
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
