'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
  register: (payload: { tenantName: string; name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session) {
        syncSession(session);
      }
      setLoading(false);
    });
  }, []);

  const syncSession = (session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>) => {
    const metadata = (session.user.user_metadata as any) || {};
    const tenantId = metadata.tenant_id || metadata.tenantId || session.user.id;
    const tenantName = metadata.tenant_name || metadata.tenantName;
    const mappedUser: User = {
      id: session.user.id,
      email: session.user.email || '',
      name: metadata.name || metadata.full_name || session.user.email || 'User',
      tenantId,
      tenantName,
    };
    setToken(session.access_token);
    setUser(mappedUser);
    localStorage.setItem('token', session.access_token);
    localStorage.setItem('user', JSON.stringify(mappedUser));
  };

  const bootstrapTenant = async (accessToken: string) => {
    await fetch(`${API_URL}/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => undefined);
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error(error?.message || 'Unable to login');
    }
    await bootstrapTenant(data.session.access_token);
    syncSession(data.session);
  };

  const register = async (payload: { tenantName: string; name: string; email: string; password: string }) => {
    const tenantId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          name: payload.name,
          tenant_id: tenantId,
          tenant_name: payload.tenantName,
        },
      },
    });
    if (error || !data.session) {
      throw new Error(error?.message || 'Unable to register');
    }
    await bootstrapTenant(data.session.access_token);
    syncSession(data.session);
  };

  const logout = () => {
    supabase.auth.signOut();
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
    }),
    [user, token, loading],
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
    return async (path: string, init?: RequestInit) => {
      const headers: Record<string, string> = { ...authHeader };
      if (!(init?.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      Object.assign(headers, init?.headers);

      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Request failed');
      }
      const ct = res.headers.get('content-type');
      if (ct && ct.includes('text/csv')) {
        return res.text();
      }
      return res.json();
    };
  }, [token]);
}
