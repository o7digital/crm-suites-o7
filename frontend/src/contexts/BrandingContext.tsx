'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useApi, useAuth } from './AuthContext';

type Branding = {
  logoDataUrl: string | null;
  accentColor: string | null;
  accentColor2: string | null;
};

type BrandingContextValue = {
  branding: Branding;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateBranding: (patch: Partial<Branding>) => Promise<void>;
};

const DEFAULT_BRANDING: Branding = {
  logoDataUrl: null,
  accentColor: null,
  accentColor2: null,
};

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

function applyCssVars(branding: Branding) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const setVar = (name: string, value: string | null) => {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  };

  setVar('--accent', branding.accentColor);
  setVar('--accent-2', branding.accentColor2);
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const api = useApi(token);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !user?.tenantId) {
      setBranding(DEFAULT_BRANDING);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api<{
        branding: Branding;
      }>('/tenant/branding', { method: 'GET' });
      setBranding({
        logoDataUrl: data.branding?.logoDataUrl ?? null,
        accentColor: data.branding?.accentColor ?? null,
        accentColor2: data.branding?.accentColor2 ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load branding';
      setError(message);
      setBranding(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }, [api, token, user?.tenantId]);

  const updateBranding = useCallback(
    async (patch: Partial<Branding>) => {
      if (!token || !user?.tenantId) throw new Error('Not authenticated');
      setLoading(true);
      setError(null);
      try {
        const data = await api<{
          branding: Branding;
        }>('/tenant/branding', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        setBranding({
          logoDataUrl: data.branding?.logoDataUrl ?? null,
          accentColor: data.branding?.accentColor ?? null,
          accentColor2: data.branding?.accentColor2 ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update branding';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api, token, user?.tenantId],
  );

  useEffect(() => {
    // Keep CSS variables in sync with state.
    applyCssVars(branding);
  }, [branding]);

  useEffect(() => {
    // Refresh on tenant change / login.
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // On logout: reset CSS vars.
    if (token) return;
    applyCssVars(DEFAULT_BRANDING);
    setBranding(DEFAULT_BRANDING);
    setError(null);
  }, [token]);

  const value = useMemo(
    () => ({
      branding,
      loading,
      error,
      refresh,
      updateBranding,
    }),
    [branding, error, loading, refresh, updateBranding],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
  return ctx;
}

