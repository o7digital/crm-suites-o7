'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

export default function AdminMailPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Mail Integration</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Mailcow integration is planned. We can start with SMTP sending (from Railway env vars), then add inbox sync
          (IMAP) later.
        </div>
      </AppShell>
    </Guard>
  );
}

