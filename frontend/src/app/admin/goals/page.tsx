'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

type SellerGoal = {
  id: string;
  sellerName: string;
  team: string;
  leadsTarget: number;
  meetingsTarget: number;
  pipelineTargetUsd: number;
  wonTargetUsd: number;
  winRateTarget: number;
  leadsActual: number;
  meetingsActual: number;
  pipelineActualUsd: number;
  wonActualUsd: number;
};

type PlansByMonth = Record<string, SellerGoal[]>;

type GoalInsight = {
  id: string;
  score: number;
  statusLabel: string;
  statusClassName: string;
  quotaGapUsd: number;
  pipelineCoverage: number;
};

type TextField = 'sellerName' | 'team';
type NumberField =
  | 'leadsTarget'
  | 'meetingsTarget'
  | 'pipelineTargetUsd'
  | 'wonTargetUsd'
  | 'winRateTarget';

const STORAGE_KEY = 'o7-admin-sales-goals-v1';
const EMPTY_GOALS: SellerGoal[] = [];

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toPositiveNumber(value: unknown, fallback = 0) {
  return Math.max(0, toNumber(value, fallback));
}

function normalizeGoal(raw: unknown, index: number): SellerGoal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const goal = raw as Partial<SellerGoal>;
  return {
    id: typeof goal.id === 'string' && goal.id.trim() ? goal.id : `seller-${index + 1}`,
    sellerName:
      typeof goal.sellerName === 'string' && goal.sellerName.trim() ? goal.sellerName : `Seller ${index + 1}`,
    team: typeof goal.team === 'string' && goal.team.trim() ? goal.team : 'Sales',
    leadsTarget: toPositiveNumber(goal.leadsTarget),
    meetingsTarget: toPositiveNumber(goal.meetingsTarget),
    pipelineTargetUsd: toPositiveNumber(goal.pipelineTargetUsd),
    wonTargetUsd: toPositiveNumber(goal.wonTargetUsd),
    winRateTarget: toPositiveNumber(goal.winRateTarget),
    leadsActual: toPositiveNumber(goal.leadsActual),
    meetingsActual: toPositiveNumber(goal.meetingsActual),
    pipelineActualUsd: toPositiveNumber(goal.pipelineActualUsd),
    wonActualUsd: toPositiveNumber(goal.wonActualUsd),
  };
}

function createSeedGoals(): SellerGoal[] {
  return [
    {
      id: 'camille',
      sellerName: 'Camille Laurent',
      team: 'Enterprise / US East',
      leadsTarget: 34,
      meetingsTarget: 14,
      pipelineTargetUsd: 120000,
      wonTargetUsd: 36000,
      winRateTarget: 26,
      leadsActual: 27,
      meetingsActual: 11,
      pipelineActualUsd: 84500,
      wonActualUsd: 24100,
    },
    {
      id: 'julian',
      sellerName: 'Julian Park',
      team: 'Mid-market / LATAM',
      leadsTarget: 46,
      meetingsTarget: 19,
      pipelineTargetUsd: 98000,
      wonTargetUsd: 28000,
      winRateTarget: 22,
      leadsActual: 41,
      meetingsActual: 16,
      pipelineActualUsd: 90600,
      wonActualUsd: 19800,
    },
    {
      id: 'noemie',
      sellerName: 'Noemie Costa',
      team: 'Inbound / Expansion',
      leadsTarget: 28,
      meetingsTarget: 12,
      pipelineTargetUsd: 76000,
      wonTargetUsd: 24000,
      winRateTarget: 31,
      leadsActual: 22,
      meetingsActual: 9,
      pipelineActualUsd: 61100,
      wonActualUsd: 17500,
    },
  ];
}

