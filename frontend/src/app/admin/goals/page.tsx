'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

export default function AdminGoalsPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Objectives</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Next: define monthly/quarterly goals (amount + currency) and compare to actual pipeline / won revenue.
        </div>
      </AppShell>
    </Guard>
  );
}

