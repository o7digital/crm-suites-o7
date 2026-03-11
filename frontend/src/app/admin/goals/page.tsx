'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';

type WorkspaceUser = {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
};

type AdminContextResponse = {
  isCustomerWorkspace?: boolean;
  canManageSubscriptions?: boolean;
  ownsSubscriptions?: boolean;
  isCustomerTenant?: boolean;
};

type SellerGoalDraft = {
  team: string;
  leadsTarget: number;
  meetingsTarget: number;
  pipelineTargetUsd: number;
  wonTargetUsd: number;
  winRateTarget: number;
};

type PlansByMonth = Record<string, Record<string, SellerGoalDraft>>;

type NumberField =
  | 'leadsTarget'
  | 'meetingsTarget'
  | 'pipelineTargetUsd'
  | 'wonTargetUsd'
  | 'winRateTarget';

const EMPTY_GOAL: SellerGoalDraft = {
  team: '',
  leadsTarget: 0,
  meetingsTarget: 0,
  pipelineTargetUsd: 0,
  wonTargetUsd: 0,
  winRateTarget: 0,
};
const EMPTY_MONTH_PLAN: Record<string, SellerGoalDraft> = {};

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return monthKey;
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function toPositiveNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function normalizeGoalDraft(raw: unknown): SellerGoalDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_GOAL };
  const draft = raw as Partial<SellerGoalDraft>;
  return {
    team: typeof draft.team === 'string' ? draft.team : '',
    leadsTarget: toPositiveNumber(draft.leadsTarget),
    meetingsTarget: toPositiveNumber(draft.meetingsTarget),
    pipelineTargetUsd: toPositiveNumber(draft.pipelineTargetUsd),
    wonTargetUsd: toPositiveNumber(draft.wonTargetUsd),
    winRateTarget: toPositiveNumber(draft.winRateTarget),
  };
}

function normalizePlans(raw: unknown): PlansByMonth {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: PlansByMonth = {};

  for (const [monthKey, monthValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (!monthValue || typeof monthValue !== 'object' || Array.isArray(monthValue)) continue;

    const monthPlan: Record<string, SellerGoalDraft> = {};
    for (const [userId, goalValue] of Object.entries(monthValue as Record<string, unknown>)) {
      if (!userId.trim()) continue;
      monthPlan[userId] = normalizeGoalDraft(goalValue);
    }
    result[monthKey] = monthPlan;
  }

  return result;
}

function hasTargets(goal: SellerGoalDraft) {
  return (
    goal.team.trim().length > 0 ||
    goal.leadsTarget > 0 ||
    goal.meetingsTarget > 0 ||
    goal.pipelineTargetUsd > 0 ||
    goal.wonTargetUsd > 0 ||
    goal.winRateTarget > 0
  );
}

function roleLabel(role: WorkspaceUser['role']) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'ADMIN') return 'Admin';
  return 'Member';
}

function roleOrder(role: WorkspaceUser['role']) {
  if (role === 'OWNER') return 0;
  if (role === 'ADMIN') return 1;
  return 2;
}

