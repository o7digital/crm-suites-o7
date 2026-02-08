'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

const nav = [
  { href: '/', label: 'Dashboard' },
  { href: '/clients', label: 'Clients' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/crm', label: 'CRM' },
  { href: '/post-sales', label: 'POST-SALES' },
  { href: '/ia-pulse', label: 'o7 IA Pulse' },
  { href: '/forecast', label: 'Forecast' },
  { href: '/export', label: 'Export' },
  { href: '/admin', label: 'Admin' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

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
      { href: '/account', label: 'My information' },
      { href: '/account/company', label: 'Company detail' },
      { href: '/account/adjustments', label: 'Adjustments' },
    ],
    [],
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[rgba(12,17,34,0.9)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-slate-900 font-semibold">
              PC
            </div>
            <div>
              <p className="text-lg font-semibold">PulseCRM</p>
              <p className="text-xs text-slate-400">Tenant-ready SaaS</p>
            </div>
          </div>
          <nav className="hidden items-center gap-3 text-sm font-medium text-slate-200 md:flex">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 transition ${
                    active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {item.label}
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
                  My Account
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
                          {item.label}
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
                        Logout
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link href="/login" className="btn-secondary text-sm">
                Log in
              </Link>
            )}
          </div>
        </div>
        <div className="mx-auto block max-w-7xl px-4 pb-4 md:hidden">
          <nav className="flex flex-wrap gap-2 text-sm font-medium text-slate-200">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 transition ${
                    active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
