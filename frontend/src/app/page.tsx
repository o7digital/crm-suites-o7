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
  prospects?: number;
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

function isO7DigitalTenant(tenantName?: string | null) {
  const normalized = (tenantName || '').trim().toLowerCase();
  return normalized.includes('o7 digital') || normalized.includes('o7');
}

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
  opts?: { tenantName?: string | null },
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

  const displayPipelineName = (name: string) => {
    if (isO7DigitalTenant(opts?.tenantName) && name === 'Post Sales') return 'Sales Existing Customers';
    return name;
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
        name: displayPipelineName(pipeline.name),
        open: pipeline.open,
        weightedOpenValueUsd,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function DashboardPage() {
  const { token, user } = useAuth();
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
                { tenantName: user?.tenantName },
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
  }, [api, token, user?.tenantName]);

  const primaryPipelineTotals = data?.pipelineTotals ?? [];
  const weightedPipelineTotal = primaryPipelineTotals.reduce(
    (sum, pipeline) => sum + pipeline.weightedOpenValueUsd,
    0,
  );
  const strongestPipeline = primaryPipelineTotals.reduce<PipelineTotal | null>((best, pipeline) => {
    if (!best) return pipeline;
    return pipeline.weightedOpenValueUsd > best.weightedOpenValueUsd ? pipeline : best;
  }, null);

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
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">Overview</p>
            <h1 className="mt-1 text-3xl font-semibold">{t('nav.dashboard')}</h1>
            <p className="mt-1 text-sm text-slate-400">Resumen comercial y operativo en tiempo real</p>
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title={t('nav.clients')}
              value={INT.format(data.clients)}
              hint={`Prospectos: ${INT.format(data.prospects ?? 0)}`}
              tone="violet"
            />
            <MetricCard
              title={t('dashboard.openTasks')}
              value={INT.format(data.tasks['PENDING'] || 0)}
              hint="Pendientes en los clientes"
              tone="amber"
            />
            <MetricCard
              title={t('dashboard.openLeads')}
              value={INT.format(data.leads.open ?? 0)}
              hint="Deals en curso"
              tone="teal"
            />
            <MetricCard
              title={t('dashboard.totalLeads')}
              value={INT.format(data.leads.total ?? 0)}
              hint="Open + won + lost"
              tone="green"
            />
            <MetricCard
              title="Valor total ponderado"
              value={USD.format(weightedPipelineTotal)}
              hint={strongestPipeline ? strongestPipeline.name : 'Sin pipeline activo'}
              tone="violet"
              bars={primaryPipelineTotals.slice(0, 8).map((pipeline) => pipeline.weightedOpenValueUsd)}
            />
          </div>
        )}

        {data && (
          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-9">
              <PipelineTotalsCard
                totals={primaryPipelineTotals}
                total={weightedPipelineTotal}
                hint={pipelineTotalsHint}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <TasksCard tasks={data.tasks} />
                <InvoicesCard invoices={data.invoices.recent} />
              </div>
            </div>

            <aside className="space-y-4 lg:col-span-3">
              <IAPulseCard />
              <ActivityCard />
            </aside>
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
  tone = 'violet',
  bars,
}: {
  title: string;
  value: string | number;
  hint: string;
  tone?: 'violet' | 'amber' | 'teal' | 'green';
  bars?: number[];
}) {
  const toneClass = {
    violet: 'from-violet-400/15 to-violet-500/5 text-violet-100',
    amber: 'from-amber-300/15 to-amber-500/5 text-amber-100',
    teal: 'from-teal-300/15 to-teal-500/5 text-teal-100',
    green: 'from-emerald-300/15 to-emerald-500/5 text-emerald-100',
  }[tone];
  const maxBar = Math.max(...(bars ?? [0]), 1);

  return (
    <div className={`card min-h-[132px] bg-gradient-to-br ${toneClass} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold leading-none">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{hint}</p>
      {bars && bars.length > 0 ? (
        <div className="mt-3 flex h-8 items-end gap-1.5">
          {bars.map((bar, index) => (
            <span
              key={`${bar}-${index}`}
              className="w-full rounded-t-sm bg-violet-300/70"
              style={{ height: `${Math.max(10, Math.round((bar / maxBar) * 100))}%`, opacity: bar > 0 ? 1 : 0.25 }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PipelineTotalsCard({
  totals,
  total,
  hint,
}: {
  totals: PipelineTotal[];
  total: number;
  hint: string;
}) {
  const maxValue = Math.max(...totals.map((pipeline) => pipeline.weightedOpenValueUsd), 1);

  return (
    <div className="card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">CRM</p>
          <h2 className="mt-1 text-2xl font-semibold">Pipelines ponderados</h2>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
          <p className="text-xs text-slate-400">Valor total pipeline</p>
          <p className="text-xl font-semibold">{USD.format(total)}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {totals.length === 0 ? (
          <EmptyState
            title="Sin pipelines ponderados"
            body="Los valores apareceran aqui cuando haya deals abiertos con probabilidad."
          />
        ) : (
          totals.map((pipeline) => (
            <div
              key={pipeline.pipelineId}
              className={`rounded-lg border px-3 py-3 ${
                pipeline.weightedOpenValueUsd > 0
                  ? 'border-violet-300/20 bg-violet-400/[0.08]'
                  : 'border-white/10 bg-white/[0.035] opacity-75'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{pipeline.name}</p>
                  <p className="text-xs text-slate-500">
                    {pipeline.open} {pipeline.open === 1 ? 'deal abierto' : 'deals abiertos'}
                  </p>
                </div>
                <p className="text-lg font-semibold">{USD.format(pipeline.weightedOpenValueUsd)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-400 via-amber-300 to-emerald-300"
                  style={{
                    width:
                      pipeline.weightedOpenValueUsd > 0
                        ? `${Math.max(4, Math.round((pipeline.weightedOpenValueUsd / maxValue) * 100))}%`
                        : '2%',
                    opacity: pipeline.weightedOpenValueUsd > 0 ? 1 : 0.25,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function TasksCard({ tasks }: { tasks: Record<string, number> }) {
  const entries = Object.entries(tasks);
  const pending = tasks['PENDING'] || 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Operaciones</p>
          <h2 className="mt-1 text-lg font-semibold">Tareas</h2>
        </div>
        <Link href="/tasks" className="text-xs font-semibold text-amber-300 hover:text-amber-200">
          Gestionar
        </Link>
      </div>
      <div className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.08] p-4">
        <p className="text-3xl font-semibold text-amber-100">{INT.format(pending)}</p>
        <p className="mt-1 text-xs text-slate-400">Tareas pending</p>
      </div>
      <div className="mt-3 space-y-2">
        {entries.length === 0 ? (
          <EmptyState title="Sin tareas activas" body="Las tareas pendientes apareceran aqui." />
        ) : (
          entries.map(([status, count]) => (
            <div key={status} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
              <span className="text-sm text-slate-300">{status}</span>
              <span className="text-sm font-semibold">{INT.format(count)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InvoicesCard({ invoices }: { invoices: InvoiceSummary[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Finanzas</p>
          <h2 className="mt-1 text-lg font-semibold">Facturas recientes</h2>
        </div>
        <Link href="/admin/ocr-scan" className="text-xs font-semibold text-amber-300 hover:text-amber-200">
          Ver todo
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {invoices.length === 0 ? (
          <EmptyState
            title="No hay facturas recientes"
            body="Las facturas apareceran aqui cuando se generen."
          />
        ) : (
          invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-4 py-3">
              <div>
                <p className="text-sm font-semibold">
                  {inv.currency} {Number(inv.amount).toFixed(2)}
                </p>
                <p className="text-xs text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</p>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">
                {inv.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function IAPulseCard() {
  const capabilities = ['Seguimientos inteligentes', 'Prioridad de leads', 'Riesgo de oportunidad perdida'];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">O7 IA Pulse</h2>
        <span className="rounded-full bg-violet-400/15 px-2 py-1 text-[11px] font-semibold text-violet-100">
          Olivia
        </span>
      </div>
      <EmptyState
        className="mt-4"
        title="Sin recomendaciones activas por ahora."
        body="Cuando haya suficiente actividad comercial, Olivia podra sugerir seguimientos, prioridades y proximos pasos."
      />
      <div className="mt-4 space-y-2">
        {capabilities.map((item) => (
          <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-violet-300" />
            <span className="text-sm text-slate-200">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Actividad reciente</h2>
        <span className="text-xs text-slate-500">Live</span>
      </div>
      <EmptyState
        className="mt-4"
        title="Sin actividad reciente."
        body="Las acciones de clientes, tareas y deals apareceran aqui."
      />
    </div>
  );
}

function EmptyState({ title, body, className = '' }: { title: string; body: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-dashed border-white/[0.12] bg-white/[0.025] p-4 ${className}`}>
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
    </div>
  );
}
