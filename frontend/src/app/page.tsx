'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Guard } from '../components/Guard';
import { useApi, useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useI18n } from '../contexts/I18nContext';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat('en-US');

type DashboardPayload = {
  clients: number;
  tasks: Record<string, number>;
  leads: {
    open: number;
    total: number;
    openUsd: number;
    amountUsd: number;
    openByCurrency: { currency: string; count: number; amount: number }[];
    openValueUsd: number;
    fx?: {
      date: string | null;
      provider: string | null;
      missingCurrencies?: string[];
      error?: string | null;
    };
  };
  invoices: { total: number; amount: number; recent: InvoiceSummary[] };
};

type InvoiceSummary = {
  id: string;
  amount: number;
  currency: string;
  createdAt: string;
  status: string;
};

export default function DashboardPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let inFlight = false;
    let timer: number | null = null;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await api<DashboardPayload>('/dashboard');
        if (!active) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load metrics');
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };

    load();
    timer = window.setInterval(load, 15_000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [api, token]);

  return (
    <Guard>
      <AppShell>
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('dashboard.section')}</p>
            <h1 className="text-3xl font-semibold">{t('nav.dashboard')}</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/clients" className="btn-secondary">
              {t('dashboard.newClient')}
            </Link>
            <Link href="/admin/ocr-scan" className="btn-primary">
              {t('dashboard.uploadInvoice')}
            </Link>
          </div>
        </div>

        {loading && <div className="text-slate-300">{t('dashboard.loading')}</div>}
        {error && (
          <div className="text-red-300">
            {t('common.error')}: {error}
          </div>
        )}

        {data && (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <MetricCard
              title={t('nav.clients')}
              value={INT.format(data.clients)}
              hint={t('dashboard.clientsHint')}
            />
            <MetricCard
              title={t('dashboard.openTasks')}
              value={INT.format(data.tasks['PENDING'] || 0)}
              hint={t('dashboard.openTasksHint')}
            />
            <MetricCard
              title={t('dashboard.openLeads')}
              value={INT.format(data.leads.open ?? 0)}
              hint={t('dashboard.openLeadsHint')}
            />
            <MetricCard
              title={t('dashboard.totalLeads')}
              value={INT.format(data.leads.total ?? 0)}
              hint={t('dashboard.totalLeadsHint')}
            />
            <MetricCard
              title={t('dashboard.openPipelineValue')}
              value={USD.format(data.leads.openValueUsd ?? data.leads.amountUsd ?? 0)}
              hint={
                data.leads.fx?.error
                  ? t('dashboard.fxUnavailable', { amount: USD.format(data.leads.amountUsd ?? 0) })
                  : `${data.leads.fx?.date ? t('dashboard.fxDate', { date: data.leads.fx.date }) : t('dashboard.fxNA')}${
                      data.leads.fx?.missingCurrencies?.length
                        ? ` · ${t('dashboard.fxMissing', { currencies: data.leads.fx.missingCurrencies.join(', ') })}`
                        : ''
                    } · ${t('dashboard.usdOnly', { amount: USD.format(data.leads.amountUsd ?? 0) })}`
              }
            />
          </div>
        )}

        {data && (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{t('nav.tasks')}</p>
                <Link href="/tasks" className="text-xs text-cyan-300 underline">
                  {t('common.manage')}
                </Link>
              </div>
              <div className="mt-4 space-y-2">
                {Object.entries(data.tasks).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                    <span className="text-sm text-slate-300">{status}</span>
                    <span className="text-lg font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{t('dashboard.recentInvoices')}</p>
                <Link href="/admin/ocr-scan" className="text-xs text-cyan-300 underline">
                  {t('common.viewAll')}
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {data.invoices.recent.length === 0 && (
                  <p className="text-slate-400 text-sm">{t('dashboard.noInvoices')}</p>
                )}
                {data.invoices.recent.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">{inv.currency} {Number(inv.amount).toFixed(2)}</p>
                      <p className="text-xs text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">
                      {inv.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </Guard>
  );
}

function MetricCard({
  title,
  value,
  hint,
  valueClassName,
}: {
  title: string;
  value: string | number;
  hint: string;
  valueClassName?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className={valueClassName ?? 'mt-2 text-3xl font-semibold'}>{value}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}
