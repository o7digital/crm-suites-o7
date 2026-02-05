'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { ReactNode } from 'react';

const nav = [
  { href: '/', label: 'Dashboard' },
  { href: '/clients', label: 'Clients' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/export', label: 'Export' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[rgba(12,17,34,0.9)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
              <>
                <div className="text-right">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <button className="btn-secondary text-sm" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <Link href="/login" className="btn-secondary text-sm">
                Log in
              </Link>
            )}
          </div>
        </div>
        <div className="mx-auto block max-w-6xl px-6 pb-4 md:hidden">
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
