import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Language } from '../types';
import { isRtlLanguage, isValidLanguage, LANGUAGE_MAP } from './languages';
import { translations } from './translations';

interface LanguageContextType {
  language: Language;
  isRtl: boolean;
  setLanguage: (lang: Language) => void;
  restoreDefaultLanguage: () => void;
  bindUserLanguageScope: (userId: number | null, userPreferred?: string | null) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatNumber: (value: number) => string;
  formatShortDate: (isoDate?: string | null) => string;
  missingKeys: string[];
}

const GUEST_STORAGE_KEY = 'medora_lang_guest';
const LEGACY_STORAGE_KEY = 'medora_lang';

function resolveInitialGuestLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(GUEST_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  return isValidLanguage(saved) ? saved : 'en';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [language, setLanguageState] = useState<Language>(resolveInitialGuestLanguage);
  const missingSetRef = useRef<Set<string>>(new Set());
  const [missingKeys, setMissingKeys] = useState<string[]>([]);

  const applyDocumentLocale = useCallback((lang: Language) => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtlLanguage(lang) ? 'rtl' : 'ltr';
  }, []);

  useEffect(() => {
    applyDocumentLocale(language);
  }, [language, applyDocumentLocale]);

  const setLanguage = useCallback(
    (lang: Language) => {
      const target = isValidLanguage(lang) ? lang : 'en';
      setLanguageState(target);
      applyDocumentLocale(target);
      if (typeof window !== 'undefined') {
        if (activeUserId !== null) {
          localStorage.setItem(`medora_lang_user_${activeUserId}`, target);
        } else {
          localStorage.setItem(GUEST_STORAGE_KEY, target);
          localStorage.setItem(LEGACY_STORAGE_KEY, target);
        }
      }
    },
    [activeUserId, applyDocumentLocale]
  );

  const restoreDefaultLanguage = useCallback(() => {
    setLanguage('en');
  }, [setLanguage]);

  const bindUserLanguageScope = useCallback(
    (userId: number | null, userPreferred?: string | null) => {
      setActiveUserId(userId);
      if (userId === null) {
        const guest = resolveInitialGuestLanguage();
        setLanguageState(guest);
        applyDocumentLocale(guest);
        return;
      }

      if (isValidLanguage(userPreferred)) {
        setLanguageState(userPreferred);
        applyDocumentLocale(userPreferred);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`medora_lang_user_${userId}`, userPreferred);
        }
        return;
      }

      if (typeof window !== 'undefined') {
        const perUserSaved = localStorage.getItem(`medora_lang_user_${userId}`);
        if (isValidLanguage(perUserSaved)) {
          setLanguageState(perUserSaved);
          applyDocumentLocale(perUserSaved);
          return;
        }
      }

      setLanguageState('en');
      applyDocumentLocale('en');
    },
    [applyDocumentLocale]
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const currentDict = translations[language] || translations.en;
      let text = currentDict[key];

      if (!text) {
        if (language !== 'en' && !missingSetRef.current.has(`${language}:${key}`)) {
          missingSetRef.current.add(`${language}:${key}`);
          setMissingKeys(Array.from(missingSetRef.current));
        }
        text = translations.en[key] || key;
      }

      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [language]
  );

  const formatNumber = useCallback(
    (value: number): string => {
      try {
        const bcp = LANGUAGE_MAP[language]?.speechCode || 'en-IN';
        return new Intl.NumberFormat(bcp).format(value);
      } catch {
        return String(value);
      }
    },
    [language]
  );

  const formatShortDate = useCallback(
    (isoDate?: string | null): string => {
      if (!isoDate) return translations[language]?.['common.na'] || 'N/A';
      try {
        const clean = isoDate.split('T')[0];
        const parts = clean.split('-').map(Number);
        if (parts.length !== 3) return isoDate;
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        const bcp = LANGUAGE_MAP[language]?.speechCode || 'en-IN';
        return new Intl.DateTimeFormat(bcp, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(dt);
      } catch {
        return isoDate;
      }
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        isRtl: isRtlLanguage(language),
        setLanguage,
        restoreDefaultLanguage,
        bindUserLanguageScope,
        t,
        formatNumber,
        formatShortDate,
        missingKeys,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