function sanitizePlans(raw: unknown, defaultMonth: string): PlansByMonth {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { [defaultMonth]: createSeedGoals() };
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([month]) => /^\d{4}-\d{2}$/.test(month))
    .map(([month, value]) => {
      const goals = Array.isArray(value)
        ? value.map((goal, index) => normalizeGoal(goal, index)).filter((goal): goal is SellerGoal => Boolean(goal))
        : [];
      return [month, goals] as const;
    })
    .filter(([, goals]) => goals.length > 0);

  if (entries.length === 0) {
    return { [defaultMonth]: createSeedGoals() };
  }

  const plans = Object.fromEntries(entries);
  if (!plans[defaultMonth]) {
    plans[defaultMonth] = cloneTargetsForNewMonth(entries[0]?.[1] ?? createSeedGoals());
  }
  return plans;
}

function cloneTargetsForNewMonth(goals: SellerGoal[]) {
  return goals.map((goal, index) => ({
    ...goal,
    id: `${goal.id || 'seller'}-${index + 1}`,
    leadsActual: 0,
    meetingsActual: 0,
    pipelineActualUsd: 0,
    wonActualUsd: 0,
  }));
}

function progressRatio(actual: number, target: number) {
  if (target <= 0) return 0;
  return Math.max(0, actual / target);
}

function cappedScore(actual: number, target: number) {
  return Math.min(progressRatio(actual, target), 1.4);
}

function computeAttainment(goal: SellerGoal) {
  return (
    cappedScore(goal.leadsActual, goal.leadsTarget) * 0.2 +
    cappedScore(goal.meetingsActual, goal.meetingsTarget) * 0.2 +
    cappedScore(goal.pipelineActualUsd, goal.pipelineTargetUsd) * 0.3 +
    cappedScore(goal.wonActualUsd, goal.wonTargetUsd) * 0.3
  );
}

function getStatusMeta(score: number) {
  if (score >= 0.95) {
    return {
      label: 'Ahead',
      className: 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/25',
    };
  }
  if (score >= 0.72) {
    return {
      label: 'On track',
      className: 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/25',
    };
  }
  return {
    label: 'At risk',
    className: 'bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/25',
  };
}

function newSellerGoal(nextIndex: number): SellerGoal {
  return {
    id: `seller-${Date.now()}-${nextIndex}`,
    sellerName: `New seller ${nextIndex}`,
    team: 'New territory',
    leadsTarget: 30,
    meetingsTarget: 10,
    pipelineTargetUsd: 70000,
    wonTargetUsd: 20000,
    winRateTarget: 25,
    leadsActual: 0,
    meetingsActual: 0,
    pipelineActualUsd: 0,
    wonActualUsd: 0,
  };
}

