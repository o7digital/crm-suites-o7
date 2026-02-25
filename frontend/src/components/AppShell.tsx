'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
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
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const { t } = useI18n();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

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

  const accountItems = useMemo(
    () => [
      { href: '/account', labelKey: 'account.myInformation' },
      { href: '/account/company', labelKey: 'account.companyDetail' },
      { href: '/account/adjustments', labelKey: 'account.adjustments' },
    ],
    [],
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[rgba(12,17,34,0.9)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {branding.logoDataUrl ? (
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoDataUrl} alt="Logo" className="h-full w-full object-contain p-1" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-slate-900">
                <div className="text-center leading-[0.95]">
                  <div className="text-[12px] font-extrabold">o7</div>
                  <div className="text-[10px] font-semibold">Pulse</div>
                </div>
              </div>
            )}
            <div>
              <p className="text-lg font-semibold">{user?.tenantName || 'o7 PulseCRM'}</p>
              <p className="text-xs text-slate-400">{t('app.tagline')}</p>
            </div>
          </div>
          <nav className="hidden items-center gap-3 text-sm font-medium text-slate-200 md:flex">
            {nav.map((item) => {
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
                    className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-[rgba(12,17,34,0.98)] shadow-lg shadow-black/30"
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
            {nav.map((item) => {
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
