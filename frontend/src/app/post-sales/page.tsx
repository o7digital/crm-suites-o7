'use client';

import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';

export default function PostSalesPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Post-Sales</p>
          <h1 className="text-3xl font-semibold">Customer Delivery</h1>
        </div>

        <div className="card p-6 text-slate-300">
          This module will track after-WON steps (invoice, payment transfer, onboarding, delivery, support).
        </div>
      </AppShell>
    </Guard>
  );
}

