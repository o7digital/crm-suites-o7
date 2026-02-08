'use client';

import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useAuth } from '../../contexts/AuthContext';

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">My Account</p>
          <h1 className="text-3xl font-semibold">My information</h1>
        </div>

        <div className="card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Name</p>
              <p className="mt-1 text-sm text-slate-200">{user?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Email</p>
              <p className="mt-1 text-sm text-slate-200">{user?.email || '—'}</p>
            </div>
          </div>
        </div>
      </AppShell>
    </Guard>
  );
}

