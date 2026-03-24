'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Guard } from '../components/Guard';
import { useApi, useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useI18n } from '../contexts/I18nContext';
import { convertCurrency, type FxRatesSnapshot } from '../lib/fx';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat('en-US');

type Pipeline = {
  id: string;
  name: string;
  isDefault?: boolean;
};

type Stage = {
  id: string;
  probability: number;
  status: 'OPEN' | 'WON' | 'LOST';
  pipelineId: string;
};

type Deal = {
  id: string;
  value: number | string;
  currency: string;
  probability?: number | null;
  stageId: string;
  pipelineId: string;
};

type PipelineTotal = {
  pipelineId: string;
  name: string;
  open: number;
  weightedOpenValueUsd: number;
};

type DashboardApiPayload = {
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

type DashboardPayload = DashboardApiPayload & {
  pipelineTotals: PipelineTotal[];
};

type InvoiceSummary = {
  id: string;
  amount: number;
  currency: string;
  createdAt: string;
  status: string;
};

function clampProbability(value?: number | null) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

function buildPipelineTotals(
  pipelines: Pipeline[],
  stages: Stage[],
  deals: Deal[],
  fx: FxRatesSnapshot | null,
): PipelineTotal[] {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const totalsByPipeline = new Map<
    string,
    {
      pipelineId: string;
      name: string;
      open: number;
      currencyTotals: Record<string, number>;
    }
  >(
    pipelines.map((pipeline) => [
      pipeline.id,
      {
        pipelineId: pipeline.id,
        name: pipeline.name,
        open: 0,
        currencyTotals: {},
      },
    ]),
  );

  for (const deal of deals) {
    const stage = stageById.get(deal.stageId);
    if (!stage || stage.status !== 'OPEN') continue;

    const current =
      totalsByPipeline.get(deal.pipelineId) ?? {
        pipelineId: deal.pipelineId,
        name: deal.pipelineId,
        open: 0,
        currencyTotals: {},
      };

    current.open += 1;

    const value = Number(deal.value);
    if (Number.isFinite(value)) {
      const currency = (deal.currency || 'USD').toUpperCase();
      const probability = clampProbability(deal.probability ?? stage.probability);
      current.currencyTotals[currency] = (current.currencyTotals[currency] || 0) + value * probability;
    }

    totalsByPipeline.set(deal.pipelineId, current);
  }

  const sortWeight = (name: string) => {
    if (name === 'New Sales') return 0;
    if (name === 'Post Sales') return 1;
    return 2;
  };

  return Array.from(totalsByPipeline.values())
    .map((pipeline) => {
      const weightedOpenValueUsd = Object.entries(pipeline.currencyTotals).reduce((sum, [currency, amount]) => {
        if (!fx) return currency === 'USD' ? sum + amount : sum;
        const converted = convertCurrency(amount, currency, 'USD', fx);
        return converted === null ? sum : sum + converted;
      }, 0);

      return {
        pipelineId: pipeline.pipelineId,
        name: pipeline.name,
        open: pipeline.open,
        weightedOpenValueUsd,
      };
    })
    .sort((a, b) => {
      const rankDiff = sortWeight(a.name) - sortWeight(b.name);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
}

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
        const [dashboardResult, pipelinesResult, stagesResult, dealsResult, fxResult] = await Promise.allSettled([
          api<DashboardApiPayload>('/dashboard'),
          api<Pipeline[]>('/pipelines'),
          api<Stage[]>('/stages'),
          api<Deal[]>('/deals'),
          api<FxRatesSnapshot>('/fx/usd'),
        ]);

        if (dashboardResult.status !== 'fulfilled') {
          throw dashboardResult.reason;
        }

        const pipelineTotals =
          pipelinesResult.status === 'fulfilled' &&
          stagesResult.status === 'fulfilled' &&
          dealsResult.status === 'fulfilled'
            ? buildPipelineTotals(
                pipelinesResult.value,
                stagesResult.value,
                dealsResult.value,
                fxResult.status === 'fulfilled' ? fxResult.value : null,
              )
            : [];

        const next: DashboardPayload = {
          ...dashboardResult.value,
          pipelineTotals,
        };

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

  const primaryPipelineTotals = (() => {
    if (!data?.pipelineTotals?.length) return [];
    const preferred = ['New Sales', 'Post Sales']
      .map((name) => data.pipelineTotals.find((pipeline) => pipeline.name === name))
      .filter((pipeline): pipeline is PipelineTotal => Boolean(pipeline));
    return preferred.length > 0 ? preferred : data.pipelineTotals.slice(0, 2);
  })();

  const pipelineTotalsHint = data
    ? data.leads.fx?.error
      ? t('dashboard.fxUnavailable')
      : `${data.leads.fx?.date ? t('dashboard.fxDate', { date: data.leads.fx.date }) : t('dashboard.fxNA')}${
          data.leads.fx?.missingCurrencies?.length
            ? ` · ${t('dashboard.fxMissing', { currencies: data.leads.fx.missingCurrencies.join(', ') })}`
            : ''
        }`
    : '';

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
            <PipelineTotalsCard
              title={t('dashboard.openPipelineValue')}
              totals={primaryPipelineTotals}
              hint={pipelineTotalsHint}
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

function PipelineTotalsCard({
  title,
  totals,
  hint,
}: {
  title: string;
  totals: PipelineTotal[];
  hint: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <div className="mt-4 space-y-3">
        {totals.length === 0 ? (
          <p className="text-3xl font-semibold">—</p>
        ) : (
          totals.map((pipeline) => (
            <div
              key={pipeline.pipelineId}
              className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-3"
            >
              <p className="text-sm font-semibold text-slate-100">{pipeline.name}</p>
              <p className="text-lg font-semibold">{USD.format(pipeline.weightedOpenValueUsd)}</p>
            </div>
          ))
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