export default function AdminGoalsPage() {
  const defaultMonth = useMemo(() => getCurrentMonthKey(), []);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [plansByMonth, setPlansByMonth] = useState<PlansByMonth>({
    [defaultMonth]: createSeedGoals(),
  });
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setPlansByMonth(sanitizePlans(JSON.parse(saved), defaultMonth));
      }
    } catch {
      setPlansByMonth({ [defaultMonth]: createSeedGoals() });
    } finally {
      setStorageReady(true);
    }
  }, [defaultMonth]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plansByMonth));
  }, [plansByMonth, storageReady]);

  useEffect(() => {
    setPlansByMonth((current) => {
      if (current[selectedMonth]) return current;
      const fallbackPlan = current[defaultMonth] ?? Object.values(current)[0] ?? createSeedGoals();
      return {
        ...current,
        [selectedMonth]: cloneTargetsForNewMonth(fallbackPlan),
      };
    });
  }, [defaultMonth, selectedMonth]);

  const sellerGoals = plansByMonth[selectedMonth] ?? EMPTY_GOALS;

  const insights = useMemo<GoalInsight[]>(
    () =>
      sellerGoals.map((goal) => {
        const score = computeAttainment(goal);
        const status = getStatusMeta(score);
        return {
          id: goal.id,
          score,
          statusLabel: status.label,
          statusClassName: status.className,
          quotaGapUsd: Math.max(goal.wonTargetUsd - goal.wonActualUsd, 0),
          pipelineCoverage: goal.wonTargetUsd > 0 ? goal.pipelineActualUsd / goal.wonTargetUsd : 0,
        };
      }),
    [sellerGoals],
  );

  const insightById = useMemo(() => new Map(insights.map((insight) => [insight.id, insight])), [insights]);

  const summary = useMemo(() => {
    const totals = sellerGoals.reduce(
      (acc, goal) => {
        acc.leadsTarget += goal.leadsTarget;
        acc.leadsActual += goal.leadsActual;
        acc.pipelineTargetUsd += goal.pipelineTargetUsd;
        acc.pipelineActualUsd += goal.pipelineActualUsd;
        acc.wonTargetUsd += goal.wonTargetUsd;
        acc.wonActualUsd += goal.wonActualUsd;
        acc.attainment += computeAttainment(goal);
        return acc;
      },
      {
        leadsTarget: 0,
        leadsActual: 0,
        pipelineTargetUsd: 0,
        pipelineActualUsd: 0,
        wonTargetUsd: 0,
        wonActualUsd: 0,
        attainment: 0,
      },
    );

    return {
      ...totals,
      sellerCount: sellerGoals.length,
      averageAttainment: sellerGoals.length > 0 ? totals.attainment / sellerGoals.length : 0,
      pipelineCoverage: totals.wonTargetUsd > 0 ? totals.pipelineTargetUsd / totals.wonTargetUsd : 0,
      committedCoverage: totals.wonTargetUsd > 0 ? totals.pipelineActualUsd / totals.wonTargetUsd : 0,
      onTrackCount: insights.filter((insight) => insight.score >= 0.72).length,
    };
  }, [insights, sellerGoals]);

  const focusList = useMemo(
    () =>
      [...sellerGoals]
        .map((goal) => {
          const insight = insightById.get(goal.id);
          return { goal, insight };
        })
        .filter((row): row is { goal: SellerGoal; insight: GoalInsight } => Boolean(row.insight))
        .sort((a, b) => a.insight.score - b.insight.score)
        .slice(0, 3),
    [insightById, sellerGoals],
  );

  const updateTextField = (sellerId: string, field: TextField, value: string) => {
    setPlansByMonth((current) => ({
      ...current,
      [selectedMonth]: (current[selectedMonth] ?? []).map((goal) =>
        goal.id === sellerId ? { ...goal, [field]: value } : goal,
      ),
    }));
  };

  const updateNumberField = (sellerId: string, field: NumberField, value: string) => {
    const nextValue = Math.max(0, Number(value || 0));
    setPlansByMonth((current) => ({
      ...current,
      [selectedMonth]: (current[selectedMonth] ?? []).map((goal) =>
        goal.id === sellerId ? { ...goal, [field]: Number.isFinite(nextValue) ? nextValue : 0 } : goal,
      ),
    }));
  };

  const addSeller = () => {
    setPlansByMonth((current) => {
      const currentGoals = current[selectedMonth] ?? [];
      return {
        ...current,
        [selectedMonth]: [...currentGoals, newSellerGoal(currentGoals.length + 1)],
      };
    });
  };

  const removeSeller = (sellerId: string) => {
    setPlansByMonth((current) => {
      const nextGoals = (current[selectedMonth] ?? []).filter((goal) => goal.id !== sellerId);
      return {
        ...current,
        [selectedMonth]: nextGoals.length > 0 ? nextGoals : [newSellerGoal(1)],
      };
    });
  };

  const resetMonth = () => {
    setPlansByMonth((current) => ({
      ...current,
      [selectedMonth]:
        selectedMonth === defaultMonth
          ? createSeedGoals()
          : cloneTargetsForNewMonth(current[defaultMonth] ?? createSeedGoals()),
    }));
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
            <h1 className="text-3xl font-semibold">Objectives</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">
              Define monthly goals per seller: lead volume, discovery cadence, pipeline creation and closed-won revenue
              in USD.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-[180px]">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Target month</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value || defaultMonth)}
                className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              />
            </label>
            <button type="button" onClick={addSeller} className="btn-secondary">
              Add seller
            </button>
            <button type="button" onClick={resetMonth} className="btn-secondary">
              Reset month
            </button>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/80">Sales planning board</p>
              <h2 className="mt-2 text-2xl font-semibold">{formatMonthLabel(selectedMonth)}</h2>
              <p className="mt-2 text-sm text-slate-400">
                Targets update live while you edit each seller. Use this page to align individual quotas with the team
                revenue plan.
              </p>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Sellers</p>
                <p className="mt-2 text-xl font-semibold text-white">{summary.sellerCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">On track</p>
                <p className="mt-2 text-xl font-semibold text-white">{summary.onTrackCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Avg attainment</p>
                <p className="mt-2 text-xl font-semibold text-white">{PERCENT.format(summary.averageAttainment)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Closed-won target"
            value={USD.format(summary.wonTargetUsd)}
            detail={`${USD.format(summary.wonActualUsd)} committed so far`}
            accentClassName="from-violet-500/25 via-violet-500/10 to-transparent"
          />
          <SummaryCard
            title="Pipeline target"
            value={USD.format(summary.pipelineTargetUsd)}
            detail={`${summary.pipelineCoverage.toFixed(1)}x planned coverage on team quota`}
            accentClassName="from-cyan-500/25 via-cyan-500/10 to-transparent"
          />
          <SummaryCard
            title="Lead target"
            value={INT.format(summary.leadsTarget)}
            detail={`${INT.format(summary.leadsActual)} leads currently generated`}
            accentClassName="from-emerald-500/20 via-emerald-500/10 to-transparent"
          />
          <SummaryCard
            title="Committed pipeline"
            value={USD.format(summary.pipelineActualUsd)}
            detail={`${summary.committedCoverage.toFixed(1)}x live coverage against won quota`}
            accentClassName="from-amber-500/20 via-amber-500/10 to-transparent"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
          <div className="card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Per seller targets</p>
                <h3 className="mt-2 text-xl font-semibold">Quota allocation</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Edit seller names, teams and monthly targets. Progress cards compare current snapshot vs target.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                Currency locked to <span className="font-semibold text-white">USD</span>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {sellerGoals.map((goal) => {
                const insight = insightById.get(goal.id);
                return (
                  <div key={goal.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-lg font-semibold text-white">{goal.sellerName}</p>
                          {insight ? (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${insight.statusClassName}`}>
                              {insight.statusLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-400">{goal.team}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeSeller(goal.id)}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      <MetricProgress
                        label="Leads"
                        actual={goal.leadsActual}
                        target={goal.leadsTarget}
                        valueFormatter={(value) => INT.format(value)}
                        barClassName="bg-cyan-400"
                      />
                      <MetricProgress
                        label="Pipeline"
                        actual={goal.pipelineActualUsd}
                        target={goal.pipelineTargetUsd}
                        valueFormatter={(value) => USD.format(value)}
                        barClassName="bg-violet-400"
                      />
                      <MetricProgress
                        label="Closed-won"
                        actual={goal.wonActualUsd}
                        target={goal.wonTargetUsd}
                        valueFormatter={(value) => USD.format(value)}
                        barClassName="bg-emerald-400"
                      />
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field>
                        <Label>Seller</Label>
                        <TextInput
                          value={goal.sellerName}
                          onChange={(event) => updateTextField(goal.id, 'sellerName', event.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label>Team / segment</Label>
                        <TextInput value={goal.team} onChange={(event) => updateTextField(goal.id, 'team', event.target.value)} />
                      </Field>
                      <Field>
                        <Label>Lead target</Label>
                        <NumberInput
                          value={goal.leadsTarget}
                          onChange={(event) => updateNumberField(goal.id, 'leadsTarget', event.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label>Meetings target</Label>
                        <NumberInput
                          value={goal.meetingsTarget}
                          onChange={(event) => updateNumberField(goal.id, 'meetingsTarget', event.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label>Pipeline target (USD)</Label>
                        <NumberInput
                          value={goal.pipelineTargetUsd}
                          step={1000}
                          onChange={(event) => updateNumberField(goal.id, 'pipelineTargetUsd', event.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label>Closed-won target (USD)</Label>
                        <NumberInput
                          value={goal.wonTargetUsd}
                          step={1000}
                          onChange={(event) => updateNumberField(goal.id, 'wonTargetUsd', event.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label>Target win rate (%)</Label>
                        <NumberInput
                          value={goal.winRateTarget}
                          onChange={(event) => updateNumberField(goal.id, 'winRateTarget', event.target.value)}
                        />
                      </Field>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Quota gap</p>
                        <p className="mt-2 text-xl font-semibold text-white">
                          {USD.format(insight?.quotaGapUsd ?? Math.max(goal.wonTargetUsd - goal.wonActualUsd, 0))}
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          Coverage at {(insight?.pipelineCoverage ?? 0).toFixed(1)}x of the personal won target.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-5">
              <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Focus sellers</p>
              <h3 className="mt-2 text-xl font-semibold">Who needs attention</h3>
              <div className="mt-4 space-y-3">
                {focusList.map(({ goal, insight }) => (
                  <div key={goal.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">{goal.sellerName}</p>
                        <p className="mt-1 text-sm text-slate-400">{goal.team}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${insight.statusClassName}`}>
                        {insight.statusLabel}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">
                      {USD.format(insight.quotaGapUsd)} still needed to hit the monthly won target.
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                        style={{ width: `${Math.min(insight.score * 100, 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                      Attainment {PERCENT.format(insight.score)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Quota guardrails</p>
              <h3 className="mt-2 text-xl font-semibold">Recommended operating rules</h3>
              <div className="mt-4 space-y-4">
                <Guideline
                  title="Pipeline coverage"
                  value={`${summary.pipelineCoverage.toFixed(1)}x`}
                  description="Aim for at least 3.0x pipeline vs closed-won target across the team."
                />
                <Guideline
                  title="Discovery cadence"
                  value={`${INT.format(
                    sellerGoals.reduce((sum, goal) => sum + goal.meetingsTarget, 0),
                  )} meetings`}
                  description="Use meetings targets to avoid front-loading quota on a single large deal."
                />
                <Guideline
                  title="Average win rate"
                  value={
                    sellerGoals.length > 0
                      ? `${Math.round(
                          sellerGoals.reduce((sum, goal) => sum + goal.winRateTarget, 0) / sellerGoals.length,
                        )}%`
                      : '0%'
                  }
                  description="Keep target win rate realistic per segment before increasing revenue quota."
                />
              </div>
            </div>

            <div className="card p-5">
              <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Suggested plan</p>
              <h3 className="mt-2 text-xl font-semibold">One clean monthly operating model</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  1. Set the closed-won target first, then work backward to required pipeline and lead volume.
                </p>
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  2. Keep enterprise reps on higher pipeline quotas and inbound reps on higher conversion expectations.
                </p>
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  3. Review this board weekly and re-balance territories before the month-end crunch.
                </p>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </Guard>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  accentClassName,
}: {
  title: string;
  value: string;
  detail: string;
  accentClassName: string;
}) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentClassName}`} />
      <div className="relative">
        <p className="text-sm uppercase tracking-[0.14em] text-slate-400">{title}</p>
        <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
        <p className="mt-2 text-sm text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function MetricProgress({
  label,
  actual,
  target,
  valueFormatter,
  barClassName,
}: {
  label: string;
  actual: number;
  target: number;
  valueFormatter: (value: number) => string;
  barClassName: string;
}) {
  const ratio = progressRatio(actual, target);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-300">{label}</p>
        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{Math.round(ratio * 100)}%</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{valueFormatter(actual)}</p>
      <p className="mt-1 text-sm text-slate-400">Target {valueFormatter(target)}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
      </div>
    </div>
  );
}

function Guideline({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-300">{title}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
      </div>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function Field({ children }: { children: ReactNode }) {
  return <label className="block">{children}</label>;
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-slate-500">{children}</span>;
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
    />
  );
}

function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      min={0}
      {...props}
      className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
    />
  );
}
