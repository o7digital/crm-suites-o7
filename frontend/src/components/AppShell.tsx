'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApi, useAuth } from '../contexts/AuthContext';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useBranding } from '../contexts/BrandingContext';

const nav = [
  { href: '/', labelKey: 'nav.dashboard' },
  { href: '/clients', labelKey: 'nav.clients' },
  { href: '/tasks', labelKey: 'nav.tasks' },
  { href: '/crm', labelKey: 'nav.crm' },
  { href: '/post-sales', labelKey: 'nav.postSales' },
  { href: '/orders', labelKey: 'nav.orders' },
  { href: '/ia-pulse', labelKey: 'nav.iaPulse' },
  { href: '/forecast', labelKey: 'nav.forecast' },
  { href: '/export', labelKey: 'nav.export' },
  { href: '/admin', labelKey: 'nav.admin' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, token } = useAuth();
  const api = useApi(token);
  const { branding } = useBranding();
  const { t } = useI18n();
  const [accountOpen, setAccountOpen] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER' | null>(null);
  const [themeMode, setThemeMode] = useState<'night' | 'day'>('night');
  const accountRef = useRef<HTMLDivElement | null>(null);
  const themeStorageKey = 'o7-theme-mode';

  const showAdminBackToTop = Boolean(pathname && pathname !== '/admin' && pathname.startsWith('/admin/'));

  const isActiveRoute = useCallback(
    (href: string) => {
      if (!pathname) return false;
      if (href === '/') return pathname === '/';
      return pathname === href || pathname.startsWith(`${href}/`);
    },
    [pathname],
  );

  useEffect(() => {
    if (!token) {
      setWorkspaceRole(null);
      return;
    }
    api<{ role?: 'OWNER' | 'ADMIN' | 'MEMBER' }>('/admin/context')
      .then((data) => {
        setWorkspaceRole(data?.role || null);
      })
      .catch(() => {
        setWorkspaceRole(null);
      });
  }, [api, token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(themeStorageKey);
    if (saved === 'day' || saved === 'night') {
      setThemeMode(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const setVar = (name: string, value: string | null) => {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    };

    if (themeMode === 'day') {
      root.style.colorScheme = 'light';
      root.dataset.themeMode = 'day';
      setVar('--background', '#dbeafe');
      setVar('--surface', '#f8fbff');
      setVar('--card', '#ffffff');
      setVar('--foreground', '#0b1220');
      setVar('--muted', '#334155');
      setVar('--accent', branding.accentColor || '#2563eb');
      setVar('--accent-2', branding.accentColor2 || '#0ea5e9');
      return;
    }

    root.style.colorScheme = 'dark';
    root.dataset.themeMode = 'night';
    setVar('--background', branding.backgroundColor);
    setVar('--surface', branding.surfaceColor);
    setVar('--card', branding.cardColor);
    setVar('--foreground', branding.foregroundColor);
    setVar('--muted', branding.mutedColor);
    setVar('--accent', branding.accentColor);
    setVar('--accent-2', branding.accentColor2);
  }, [branding, themeMode]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!accountOpen) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (accountRef.current && accountRef.current.contains(target)) return;
      setAccountOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [accountOpen]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === 'night' ? 'day' : 'night';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(themeStorageKey, next);
      }
      return next;
    });
  }, []);

  const accountItems = useMemo(
    () => [
      { href: '/account', labelKey: 'account.myInformation' },
      { href: '/account/company', labelKey: 'account.companyDetail' },
      { href: '/account/adjustments', labelKey: 'account.adjustments' },
    ],
    [],
  );

  const canAccessPostSales = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
  const filteredNav = useMemo(
    () => nav.filter((item) => (item.href === '/post-sales' ? canAccessPostSales : true)),
    [canAccessPostSales],
  );

  return (
    <div className="min-h-screen">
      <header className="app-header sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {branding.logoDataUrl ? (
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoDataUrl} alt="Logo" className="h-full w-full object-contain p-1" />
              </div>
            ) : (
              <div className="brand-mark flex h-28 w-28 items-center justify-center rounded-xl">
                <div className="text-center leading-[0.95]">
                  <div className="text-[30px] font-extrabold">o7</div>
                  <div className="text-[24px] font-semibold">Pulse</div>
                </div>
              </div>
            )}
            <div>
              <p className="text-lg font-semibold">{user?.tenantName || 'o7 PulseCRM'}</p>
              <p className="text-xs text-slate-400">{t('app.tagline')}</p>
            </div>
          </div>
          <nav className="hidden items-center gap-3 text-sm font-medium text-slate-200 md:flex">
            {filteredNav.map((item) => {
              const active = isActiveRoute(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${active ? 'nav-link-active' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary text-sm" onClick={toggleThemeMode}>
              <span
                aria-hidden="true"
                className="inline-flex h-6 w-6 items-center justify-center"
                style={{ color: themeMode === 'night' ? '#f8fafc' : '#0b1220' }}
              >
                {themeMode === 'night' ? (
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                    <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 1 0 11.5 11.5z" />
                  </svg>
                )}
              </span>
              <span className="sr-only">{themeMode === 'night' ? 'Switch to day mode' : 'Switch to night mode'}</span>
            </button>
            {user ? (
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setAccountOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                >
                  {t('auth.myAccount')}
                </button>

                {accountOpen ? (
                  <div
                    className="app-menu absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border shadow-lg shadow-black/30"
                    role="menu"
                  >
                    <div className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-100">{user.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{user.email}</p>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="py-2">
                      {accountItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="block px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                          role="menuitem"
                          onClick={() => setAccountOpen(false)}
                        >
                          {t(item.labelKey)}
                        </Link>
                      ))}
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="p-2">
                      <button
                        type="button"
                        className="w-full rounded-lg border border-red-500/30 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10"
                        onClick={handleLogout}
                        role="menuitem"
                      >
                        {t('auth.logout')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link href="/login" className="btn-secondary text-sm">
                {t('auth.login')}
              </Link>
            )}
          </div>
        </div>
        <div className="mx-auto block max-w-7xl px-4 pb-4 md:hidden">
          <nav className="flex flex-wrap gap-2 text-sm font-medium text-slate-200">
            {filteredNav.map((item) => {
              const active = isActiveRoute(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${active ? 'nav-link-active' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {showAdminBackToTop ? (
          <div className="mb-4 flex items-center justify-end">
            <Link href="/admin" className="btn-secondary text-sm">
              {t('admin.backToTop')}
            </Link>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
