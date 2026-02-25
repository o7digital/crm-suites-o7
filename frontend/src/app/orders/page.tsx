'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';

type DashboardPayload = {
  leads: {
    open: number;
    total: number;
  };
};

type Invoice = {
  id: string;
  amount: number | string;
  currency: string;
  status: string;
  createdAt: string;
};

const MONEY = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export default function OrdersPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    Promise.all([api<DashboardPayload>('/dashboard'), api<Invoice[]>('/invoices')])
      .then(([dashboardData, invoicesData]) => {
        if (!active) return;
        setDashboard(dashboardData);
        setInvoices(invoicesData);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load orders data');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  const pendingPayments = useMemo(() => {
    const paidPattern = /(paid|settled|payed|paye|pagado|pagada|pagado)/i;
    return invoices.filter((invoice) => !paidPattern.test(invoice.status || '')).length;
  }, [invoices]);

  const invoiceExposure = useMemo(() => {
    const totals = invoices.reduce<Record<string, number>>((acc, invoice) => {
      const currency = String(invoice.currency || 'USD').toUpperCase();
      const amount = Number(invoice.amount || 0);
      if (!Number.isFinite(amount)) return acc;
      acc[currency] = (acc[currency] || 0) + amount;
      return acc;
    }, {});

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([currency, total]) => `${currency} ${MONEY.format(total)}`)
      .join(' · ');
  }, [invoices]);

  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 6),
    [invoices],
  );

  return (
    <Guard>
      <AppShell>
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('orders.section')}</p>
          <h1 className="text-3xl font-semibold">{t('nav.orders')}</h1>
          <p className="text-sm text-slate-400">{t('orders.subtitle')}</p>
        </div>

        {loading ? <p className="text-slate-300">{t('common.loading')}</p> : null}
        {error ? (
          <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {t('common.error')}: {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard title={t('orders.openDeals')} value={String(dashboard?.leads.open ?? 0)} />
          <MetricCard title={t('orders.totalDeals')} value={String(dashboard?.leads.total ?? 0)} />
          <MetricCard title={t('orders.pendingPayments')} value={String(pendingPayments)} />
          <MetricCard title={t('orders.totalInvoices')} value={String(invoices.length)} />
          <MetricCard title={t('orders.currencyExposure')} value={invoiceExposure || '—'} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ActionCard
            title={t('orders.card.orders.title')}
            description={t('orders.card.orders.description')}
            action={t('orders.card.orders.action')}
            href="/crm"
          />
          <ActionCard
            title={t('orders.card.payments.title')}
            description={t('orders.card.payments.description')}
            action={t('orders.card.payments.action')}
            href="/admin/ocr-scan"
          />
          <ActionCard
            title={t('orders.card.invoices.title')}
            description={t('orders.card.invoices.description')}
            action={t('orders.card.invoices.action')}
            href="/export"
          />
        </div>

        <div className="card mt-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('orders.invoicesTitle')}</h2>
            <Link href="/admin/ocr-scan" className="text-xs text-cyan-300 underline">
              {t('common.viewAll')}
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-slate-400">{t('orders.noInvoices')}</p>
          ) : (
            <div className="space-y-3">
              {recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {String(invoice.currency || 'USD').toUpperCase()} {MONEY.format(Number(invoice.amount || 0))}
                    </p>
                    <p className="text-xs text-slate-400">{new Date(invoice.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">{invoice.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </Guard>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  action,
  href,
}: {
  title: string;
  description: string;
  action: string;
  href: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      <Link href={href} className="btn-secondary mt-4 inline-flex text-sm">
        {action}
      </Link>
    </div>
  );
}
