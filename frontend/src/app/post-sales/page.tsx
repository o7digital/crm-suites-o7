'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';
import { CalendarSyncCard } from '@/components/CalendarSyncCard';
import { TaskCalendarActions } from '@/components/TaskCalendarActions';

type Pipeline = {
  id: string;
  name: string;
};

type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';
type ActiveView = 'PIPELINE' | 'CALENDAR';
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';
type PostSalesStatus =
  | 'onboarding'
  | 'collecting_info'
  | 'in_progress'
  | 'waiting_client'
  | 'internal_review'
  | 'delivery'
  | 'support'
  | 'done';
type PostSalesPriority = 'low' | 'medium' | 'high' | 'urgent';
type PeriodViewMode = 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
  email?: string | null;
  company?: string | null;
};

type PostSalesCase = {
  id: string;
  name: string;
  status: PostSalesStatus;
  priority: PostSalesPriority;
  dueDate?: string | null;
  ownerUserId?: string | null;
  clientId?: string | null;
  client?: Client | null;
  owner?: { id: string; name: string; email: string } | null;
  deal?: { id: string; title: string } | null;
};

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string | null;
  timeSpentHours?: number | string | null;
  clientId?: string;
  client?: Client | null;
  postSalesCaseId?: string | null;
};

type TaskCreateInput = {
  title: string;
  clientId: string;
  dueDate: string;
  timeSpentHours?: number;
  status?: TaskStatus;
  postSalesCaseId?: string;
};

type CalendarItem =
  | { id: string; type: 'task'; title: string; status: TaskStatus; clientName: string; due: string; task: Task }
  | {
      id: string;
      type: 'case';
      title: string;
      status: PostSalesStatus;
      priority: PostSalesPriority;
      clientName: string;
      due: string;
      caseItem: PostSalesCase;
    };

const POST_SALES_STATUSES: Array<{ key: PostSalesStatus; label: string }> = [
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'collecting_info', label: 'Collecting info' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting_client', label: 'Waiting client' },
  { key: 'internal_review', label: 'Internal review' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'support', label: 'Support' },
  { key: 'done', label: 'Done' },
];

