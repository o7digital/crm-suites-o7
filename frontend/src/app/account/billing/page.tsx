'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import { useI18n } from '../../../contexts/I18nContext';

const PLANS = [
  { id: 'PULSE_BASIC', name: 'Basic', price: 19, seats: 1 },
  { id: 'PULSE_STANDARD', name: 'Standard', price: 39, seats: 3 },
  { id: 'PULSE_ADVANCED', name: 'Advanced', price: 49, seats: 5 },
  { id: 'PULSE_ADVANCED_PLUS', name: 'Advanced Plus', price: 89, seats: 10 },
  { id: 'PULSE_TEAM', name: 'Team', price: 139, seats: 30 },
] as const;

type PlanId = (typeof PLANS)[number]['id'];

function BillingContent() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState('');
  const billingStatus = searchParams.get('billing');

  const startCheckout = async (plan: PlanId) => {
    setError('');
    setLoadingPlan(plan);
    try {
      const checkout = await api<{ url?: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (!checkout.url) throw new Error('Stripe Checkout URL is missing.');
      window.location.assign(checkout.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to open Stripe Checkout.');
      setLoadingPlan(null);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('account.myAccount')}</p>
          <h1 className="text-3xl font-semibold">{t('account.billing')}</h1>
          <p className="mt-2 text-sm text-slate-400">Choose the monthly plan for your workspace.</p>
        </div>

        {billingStatus === 'success' ? (
          <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Subscription confirmed. Your workspace access is being updated.
          </div>
        ) : null}
        {billingStatus === 'canceled' ? (
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Checkout canceled. No subscription change was applied.
          </div>
        ) : null}
        {error ? (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {PLANS.map((plan) => {
            const isLoading = loadingPlan === plan.id;
            return (
              <section key={plan.id} className="card flex min-h-64 flex-col p-5">
                <h2 className="text-lg font-semibold text-slate-100">{plan.name}</h2>
                <p className="mt-4 text-3xl font-semibold text-white">
                  ${plan.price}
                  <span className="text-sm font-normal text-slate-400"> / month</span>
                </p>
                <p className="mt-3 text-sm text-slate-300">
                  {plan.seats} {plan.seats === 1 ? 'seat' : 'seats'}
                </p>
                <button
                  type="button"
                  className="btn-primary mt-auto w-full text-sm"
                  disabled={loadingPlan !== null}
                  onClick={() => startCheckout(plan.id)}
                >
                  {isLoading ? 'Opening Checkout...' : 'Subscribe'}
                </button>
              </section>
            );
          })}
        </div>
      </AppShell>
    </Guard>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}
