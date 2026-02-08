'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

export default function AdminSubscriptionsPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Subscriptions</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Foundations only for now. Next step: connect Stripe (or your provider) and store subscription status per
          tenant.
        </div>
      </AppShell>
    </Guard>
  );
}