export default function AdminGoalsPage() {
  const { token, user } = useAuth();
  const api = useApi(token);
  const defaultMonth = useMemo(() => getCurrentMonthKey(), []);
  const storageKey = useMemo(
    () => (user ? `o7-admin-sales-goals-v2:${user.tenantId}:${user.id}` : null),
    [user],
  );

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [adminContext, setAdminContext] = useState<AdminContextResponse | null>(null);
  const [plansByMonth, setPlansByMonth] = useState<PlansByMonth>({});
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let active = true;
    setLoading(true);
    setError(null);

    Promise.allSettled([api<WorkspaceUser[]>('/admin/users'), api<AdminContextResponse>('/admin/context')])
      .then(([usersResult, contextResult]) => {
        if (!active) return;

        if (usersResult.status === 'fulfilled') {
          setUsers(usersResult.value);
        } else {
          setError(usersResult.reason instanceof Error ? usersResult.reason.message : 'Unable to load workspace users');
        }

        if (contextResult.status === 'fulfilled') {
          setAdminContext(contextResult.value);
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setPlansByMonth(raw ? normalizePlans(JSON.parse(raw)) : {});
    } catch {
      setPlansByMonth({});
    } finally {
      setStorageReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !storageReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify(plansByMonth));
  }, [plansByMonth, storageKey, storageReady]);

  const orderedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const currentA = a.id === user?.id ? 0 : 1;
      const currentB = b.id === user?.id ? 0 : 1;
      if (currentA !== currentB) return currentA - currentB;
      const roleDiff = roleOrder(a.role) - roleOrder(b.role);
      if (roleDiff !== 0) return roleDiff;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [user?.id, users]);

  const monthPlan = plansByMonth[selectedMonth] ?? EMPTY_MONTH_PLAN;

  const rows = useMemo(
    () =>
      orderedUsers.map((workspaceUser) => ({
        workspaceUser,
        goal: monthPlan[workspaceUser.id] ?? EMPTY_GOAL,
      })),
    [monthPlan, orderedUsers],
  );

  const configuredRows = useMemo(() => rows.filter((row) => hasTargets(row.goal)), [rows]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.leadsTarget += row.goal.leadsTarget;
        acc.meetingsTarget += row.goal.meetingsTarget;
        acc.pipelineTargetUsd += row.goal.pipelineTargetUsd;
        acc.wonTargetUsd += row.goal.wonTargetUsd;
        acc.winRateTotal += row.goal.winRateTarget;
        return acc;
      },
      {
        leadsTarget: 0,
        meetingsTarget: 0,
        pipelineTargetUsd: 0,
        wonTargetUsd: 0,
        winRateTotal: 0,
      },
    );
  }, [rows]);

  const averageWinRate = configuredRows.length > 0 ? summary.winRateTotal / configuredRows.length : 0;
  const coverageTarget = summary.wonTargetUsd > 0 ? summary.pipelineTargetUsd / summary.wonTargetUsd : 0;

  const missingTargets = useMemo(
    () => rows.filter((row) => !hasTargets(row.goal)).slice(0, 6),
    [rows],
  );

  const topQuotaRows = useMemo(
    () =>
      [...configuredRows]
        .sort((a, b) => b.goal.wonTargetUsd - a.goal.wonTargetUsd || b.goal.pipelineTargetUsd - a.goal.pipelineTargetUsd)
        .slice(0, 5),
    [configuredRows],
  );

  const updateTextField = (userId: string, team: string) => {
    setPlansByMonth((current) => ({
      ...current,
      [selectedMonth]: {
        ...(current[selectedMonth] ?? {}),
        [userId]: {
          ...(current[selectedMonth]?.[userId] ?? EMPTY_GOAL),
          team,
        },
      },
    }));
  };

  const updateNumberField = (userId: string, field: NumberField, value: string) => {
    const nextValue = toPositiveNumber(value);
    setPlansByMonth((current) => ({
      ...current,
      [selectedMonth]: {
        ...(current[selectedMonth] ?? {}),
        [userId]: {
          ...(current[selectedMonth]?.[userId] ?? EMPTY_GOAL),
          [field]: nextValue,
        },
      },
    }));
  };

  const resetUserTargets = (userId: string) => {
    setPlansByMonth((current) => {
      const nextMonthPlan = { ...(current[selectedMonth] ?? {}) };
      delete nextMonthPlan[userId];
      return {
        ...current,
        [selectedMonth]: nextMonthPlan,
      };
    });
  };

  const resetMonth = () => {
    setPlansByMonth((current) => {
      const next = { ...current };
      delete next[selectedMonth];
      return next;
    });
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
            <h1 className="text-3xl font-semibold">Objectives</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">
              Monthly sales targets by seller, using the real users of the current workspace only.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-[190px]">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Target month</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value || defaultMonth)}
                className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              />
            </label>
            <button type="button" onClick={resetMonth} className="btn-secondary">
              Reset month
            </button>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/80">Planning board</p>
              <h2 className="mt-2 text-2xl font-semibold">{formatMonthLabel(selectedMonth)}</h2>
              <p className="mt-2 text-sm text-slate-300">
                No seeded sellers, no fake KPIs. Targets start empty and are mapped to actual workspace members.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              <p className="font-medium text-white">{user?.email || 'Current account'}</p>
              <p className="mt-1 text-slate-400">
                Local draft scoped to this account{user?.tenantId ? ` · tenant ${user.tenantId.slice(0, 8)}` : ''}.
              </p>
            </div>
          </div>
        </div>

        {error ? <div className="card mt-6 p-5 text-sm text-rose-200">{error}</div> : null}
        {loading ? <div className="card mt-6 p-5 text-slate-300">Loading workspace users...</div> : null}

        {!loading && !error ? (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Workspace sellers"
                value={INT.format(rows.length)}
                detail={`${INT.format(configuredRows.length)} users already configured`}
                accentClassName="from-cyan-500/20 via-cyan-500/10 to-transparent"
              />
              <SummaryCard
                title="Lead target"
                value={INT.format(summary.leadsTarget)}
                detail={`${INT.format(summary.meetingsTarget)} meetings planned`}
                accentClassName="from-emerald-500/20 via-emerald-500/10 to-transparent"
              />
              <SummaryCard
                title="Pipeline target"
                value={USD.format(summary.pipelineTargetUsd)}
                detail={`${coverageTarget.toFixed(1)}x coverage vs won target`}
                accentClassName="from-violet-500/25 via-violet-500/10 to-transparent"
              />
              <SummaryCard
                title="Closed-won target"
                value={USD.format(summary.wonTargetUsd)}
                detail={`${Math.round(averageWinRate)}% avg target win rate`}
                accentClassName="from-amber-500/20 via-amber-500/10 to-transparent"
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
              <div className="card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Per seller targets</p>
                    <h3 className="mt-2 text-xl font-semibold">Real workspace users</h3>
                    <p className="mt-2 text-sm text-slate-400">
                      Seller names come from the CRM workspace. Use this page only to define the monthly commercial
                      target mix.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                    Currency locked to <span className="font-semibold text-white">USD</span>
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  {rows.map(({ workspaceUser, goal }) => {
                    const quotaShare = summary.wonTargetUsd > 0 ? goal.wonTargetUsd / summary.wonTargetUsd : 0;
                    const pipelineCoverage = goal.wonTargetUsd > 0 ? goal.pipelineTargetUsd / goal.wonTargetUsd : 0;

                    return (
                      <div key={workspaceUser.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-lg font-semibold text-white">{workspaceUser.name || workspaceUser.email}</p>
                              <span className="rounded-full bg-white/6 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/10">
                                {roleLabel(workspaceUser.role)}
                              </span>
                              {workspaceUser.id === user?.id ? (
                                <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-medium text-cyan-100 ring-1 ring-cyan-400/25">
                                  Current user
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-slate-400">{workspaceUser.email}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => resetUserTargets(workspaceUser.id)}
                            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5"
                          >
                            Clear targets
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          <MetricBox
                            label="Quota share"
                            value={`${Math.round(quotaShare * 100)}%`}
                            detail={goal.wonTargetUsd > 0 ? `${USD.format(goal.wonTargetUsd)} of team won target` : 'No quota set yet'}
                          />
                          <MetricBox
                            label="Pipeline coverage"
                            value={`${pipelineCoverage.toFixed(1)}x`}
                            detail={goal.pipelineTargetUsd > 0 ? `${USD.format(goal.pipelineTargetUsd)} planned pipeline` : 'No pipeline target set'}
                          />
                          <MetricBox
                            label="Meetings / leads"
                            value={goal.leadsTarget > 0 ? `${Math.round((goal.meetingsTarget / goal.leadsTarget) * 100)}%` : '0%'}
                            detail={
                              goal.leadsTarget > 0
                                ? `${INT.format(goal.meetingsTarget)} meetings for ${INT.format(goal.leadsTarget)} leads`
                                : 'No volume target set'
                            }
                          />
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <Field>
                            <Label>Team / segment</Label>
                            <TextInput
                              value={goal.team}
                              onChange={(event) => updateTextField(workspaceUser.id, event.target.value)}
                              placeholder="Enterprise / FR"
                            />
                          </Field>
                          <Field>
                            <Label>Lead target</Label>
                            <NumberInput
                              value={goal.leadsTarget}
                              onChange={(event) => updateNumberField(workspaceUser.id, 'leadsTarget', event.target.value)}
                            />
                          </Field>
                          <Field>
                            <Label>Meetings target</Label>
                            <NumberInput
                              value={goal.meetingsTarget}
                              onChange={(event) => updateNumberField(workspaceUser.id, 'meetingsTarget', event.target.value)}
                            />
                          </Field>
                          <Field>
                            <Label>Target win rate (%)</Label>
                            <NumberInput
                              value={goal.winRateTarget}
                              onChange={(event) => updateNumberField(workspaceUser.id, 'winRateTarget', event.target.value)}
                            />
                          </Field>
                          <Field>
                            <Label>Pipeline target (USD)</Label>
                            <NumberInput
                              value={goal.pipelineTargetUsd}
                              step={1000}
                              onChange={(event) => updateNumberField(workspaceUser.id, 'pipelineTargetUsd', event.target.value)}
                            />
                          </Field>
                          <Field>
                            <Label>Closed-won target (USD)</Label>
                            <NumberInput
                              value={goal.wonTargetUsd}
                              step={1000}
                              onChange={(event) => updateNumberField(workspaceUser.id, 'wonTargetUsd', event.target.value)}
                            />
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-6">
                <div className="card p-5">
                  <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Top quotas</p>
                  <h3 className="mt-2 text-xl font-semibold">Revenue split</h3>
                  <div className="mt-4 space-y-3">
                    {topQuotaRows.length > 0 ? (
                      topQuotaRows.map(({ workspaceUser, goal }) => {
                        const share = summary.wonTargetUsd > 0 ? goal.wonTargetUsd / summary.wonTargetUsd : 0;
                        return (
                          <div key={workspaceUser.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-semibold text-white">{workspaceUser.name || workspaceUser.email}</p>
                                <p className="mt-1 text-sm text-slate-400">{goal.team || workspaceUser.email}</p>
                              </div>
                              <p className="text-lg font-semibold text-white">{USD.format(goal.wonTargetUsd)}</p>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                                style={{ width: `${Math.min(share * 100, 100)}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                              {Math.round(share * 100)}% of team won target
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                        No seller target configured yet for {formatMonthLabel(selectedMonth)}.
                      </div>
                    )}
                  </div>
                </div>

                <div className="card p-5">
                  <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Missing targets</p>
                  <h3 className="mt-2 text-xl font-semibold">Users still empty</h3>
                  <div className="mt-4 space-y-3">
                    {missingTargets.length > 0 ? (
                      missingTargets.map(({ workspaceUser }) => (
                        <div key={workspaceUser.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="font-semibold text-white">{workspaceUser.name || workspaceUser.email}</p>
                          <p className="mt-1 text-sm text-slate-400">{workspaceUser.email}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                        All workspace users have a target definition for this month.
                      </div>
                    )}
                  </div>
                </div>

                <div className="card p-5">
                  <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Workspace scope</p>
                  <h3 className="mt-2 text-xl font-semibold">Tenant isolation</h3>
                  <div className="mt-4 space-y-3 text-sm text-slate-300">
                    <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      This page only uses users from the current CRM workspace. Other subscriptions stay isolated.
                    </p>
                    <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      {adminContext?.isCustomerWorkspace
                        ? 'Current workspace is a customer subscription workspace. Subscription administration remains managed from the owner workspace.'
                        : 'Current workspace is an owner workspace or standalone tenant. You can still manage customer subscriptions separately.'}
                    </p>
                    <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      Account enabled here: <span className="font-semibold text-white">{user?.email || 'unknown'}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
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

function MetricBox({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm text-slate-300">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
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
