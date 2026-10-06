'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth, useApi } from './AuthContext';
import { isMedicalIndustry, medicalTranslation } from '../lib/medical-terminology';
import { MESSAGES } from '../i18n/messages';
import { translateStageName } from '../i18n/stageLabels';
import { isLanguageCode, LANGUAGE_STORAGE_KEY, type LanguageCode } from '../i18n/types';

type I18nContextValue = {
  language: LanguageCode;
  isMedicalWorkspace: boolean;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  stageName: (name: string) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function readInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isLanguageCode(stored)) return stored;
  return 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const pathname = usePathname();
  const api = useApi(token);
  const [workspace, setWorkspace] = useState<{tenantId: string; token: string; medical: boolean} | null>(null);
  const medical = workspace?.tenantId === user?.tenantId && workspace?.token === token && workspace.medical;
  useEffect(() => {
    if (!token || !user?.tenantId) return;
    let active = true;
    const refresh = () => api<{settings:{industry?:string|null}}>('/tenant/settings')
      .then(result => { if (active) setWorkspace({tenantId:user.tenantId, token, medical:isMedicalIndustry(result.settings?.industry)}); })
      .catch(() => { if (active) setWorkspace(null); });
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {active=false; window.removeEventListener('focus',refresh);};
  }, [api, token, user?.tenantId, pathname]);
  const [language, setLanguageState] = useState<LanguageCode>(readInitialLanguage);

  const setLanguage = useCallback((next: LanguageCode) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore storage issues (private mode, etc.)
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    } catch {
      // ignore
    }
  }, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const raw = MESSAGES[language]?.[key] ?? MESSAGES.en[key] ?? key;
      return interpolate(medicalTranslation(key, raw, language, Boolean(medical)), params);
    },
    [language, medical],
  );

  const stageName = useCallback((name: string) => translateStageName(language, name), [language]);

  const value = useMemo(() => ({ language, isMedicalWorkspace: Boolean(medical), setLanguage, t, stageName }), [language, medical, setLanguage, t, stageName]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
