'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

export default function AccountCompanyPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">My Account</p>
          <h1 className="text-3xl font-semibold">Company detail</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Foundations only for now. Next: store company profile on the tenant (name, address, tax IDs, billing emails).
        </div>
      </AppShell>
    </Guard>
  );
}