const PRIORITY_BADGE: Record<PostSalesPriority, string> = {
  low: 'bg-slate-500/20 text-slate-200 ring-slate-400/30',
  medium: 'bg-cyan-500/20 text-cyan-100 ring-cyan-400/30',
  high: 'bg-amber-500/20 text-amber-100 ring-amber-400/30',
  urgent: 'bg-rose-500/20 text-rose-100 ring-rose-400/30',
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export default function PostSalesPage() {
  const { token, user } = useAuth();
  const api = useApi(token);
  const router = useRouter();

  const [activeView, setActiveView] = useState<ActiveView>('PIPELINE');
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [postSalesCases, setPostSalesCases] = useState<PostSalesCase[]>([]);
  const [postSalesPipelineId, setPostSalesPipelineId] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hoursDraftByTask, setHoursDraftByTask] = useState<Record<string, string>>({});
  const [savingHoursTaskId, setSavingHoursTaskId] = useState<string | null>(null);
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [periodViewMode, setPeriodViewMode] = useState<PeriodViewMode>('MONTH');
  const [periodAnchorDate, setPeriodAnchorDate] = useState('');

  useEffect(() => {
    const today = todayIsoUtc();
    const monthRange = getRangeForPeriod(today, 'MONTH');
    setPeriodViewMode('MONTH');
    setPeriodAnchorDate(today);
    setStartDate(monthRange.startIso);
    setEndDate(monthRange.endIso);
    setSelectedDate(todayIsoUtcClamped(monthRange.startIso, monthRange.endIso));
  }, []);

  const loadWorkspaceContext = useCallback(async () => {
    const ctx = await api<{ role?: WorkspaceRole }>('/admin/context');
    setWorkspaceRole(ctx?.role || null);
  }, [api]);

  const loadClients = useCallback(async () => {
    const clientsData = await api<Client[]>('/clients');
    setClients(clientsData);
  }, [api]);

  const loadTasks = useCallback(async () => {
    const tasksData = await api<Task[]>('/tasks');
    setTasks(tasksData);
  }, [api]);

  const loadCases = useCallback(async () => {
    const casesData = await api<PostSalesCase[]>('/post-sales/cases');
    setPostSalesCases(casesData);
  }, [api]);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadWorkspaceContext(), loadClients(), loadTasks(), loadCases()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load post-sales data');
    } finally {
      setLoading(false);
    }
  }, [loadCases, loadClients, loadTasks, loadWorkspaceContext]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, loadData]);

  useEffect(() => {
    if (!token) return;
    api<Pipeline[]>('/pipelines')
      .then((data) => {
        setPostSalesPipelineId(data.find((pipeline) => pipeline.name === 'Post Sales')?.id || '');
      })
      .catch(() => {
        setPostSalesPipelineId('');
      });
  }, [api, token]);

  const canAccessPostSales = workspaceRole ? workspaceRole === 'OWNER' || workspaceRole === 'ADMIN' : false;

  const rangeValid = Boolean(startDate && endDate && startDate <= endDate);
  const rangeLabel = useMemo(() => {
    if (!rangeValid) return '';
    return formatActivePeriodLabel(periodViewMode, startDate, endDate);
  }, [endDate, periodViewMode, rangeValid, startDate]);

  useEffect(() => {
    if (!rangeValid) return;
    setSelectedDate((prev) => {
      if (prev && prev >= startDate && prev <= endDate) return prev;
      return todayIsoUtcClamped(startDate, endDate);
    });
  }, [rangeValid, startDate, endDate]);

  const casesByStatus = useMemo(() => {
    const map: Record<PostSalesStatus, PostSalesCase[]> = {
      onboarding: [],
      collecting_info: [],
      in_progress: [],
      waiting_client: [],
      internal_review: [],
      delivery: [],
      support: [],
      done: [],
    };
    for (const c of postSalesCases) {
      map[c.status].push(c);
    }
    for (const key of Object.keys(map) as PostSalesStatus[]) {
      map[key].sort((a, b) => {
        const aDue = getIsoDueDate(a.dueDate) || '9999-12-31';
        const bDue = getIsoDueDate(b.dueDate) || '9999-12-31';
        return aDue.localeCompare(bDue) || a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [postSalesCases]);

  const calendarItemsInRange = useMemo(() => {
    if (!rangeValid) return [] as CalendarItem[];

    const taskItems: CalendarItem[] = tasks
      .map((task) => {
        const due = getTaskIsoDueDate(task);
        if (!due || due < startDate || due > endDate) return null;
        return {
          id: task.id,
          type: 'task',
          title: task.title,
          status: task.status,
          clientName: task.client ? getClientDisplayName(task.client) : 'No client',
          due,
          task,
        } as CalendarItem;
      })
      .filter((item): item is CalendarItem => Boolean(item));

    const caseItems: CalendarItem[] = postSalesCases
      .map((caseItem) => {
        const due = getIsoDueDate(caseItem.dueDate);
        if (!due || due < startDate || due > endDate) return null;
        return {
          id: caseItem.id,
          type: 'case',
          title: caseItem.name,
          status: caseItem.status,
          priority: caseItem.priority,
          clientName: caseItem.client ? getClientDisplayName(caseItem.client) : 'No client',
          due,
          caseItem,
        } as CalendarItem;
      })
      .filter((item): item is CalendarItem => Boolean(item));

    return [...taskItems, ...caseItems].sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
  }, [endDate, postSalesCases, rangeValid, startDate, tasks]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of calendarItemsInRange) {
      (map[item.due] ||= []).push(item);
    }
    for (const [k, list] of Object.entries(map)) {
      map[k] = [...list].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'case' ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
    }
    return map;
  }, [calendarItemsInRange]);

  const calendarDays = useMemo(() => {
    if (!rangeValid) return [];
    const gridStart = startOfWeekIso(startDate);
    const gridEnd = endOfWeekIso(endDate);
    return listIsoDays(gridStart, gridEnd);
  }, [endDate, rangeValid, startDate]);

  const selectedDayItems = useMemo(() => {
    if (!rangeValid || !selectedDate) return [] as CalendarItem[];
    return itemsByDate[selectedDate] ?? [];
  }, [itemsByDate, rangeValid, selectedDate]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadTasks(), loadClients(), loadCases()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh');
    }
  }, [loadCases, loadClients, loadTasks]);

  const handleCreateTask = useCallback(
    async (payload: TaskCreateInput) => {
      await api('/tasks', { method: 'POST', body: JSON.stringify(payload) });
      await Promise.all([loadTasks(), loadCases()]);
      if (payload.dueDate && rangeValid && payload.dueDate >= startDate && payload.dueDate <= endDate) {
        setSelectedDate(payload.dueDate);
      }
    },
    [api, endDate, loadCases, loadTasks, rangeValid, startDate],
  );

  const handleStatusChange = useCallback(
    async (taskId: string, status: TaskStatus) => {
      await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    },
    [api],
  );

  const handleDelete = useCallback(
    async (taskId: string) => {
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    },
    [api],
  );

  const handleMoveCase = useCallback(
    async (caseId: string, status: PostSalesStatus) => {
      setMovingCaseId(caseId);
      setError(null);
      try {
        const updated = await api<PostSalesCase>(`/post-sales/cases/${caseId}/move`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        });
        setPostSalesCases((prev) => prev.map((item) => (item.id === caseId ? updated : item)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to move case');
      } finally {
        setMovingCaseId(null);
      }
    },
    [api],
  );

  const readHoursDraft = useCallback(
    (task: Task) => {
      const draft = hoursDraftByTask[task.id];
      if (draft !== undefined) return draft;
      const hours = toTaskHours(task.timeSpentHours);
      return hours === null ? '' : String(hours);
    },
    [hoursDraftByTask],
  );

  const handleSaveHours = useCallback(
    async (task: Task) => {
      const raw = readHoursDraft(task).trim();
      const parsed = raw ? Number(raw) : 0;
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Hours must be a number >= 0');
        return;
      }
      setSavingHoursTaskId(task.id);
      setError(null);
      try {
        await api(`/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ timeSpentHours: parsed }),
        });
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, timeSpentHours: parsed } : t)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save hours');
      } finally {
        setSavingHoursTaskId(null);
      }
    },
    [api, readHoursDraft],
  );

  const setThisMonth = useCallback(() => {
    const today = todayIsoUtc();
    const monthRange = getRangeForPeriod(today, 'MONTH');
    setPeriodViewMode('MONTH');
    setPeriodAnchorDate(today);
    setStartDate(monthRange.startIso);
    setEndDate(monthRange.endIso);
    setSelectedDate(todayIsoUtcClamped(monthRange.startIso, monthRange.endIso));
  }, []);

  const setPeriodPreset = useCallback(
    (mode: Exclude<PeriodViewMode, 'CUSTOM'>) => {
      const anchor = selectedDate || periodAnchorDate || todayIsoUtc();
      const next = getRangeForPeriod(anchor, mode);
      setPeriodViewMode(mode);
      setPeriodAnchorDate(anchor);
      setStartDate(next.startIso);
      setEndDate(next.endIso);
      setSelectedDate(clampIsoToRange(anchor, next.startIso, next.endIso));
    },
    [periodAnchorDate, selectedDate],
  );

  const shiftPeriod = useCallback(
    (direction: -1 | 1) => {
      if (periodViewMode === 'CUSTOM') return;
      const baseAnchor = periodAnchorDate || selectedDate || todayIsoUtc();
      const shiftedAnchor = shiftPeriodAnchor(baseAnchor, periodViewMode, direction);
      const next = getRangeForPeriod(shiftedAnchor, periodViewMode);
      setPeriodAnchorDate(shiftedAnchor);
      setStartDate(next.startIso);
      setEndDate(next.endIso);
      setSelectedDate(clampIsoToRange(shiftedAnchor, next.startIso, next.endIso));
    },
    [periodAnchorDate, periodViewMode, selectedDate],
  );

  const canShiftPeriod = periodViewMode !== 'CUSTOM';

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Post-Sales</p>
            <h1 className="text-3xl font-semibold">Customer Delivery Pipeline</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setActiveView('PIPELINE')}
                className={[
                  'rounded-lg px-3 py-1.5 text-sm font-semibold',
                  activeView === 'PIPELINE' ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-300 hover:bg-white/10',
                ].join(' ')}
              >
                Pipeline
              </button>
              <button
                type="button"
                onClick={() => setActiveView('CALENDAR')}
                className={[
                  'rounded-lg px-3 py-1.5 text-sm font-semibold',
                  activeView === 'CALENDAR' ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-300 hover:bg-white/10',
                ].join(' ')}
              >
                Calendar
              </button>
            </div>
            {postSalesPipelineId ? (
              <button
                className="btn-secondary"
                onClick={() => router.push(`/crm?pipelineId=${encodeURIComponent(postSalesPipelineId)}`)}
                type="button"
              >
                Open CRM pipeline
              </button>
            ) : null}
            <button className="btn-secondary" onClick={refresh} type="button">
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">Error: {error}</div>
        ) : null}

        {loading ? <div className="mt-6 text-slate-300">Loading post-sales workspace…</div> : null}

        {!loading && !canAccessPostSales ? (
          <div className="card p-6">
            <h2 className="text-xl font-semibold">Access restricted</h2>
            <p className="mt-2 text-sm text-slate-300">
              Post-Sales is available for Admin / Operations / Gerant profiles only. This workspace role is not authorized.
            </p>
          </div>
        ) : null}

        {!loading && canAccessPostSales && activeView === 'PIPELINE' ? (
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-sm text-slate-300">
                Pipeline flow: CRM deal WON {'->'} automatic Post-Sales case {'->'} operational delivery tracking.
              </p>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-5">
                {POST_SALES_STATUSES.map((column) => {
                  const cases = casesByStatus[column.key];
                  return (
                    <section
                      key={column.key}
                      className="w-[340px] min-w-[340px] flex-[0_0_auto] rounded-2xl border border-white/10 bg-white/5 p-4"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const caseId = event.dataTransfer.getData('text/plain');
                        if (!caseId) return;
                        void handleMoveCase(caseId, column.key);
                      }}
                    >
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-slate-100">{column.label}</h3>
                        <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-white/10">{cases.length}</span>
                      </div>

                      <div className="space-y-3">
                        {cases.map((caseItem) => (
                          <article
                            key={caseItem.id}
                            draggable={movingCaseId !== caseItem.id}
                            onDragStart={(event) => {
                              event.dataTransfer.setData('text/plain', caseItem.id);
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            className="w-full rounded-xl bg-slate-900/60 p-4 ring-1 ring-white/10"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-base font-semibold leading-6 text-slate-100 whitespace-normal break-words">{caseItem.name}</p>
                              <span className={['rounded-md px-2 py-0.5 text-[11px] ring-1', PRIORITY_BADGE[caseItem.priority]].join(' ')}>
                                {caseItem.priority}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-400 whitespace-normal break-words">
                              {caseItem.client ? getClientDisplayName(caseItem.client) : 'No client'}
                              {caseItem.deal?.title ? ` · ${caseItem.deal.title}` : ''}
                            </p>
                            <p className="mt-1 text-xs text-slate-400 whitespace-normal break-words">
                              Owner: {caseItem.owner?.name || caseItem.owner?.email || 'Unassigned'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">Deadline: {getIsoDueDate(caseItem.dueDate) || 'No deadline'}</p>
                          </article>
                        ))}
                        {cases.length === 0 ? <p className="text-xs text-slate-500">No cases in this step.</p> : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {!loading && canAccessPostSales && activeView === 'CALENDAR' ? (
          <>
            <CalendarSyncCard />

            <div className="mt-4 card p-4">
              <div className="grid gap-3 md:grid-cols-12 md:items-end">
                <div className="md:col-span-2">
                  <button
                    className="rounded-lg px-2 py-1.5 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    onClick={() => shiftPeriod(-1)}
                    type="button"
                    disabled={!canShiftPeriod}
                    aria-label="Previous period"
                  >
                    ←
                  </button>
                </div>
                <div className="md:col-span-2">
                  <button
                    className={[
                      'rounded-lg px-3 py-1.5 text-sm font-semibold',
                      periodViewMode === 'WEEK' ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-300 hover:bg-white/10',
                    ].join(' ')}
                    onClick={() => setPeriodPreset('WEEK')}
                    type="button"
                  >
                    Week
                  </button>
                </div>
                <div className="md:col-span-2">
                  <button
                    className={[
                      'rounded-lg px-3 py-1.5 text-sm font-semibold',
                      periodViewMode === 'MONTH' ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-300 hover:bg-white/10',
                    ].join(' ')}
                    onClick={() => setPeriodPreset('MONTH')}
                    type="button"
                  >
                    Month
                  </button>
                </div>
                <div className="md:col-span-2">
                  <button
                    className={[
                      'rounded-lg px-3 py-1.5 text-sm font-semibold',
                      periodViewMode === 'YEAR' ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-300 hover:bg-white/10',
                    ].join(' ')}
                    onClick={() => setPeriodPreset('YEAR')}
                    type="button"
                  >
                    Year
                  </button>
                </div>
                <div className="md:col-span-2">
                  <button
                    className="rounded-lg px-2 py-1.5 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    onClick={() => shiftPeriod(1)}
                    type="button"
                    disabled={!canShiftPeriod}
                    aria-label="Next period"
                  >
                    →
                  </button>
                </div>
                <div className="md:col-span-2">
                  <button className="btn-secondary w-full" onClick={setThisMonth} type="button">
                    This month
                  </button>
                </div>

                <div className="md:col-span-4">
                  <label className="text-sm text-slate-300">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStartDate(next);
                      setPeriodViewMode('CUSTOM');
                      if (next) setPeriodAnchorDate(next);
                    }}
                    className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="text-sm text-slate-300">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setEndDate(next);
                      setPeriodViewMode('CUSTOM');
                      if (startDate) setPeriodAnchorDate(startDate);
                    }}
                    className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div className="md:col-span-4">
                  <div className="text-sm text-slate-300">
                    Period {periodViewMode === 'CUSTOM' ? '(Custom)' : `(${periodViewMode.toLowerCase()})`}
                  </div>
                  <div className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10">
                    {rangeValid ? rangeLabel : 'Select a valid date range'}
                  </div>
                </div>
              </div>
            </div>

            {!rangeValid && startDate && endDate && startDate > endDate ? (
              <p className="mt-3 text-sm text-red-200">Start date must be before end date.</p>
            ) : null}

            {rangeValid ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <div className="card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Calendar</p>
                        <p className="text-lg font-semibold">{rangeLabel}</p>
                      </div>
                      <div className="text-sm text-slate-400">{calendarItemsInRange.length} items in range</div>
                    </div>

                    <div className="grid grid-cols-7 gap-2 text-xs text-slate-400">
                      {WEEKDAY_LABELS.map((d) => (
                        <div key={d} className="px-2 py-1 text-center uppercase tracking-[0.12em]">
                          {d}
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-2">
                      {calendarDays.map((iso) => {
                        const inRange = iso >= startDate && iso <= endDate;
                        const isSelected = iso === selectedDate;
                        const isToday = iso === todayIsoUtc();
                        const dayItems = itemsByDate[iso] ?? [];

                        return (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => {
                              if (!inRange) return;
                              setSelectedDate(iso);
                              setPeriodAnchorDate(iso);
                            }}
                            disabled={!inRange}
                            className={[
                              'min-h-[92px] rounded-xl border px-2 py-2 text-left transition',
                              inRange ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-white/5 bg-white/3 opacity-40',
                              isSelected ? 'ring-2 ring-cyan-400' : '',
                              isToday ? 'border-cyan-400/30' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-200">{String(Number(iso.slice(8, 10)))}</span>
                              {dayItems.length ? (
                                <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-white/10">
                                  {dayItems.length}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 space-y-1">
                              {dayItems.slice(0, 3).map((item) => (
                                <div
                                  key={`${item.type}-${item.id}`}
                                  className={[
                                    'truncate rounded-md px-2 py-1 text-xs ring-1',
                                    item.type === 'case'
                                      ? 'bg-amber-500/10 text-amber-100 ring-amber-500/20'
                                      : item.status === 'DONE'
                                        ? 'bg-emerald-500/10 text-emerald-100 ring-emerald-500/20'
                                        : item.status === 'IN_PROGRESS'
                                          ? 'bg-cyan-500/10 text-cyan-100 ring-cyan-400/20'
                                          : 'bg-white/5 text-slate-200 ring-white/10',
                                  ].join(' ')}
                                >
                                  {item.title}
                                </div>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-4">
                  <TaskCreateCard
                    clients={clients}
                    cases={postSalesCases}
                    defaultDueDate={selectedDate || startDate}
                    disabled={!rangeValid}
                    onSubmit={handleCreateTask}
                  />

                  <div className="card p-4">
                    <div className="mb-3">
                      <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Selected day</p>
                      <p className="text-lg font-semibold">{selectedDate ? formatIsoDatePretty(selectedDate) : '—'}</p>
                    </div>

                    <div className="space-y-2">
                      {selectedDayItems.map((item) => {
                        if (item.type === 'case') {
                          return (
                            <div key={`case-${item.id}`} className="rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/20">
                              <p className="text-sm font-semibold">{item.title}</p>
                              <p className="mt-1 text-xs text-slate-300">{item.clientName}</p>
                              <p className="mt-1 text-xs text-amber-100">Pipeline case · {item.status}</p>
                            </div>
                          );
                        }

                        const task = item.task;
                        return (
                          <div key={`task-${item.id}`} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{task.title}</p>
                                <p className="mt-1 text-xs text-slate-400">{task.client ? getClientDisplayName(task.client) : 'No client'}</p>
                                {(() => {
                                  const hours = formatTaskHours(task.timeSpentHours);
                                  return hours ? <p className="mt-1 text-xs text-cyan-200">{hours}</p> : null;
                                })()}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDelete(task.id)}
                                className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
                              >
                                Delete
                              </button>
                            </div>
                            <div className="mt-2">
                              <TaskCalendarActions task={task} ownerEmail={user?.email} />
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <select
                                value={task.status}
                                onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                              >
                                <option value="PENDING">Pending</option>
                                <option value="IN_PROGRESS">In progress</option>
                                <option value="DONE">Done</option>
                              </select>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={readHoursDraft(task)}
                                onChange={(e) => setHoursDraftByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                placeholder="Hours spent"
                              />
                              <button
                                type="button"
                                className="btn-secondary text-xs"
                                onClick={() => void handleSaveHours(task)}
                                disabled={savingHoursTaskId === task.id}
                              >
                                {savingHoursTaskId === task.id ? 'Saving...' : 'Save h'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {selectedDayItems.length === 0 ? <p className="text-sm text-slate-400">No items for this day.</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </AppShell>
    </Guard>
  );
}

function getIsoDueDate(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
}

function getTaskIsoDueDate(task: Task): string | null {
  return getIsoDueDate(task.dueDate || null);
}

function toTaskHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function formatTaskHours(value: unknown): string {
  const hours = toTaskHours(value);
  if (hours === null || hours <= 0) return '';
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`;
}

function isoToUtcDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map((v) => Number(v));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysIso(iso: string, days: number): string {
  const date = isoToUtcDate(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(iso: string, months: number): string {
  const date = isoToUtcDate(iso);
  if (!date) return iso;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  const targetMonthDate = new Date(Date.UTC(y, m + months, 1));
  const maxDay = new Date(Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonthDate.setUTCDate(Math.min(d, maxDay));
  return targetMonthDate.toISOString().slice(0, 10);
}

function addYearsIso(iso: string, years: number): string {
  return addMonthsIso(iso, years * 12);
}

function isoWeekdayMon1(iso: string): number {
  const date = isoToUtcDate(iso);
  if (!date) return 1;
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function startOfWeekIso(iso: string): string {
  const w = isoWeekdayMon1(iso);
  return addDaysIso(iso, -(w - 1));
}

function endOfWeekIso(iso: string): string {
  const w = isoWeekdayMon1(iso);
  return addDaysIso(iso, 7 - w);
}

function listIsoDays(startIso: string, endIso: string): string[] {
  if (!startIso || !endIso) return [];
  if (startIso > endIso) return [];
  const days: string[] = [];
  let cur = startIso;
  let safety = 0;
  while (cur <= endIso && safety < 500) {
    days.push(cur);
    cur = addDaysIso(cur, 1);
    safety += 1;
  }
  return days;
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayIsoUtcClamped(startIso: string, endIso: string): string {
  const today = todayIsoUtc();
  if (today < startIso) return startIso;
  if (today > endIso) return endIso;
  return today;
}

function clampIsoToRange(iso: string, startIso: string, endIso: string): string {
  if (!iso) return startIso;
  if (iso < startIso) return startIso;
  if (iso > endIso) return endIso;
  return iso;
}

function getRangeForPeriod(anchorIso: string, mode: Exclude<PeriodViewMode, 'CUSTOM'>): { startIso: string; endIso: string } {
  const anchor = isoToUtcDate(anchorIso) ? anchorIso : todayIsoUtc();

  if (mode === 'WEEK') {
    return {
      startIso: startOfWeekIso(anchor),
      endIso: endOfWeekIso(anchor),
    };
  }

  if (mode === 'MONTH') {
    const anchorDate = isoToUtcDate(anchor)!;
    const y = anchorDate.getUTCFullYear();
    const m = anchorDate.getUTCMonth();
    return {
      startIso: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
      endIso: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
    };
  }

  const anchorDate = isoToUtcDate(anchor)!;
  const y = anchorDate.getUTCFullYear();
  return {
    startIso: `${y}-01-01`,
    endIso: `${y}-12-31`,
  };
}

function shiftPeriodAnchor(anchorIso: string, mode: Exclude<PeriodViewMode, 'CUSTOM'>, direction: -1 | 1): string {
  if (mode === 'WEEK') return addDaysIso(anchorIso, direction * 7);
  if (mode === 'MONTH') return addMonthsIso(anchorIso, direction);
  return addYearsIso(anchorIso, direction);
}

function formatIsoDatePretty(iso: string): string {
  const date = isoToUtcDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateRangeLabel(startIso: string, endIso: string): string {
  const start = isoToUtcDate(startIso);
  const end = isoToUtcDate(endIso);
  if (!start || !end) return `${startIso} - ${endIso}`;
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtLong = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (sameMonth) return fmtMonth.format(start);
  return `${fmtLong.format(start)} - ${fmtLong.format(end)}`;
}

function formatActivePeriodLabel(mode: PeriodViewMode, startIso: string, endIso: string): string {
  if (mode === 'WEEK') {
    const start = isoToUtcDate(startIso);
    const end = isoToUtcDate(endIso);
    if (!start || !end) return formatDateRangeLabel(startIso, endIso);
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `Week: ${fmt.format(start)} - ${fmt.format(end)}`;
  }

  if (mode === 'YEAR') {
    const start = isoToUtcDate(startIso);
    if (!start) return formatDateRangeLabel(startIso, endIso);
    return String(start.getUTCFullYear());
  }

  return formatDateRangeLabel(startIso, endIso);
}

function TaskCreateCard({
  clients,
  cases,
  defaultDueDate,
  disabled,
  onSubmit,
}: {
  clients: Client[];
  cases: PostSalesCase[];
  defaultDueDate: string;
  disabled: boolean;
  onSubmit: (payload: TaskCreateInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [postSalesCaseId, setPostSalesCaseId] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [status, setStatus] = useState<TaskStatus>('IN_PROGRESS');
  const [timeSpentHours, setTimeSpentHours] = useState('');
  const [saving, setSaving] = useState(false);
  const lastDefaultRef = useRef(defaultDueDate);

  useEffect(() => {
    if (dueDate === lastDefaultRef.current) {
      setDueDate(defaultDueDate);
    }
    lastDefaultRef.current = defaultDueDate;
  }, [defaultDueDate, dueDate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    try {
      const parsedHours = timeSpentHours.trim() ? Number(timeSpentHours) : undefined;
      await onSubmit({
        title,
        clientId,
        dueDate,
        status,
        postSalesCaseId: postSalesCaseId || undefined,
        timeSpentHours: parsedHours !== undefined && Number.isFinite(parsedHours) && parsedHours >= 0 ? parsedHours : undefined,
      });
      setTitle('');
      setClientId('');
      setPostSalesCaseId('');
      setStatus('IN_PROGRESS');
      setTimeSpentHours('');
    } finally {
      setSaving(false);
    }
  };

  const caseOptions = useMemo(
    () => cases.map((item) => ({ id: item.id, name: item.name, clientId: item.clientId || '', status: item.status })),
    [cases],
  );

  return (
    <form onSubmit={handleSubmit} className="card p-4">
      <div className="mb-3">
        <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Add task</p>
        <p className="text-lg font-semibold">Create an operational task</p>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="text-sm text-slate-300">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            placeholder="Onboarding kickoff, delivery planning..."
            disabled={disabled || saving}
          />
        </div>

        <div>
          <label className="text-sm text-slate-300">Post-Sales case (optional)</label>
          <select
            value={postSalesCaseId}
            onChange={(e) => {
              const nextCaseId = e.target.value;
              setPostSalesCaseId(nextCaseId);
              const selected = caseOptions.find((item) => item.id === nextCaseId);
              if (selected?.clientId) setClientId(selected.clientId);
            }}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            disabled={disabled || saving}
          >
            <option value="">No linked case</option>
            {caseOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-slate-300">Client</label>
          <select
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            disabled={disabled || saving}
          >
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {getClientDisplayName(c)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-slate-300">Due date</label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              disabled={disabled || saving}
            />
          </div>
          <div>
            <label className="text-sm text-slate-300">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              disabled={disabled || saving}
            >
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-300">Hours spent</label>
            <input
              type="number"
              min="0"
              step="0.25"
              value={timeSpentHours}
              onChange={(e) => setTimeSpentHours(e.target.value)}
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              placeholder="e.g. 1.5"
              disabled={disabled || saving}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={disabled || saving}>
            {saving ? 'Adding...' : 'Add task'}
          </button>
        </div>
      </div>
    </form>
  );
}
