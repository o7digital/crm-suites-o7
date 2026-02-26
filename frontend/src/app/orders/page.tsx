'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { getClientDisplayName } from '../../lib/clients';

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
  issuedDate?: string | null;
  dueDate?: string | null;
  client?: {
    id: string;
    firstName?: string | null;
    name?: string | null;
  } | null;
};

type Deal = {
  id: string;
  title: string;
  value: number | string;
  currency: string;
  expectedCloseDate?: string | null;
  createdAt?: string;
  stage?: { id: string; name: string; status: 'OPEN' | 'WON' | 'LOST' } | null;
  client?: {
    id: string;
    firstName?: string | null;
    name?: string | null;
  } | null;
};

const MONEY = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export default function OrdersPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t, language } = useI18n();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    Promise.all([api<DashboardPayload>('/dashboard'), api<Invoice[]>('/invoices'), api<Deal[]>('/deals')])
      .then(([dashboardData, invoicesData, dealsData]) => {
        if (!active) return;
        setDashboard(dashboardData);
        setInvoices(invoicesData);
        setDeals(dealsData);
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

  const listedDeals = useMemo(
    () =>
      [...deals].sort((a, b) => {
        const aDate = a.createdAt ? +new Date(a.createdAt) : 0;
        const bDate = b.createdAt ? +new Date(b.createdAt) : 0;
        return bDate - aDate;
      }),
    [deals],
  );

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString(language);
  };

  const downloadExcelCsv = () => {
    if (listedDeals.length === 0) return;

    const headers = [
      t('orders.table.id'),
      t('orders.table.title'),
      t('orders.table.client'),
      t('orders.table.amount'),
      t('orders.table.currency'),
      t('orders.table.status'),
      t('orders.table.stage'),
      t('orders.table.closingDate'),
      t('orders.table.createdAt'),
    ];

    const escapeCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = listedDeals.map((deal) => [
      deal.id,
      deal.title || '',
      deal.client ? getClientDisplayName(deal.client) : t('invoices.unassigned'),
      Number(deal.value || 0).toFixed(2),
      String(deal.currency || 'USD').toUpperCase(),
      deal.stage?.status ? t(`stageStatus.${deal.stage.status}`) : '',
      deal.stage?.name || '',
      formatDate(deal.expectedCloseDate),
      formatDate(deal.createdAt),
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orders-${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('orders.invoicesTitle')}</h2>
              <p className="text-xs text-slate-400">{t('orders.listCount', { count: listedDeals.length })}</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-primary text-sm" onClick={downloadExcelCsv} disabled={listedDeals.length === 0}>
                {t('orders.exportExcel')}
              </button>
              <Link href="/crm" className="text-xs text-cyan-300 underline">
                {t('common.viewAll')}
              </Link>
            </div>
          </div>
          {listedDeals.length === 0 ? (
            <p className="text-sm text-slate-400">{t('orders.noOrders')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 text-left">{t('orders.table.id')}</th>
                    <th className="pb-2 text-left">{t('orders.table.title')}</th>
                    <th className="pb-2 text-left">{t('orders.table.client')}</th>
                    <th className="pb-2 text-right">{t('orders.table.amount')}</th>
                    <th className="pb-2 text-left">{t('orders.table.status')}</th>
                    <th className="pb-2 text-left">{t('orders.table.stage')}</th>
                    <th className="pb-2 text-left">{t('orders.table.closingDate')}</th>
                    <th className="pb-2 text-left">{t('orders.table.createdAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {listedDeals.map((deal) => (
                    <tr key={deal.id} className="border-t border-white/5">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-300">{deal.id.slice(0, 8)}</td>
                      <td className="py-2 pr-3 text-left text-slate-200">{deal.title || '—'}</td>
                      <td className="py-2 pr-3 text-left text-slate-200">
                        {deal.client ? getClientDisplayName(deal.client) : t('invoices.unassigned')}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {String(deal.currency || 'USD').toUpperCase()} {MONEY.format(Number(deal.value || 0))}
                      </td>
                      <td className="py-2 pr-3 text-left">
                        <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-xs text-emerald-200">
                          {deal.stage?.status ? t(`stageStatus.${deal.stage.status}`) : '—'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-left text-slate-300">{deal.stage?.name || '—'}</td>
                      <td className="py-2 pr-3 text-left text-slate-300">{formatDate(deal.expectedCloseDate)}</td>
                      <td className="py-2 text-left text-slate-300">{formatDate(deal.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
