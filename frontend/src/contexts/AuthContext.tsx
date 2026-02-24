'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabaseClient';
import { API_BASE_URL } from '../lib/apiBase';

type User = {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantName?: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    tenantId?: string;
    tenantName: string;
    name: string;
    email: string;
    password: string;
    inviteToken?: string;
  }) => Promise<'signed-in' | 'confirm'>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function generateTenantId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback that remains deterministic per call without running during render
  return `tenant-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const safeSupabase = useCallback(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const mustSupabase = useCallback(() => {
    const client = safeSupabase();
    if (!client) throw new Error('Supabase configuration is missing');
    return client;
  }, [safeSupabase]);

  const syncSession = useCallback((session: Session) => {
    const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;
    const tenantId =
      (metadata.tenant_id as string | undefined) ||
      (metadata.tenantId as string | undefined) ||
      session.user.id;
    const tenantName =
      (metadata.tenant_name as string | undefined) || (metadata.tenantName as string | undefined);

    const mappedUser: User = {
      id: session.user.id,
      email: session.user.email || '',
      name: (metadata.name as string) || (metadata.full_name as string) || session.user.email || 'User',
      tenantId,
      tenantName,
    };

    setToken(session.access_token);
    setUser(mappedUser);
    localStorage.setItem('token', session.access_token);
    localStorage.setItem('user', JSON.stringify(mappedUser));
  }, []);

  const bootstrapTenant = useCallback(async (accessToken: string) => {
    await fetch(`${API_BASE_URL}/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = safeSupabase();
      if (!supabase) {
        if (active) setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;
      if (session) {
        // Keep tenant bootstrap up-to-date for existing sessions (new pipelines/stages, etc.).
        await bootstrapTenant(session.access_token);
        syncSession(session);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [bootstrapTenant, safeSupabase, syncSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const supabase = mustSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        throw new Error(error?.message || 'Unable to login');
      }
      await bootstrapTenant(data.session.access_token);
      syncSession(data.session);
    },
    [bootstrapTenant, mustSupabase, syncSession],
  );

  const register = useCallback(
    async (payload: {
      tenantId?: string;
      tenantName: string;
      name: string;
      email: string;
      password: string;
      inviteToken?: string;
    }) => {
      const tenantId = payload.tenantId || generateTenantId();
      const supabase = mustSupabase();
      const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: {
            name: payload.name,
            tenant_id: tenantId,
            tenant_name: payload.tenantName,
            invite_token: payload.inviteToken || undefined,
          },
          emailRedirectTo,
        },
      });
      if (error) {
        throw new Error(error.message || 'Unable to register');
      }
      if (!data.session) {
        return 'confirm';
      }
      await bootstrapTenant(data.session.access_token);
      syncSession(data.session);
      return 'signed-in';
    },
    [bootstrapTenant, mustSupabase, syncSession],
  );

  const clearAuthStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) return;
      const projectRef = new URL(supabaseUrl).host.split('.')[0];
      localStorage.removeItem(`sb-${projectRef}-auth-token`);
    } catch {
      // ignore malformed URL / storage issues
    }
  }, []);

  const logout = useCallback(async () => {
    const supabase = safeSupabase();
    try {
      await supabase?.auth.signOut();
    } catch {
      // ignore logout errors and still clear local session
    }
    setToken(null);
    setUser(null);
    clearAuthStorage();
  }, [clearAuthStorage, safeSupabase]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
    }),
    [loading, login, logout, register, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useApi(token: string | null) {
  return useMemo(() => {
    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
      const requestUrl = `${API_BASE_URL}${path}`;
      const headers: Record<string, string> = { ...authHeader };
      if (!(init?.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      Object.assign(headers, init?.headers);

      // Avoid stale metrics when proxies/browsers cache API responses.
      const cache = init?.cache ?? 'no-store';
      const res = await fetch(requestUrl, {
        ...init,
        headers,
        cache,
      });
      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        let message = '';

        const extractMessage = (payload: unknown): string => {
          if (!payload) return '';
          if (typeof payload === 'string') return payload;
          if (typeof payload === 'object') {
            const obj = payload as Record<string, unknown>;
            const m = obj.message;
            if (typeof m === 'string') return m;
            if (Array.isArray(m)) {
              const parts = m.filter((x) => typeof x === 'string') as string[];
              if (parts.length) return parts.join('; ');
            }
            if (typeof obj.error === 'string') return obj.error;
          }
          try {
            return JSON.stringify(payload);
          } catch {
            return '';
          }
        };

        try {
          if (contentType.includes('application/json')) {
            message = extractMessage(await res.json());
          } else {
            const text = await res.text();
            message = text;
            try {
              message = extractMessage(JSON.parse(text));
            } catch {
              // keep raw text
            }
          }
        } catch {
          // ignore parsing errors and fall through
        }

        throw new Error(`${message || `Request failed (${res.status})`} [${res.status}] @ ${requestUrl}`);
      }
      const ct = res.headers.get('content-type');
      if (ct && ct.includes('text/csv')) {
        return (await res.text()) as T;
      }
      return (await res.json()) as T;
    };
  }, [token]);
}
