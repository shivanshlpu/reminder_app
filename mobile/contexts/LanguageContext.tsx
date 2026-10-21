/**
 * Language Context Provider
 * Supports switching between English ('en') [Default] and Hindi ('hi').
 * Persists user preference across app reloads via AsyncStorage & localStorage.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations, Language, TranslationKey } from '../constants/translations';

const STORAGE_LANG_KEY = '@app_language';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  toggleLanguage: () => Promise<void>;
  t: (key: TranslationKey, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const getInitialLang = (): Language => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(STORAGE_LANG_KEY);
        if (stored === 'en' || stored === 'hi') return stored;
      } catch (e) {}
    }
    return 'en'; // English is primary default
  };

  const [language, setLanguageState] = useState<Language>(getInitialLang);

  useEffect(() => {
    const loadSavedLang = async () => {
      try {
        let stored = await AsyncStorage.getItem(STORAGE_LANG_KEY);
        if (!stored && typeof window !== 'undefined' && window.localStorage) {
          stored = window.localStorage.getItem(STORAGE_LANG_KEY) as string | null;
        }
        if (stored === 'en' || stored === 'hi') {
          setLanguageState(stored);
        }
      } catch (e) {
        console.warn('Failed to load stored language preference', e);
      }
    };
    loadSavedLang();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(STORAGE_LANG_KEY, lang);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_LANG_KEY, lang);
      }
    } catch (e) {
      console.warn('Failed to save language preference', e);
    }
  }, []);

  const toggleLanguage = useCallback(async () => {
    const nextLang: Language = language === 'en' ? 'hi' : 'en';
    await setLanguage(nextLang);
  }, [language, setLanguage]);

  const t = useCallback(
    (key: TranslationKey, fallback?: string): string => {
      const dict = translations[language] || translations.en;
      if (dict && (dict as any)[key]) {
        return (dict as any)[key];
      }
      return (translations.en as any)[key] || fallback || String(key);
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
