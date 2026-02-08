'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

export default function AdminContractsPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Contracts</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Goal: contract templates with fixed + variable fields, linked to clients/deals, with PDF export later.
        </div>
      </AppShell>
    </Guard>
  );
}

