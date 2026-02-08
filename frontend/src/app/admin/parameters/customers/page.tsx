'use client';

import Link from 'next/link';
import { AppShell } from '../../../../components/AppShell';
import { Guard } from '../../../../components/Guard';

export default function AdminParametersCustomersPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin · Parameters</p>
          <h1 className="text-3xl font-semibold">Customers</h1>
          <div className="mt-3 flex gap-2">
            <Link href="/admin/parameters" className="btn-secondary text-sm">
              Back
            </Link>
          </div>
        </div>

        <div className="card p-6">
          <p className="text-slate-200 font-semibold">New fields</p>
          <p className="mt-2 text-sm text-slate-400">
            Coming soon. This section will allow you to configure additional customer fields.
          </p>
        </div>
      </AppShell>
    </Guard>
  );
}
