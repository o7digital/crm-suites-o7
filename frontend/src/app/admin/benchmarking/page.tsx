'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

export default function AdminBenchmarkingPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Benchmarking</h1>
        </div>

        <div className="card p-6 text-slate-300">
          This section will help compare mailing tools (Mailchimp, Brevo, Mailcow, etc.) and track results.
        </div>
      </AppShell>
    </Guard>
  );
}

