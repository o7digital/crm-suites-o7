'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type User = {
  id: string;
  email: string;
  name: string;
  tenantId: string;
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

async function request(path: string, init: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'Request failed');
  }
  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cachedToken = localStorage.getItem('token');
    const cachedUser = localStorage.getItem('user');
    if (cachedToken && cachedUser) {
      setToken(cachedToken);
      setUser(JSON.parse(cachedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const register = async (payload: { tenantName: string; name: string; email: string; password: string }) => {
    const data = await request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = () => {
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
    const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
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
