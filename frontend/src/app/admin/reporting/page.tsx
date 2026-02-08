'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

export default function AdminReportingPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Reporting</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Next: add charts for pipeline totals, won revenue over time, and performance by stage/user.
        </div>
      </AppShell>
    </Guard>
  );
}

