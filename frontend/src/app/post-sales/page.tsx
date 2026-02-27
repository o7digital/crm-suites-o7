'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';

export default function PostSalesPage() {
  const { token } = useAuth();
  const api = useApi(token);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoursDraftByTask, setHoursDraftByTask] = useState<Record<string, string>>({});
  const [savingHoursTaskId, setSavingHoursTaskId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [periodViewMode, setPeriodViewMode] = useState<PeriodViewMode>('MONTH');
  const [periodAnchorDate, setPeriodAnchorDate] = useState('');

  useEffect(() => {
    // Initialize the agenda to the current month using UTC dates to avoid timezone shift issues.
    const today = todayIsoUtc();
    const monthRange = getRangeForPeriod(today, 'MONTH');
    setPeriodViewMode('MONTH');
    setPeriodAnchorDate(today);
    setStartDate(monthRange.startIso);
    setEndDate(monthRange.endIso);
    setSelectedDate(todayIsoUtcClamped(monthRange.startIso, monthRange.endIso));
  }, []);

  const loadClients = useCallback(async () => {
    const clientsData = await api<Client[]>('/clients');
    setClients(clientsData);
  }, [api]);

  const loadTasks = useCallback(async () => {
    const tasksData = await api<Task[]>('/tasks');
    setTasks(tasksData);
  }, [api]);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadTasks(), loadClients()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load data');
    } finally {
      setLoading(false);
    }
  }, [loadClients, loadTasks]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, loadData]);

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

  const tasksInRange = useMemo(() => {
    if (!rangeValid) return [];
    return tasks
      .map((t) => ({ task: t, due: getTaskIsoDueDate(t) }))
      .filter((x) => x.due && x.due >= startDate && x.due <= endDate)
      .map((x) => x.task);
  }, [endDate, rangeValid, startDate, tasks]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasksInRange) {
      const due = getTaskIsoDueDate(task);
      if (!due) continue;
      (map[due] ||= []).push(task);
    }
    for (const [k, list] of Object.entries(map)) {
      map[k] = [...list].sort((a, b) => {
        const aKey = `${a.status}-${(a.title || '').toLowerCase()}`;
        const bKey = `${b.status}-${(b.title || '').toLowerCase()}`;
        return aKey.localeCompare(bKey);
      });
    }
    return map;
  }, [tasksInRange]);

  const calendarDays = useMemo(() => {
    if (!rangeValid) return [];
    const gridStart = startOfWeekIso(startDate);
    const gridEnd = endOfWeekIso(endDate);
    return listIsoDays(gridStart, gridEnd);
  }, [endDate, rangeValid, startDate]);

  const selectedDayTasks = useMemo(() => {
    if (!rangeValid || !selectedDate) return [];
    return tasksByDate[selectedDate] ?? [];
  }, [rangeValid, selectedDate, tasksByDate]);

  const inProgressTasks = useMemo(() => {
    return tasksInRange
      .filter((t) => t.status === 'IN_PROGRESS')
      .map((t) => ({ task: t, due: getTaskIsoDueDate(t) || '9999-12-31' }))
      .sort((a, b) => a.due.localeCompare(b.due) || (a.task.title || '').localeCompare(b.task.title || ''))
      .map((x) => x.task);
  }, [tasksInRange]);

  const tasksWithoutDueDate = useMemo(() => {
    return tasks.filter((t) => !getTaskIsoDueDate(t));
  }, [tasks]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadTasks(), loadClients()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh');
    }
  }, [loadClients, loadTasks]);

  const handleCreateTask = useCallback(
    async (payload: TaskCreateInput) => {
      await api('/tasks', { method: 'POST', body: JSON.stringify(payload) });
      await loadTasks();
      if (payload.dueDate && rangeValid && payload.dueDate >= startDate && payload.dueDate <= endDate) {
        setSelectedDate(payload.dueDate);
      }
    },
    [api, endDate, loadTasks, rangeValid, startDate],
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
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, timeSpentHours: parsed } : t)),
        );
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
            <h1 className="text-3xl font-semibold">Customer Delivery and Operations</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                className="rounded-lg px-2 py-1.5 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40"
                onClick={() => shiftPeriod(-1)}
                type="button"
                disabled={!canShiftPeriod}
                aria-label="Previous period"
              >
                ←
              </button>
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
            <button className="btn-secondary" onClick={setThisMonth} type="button">
              This month
            </button>
            <button className="btn-secondary" onClick={refresh} type="button">
              Refresh
            </button>
          </div>
        </div>

        <div className="card p-4">
          <div className="grid gap-3 md:grid-cols-12 md:items-end">
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
          {!rangeValid && startDate && endDate && startDate > endDate ? (
            <p className="mt-3 text-sm text-red-200">Start date must be before end date.</p>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            Error: {error}
          </div>
        ) : null}

        {loading ? <div className="mt-6 text-slate-300">Loading agenda…</div> : null}

        {!loading && rangeValid ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Agenda</p>
                    <p className="text-lg font-semibold">{rangeLabel}</p>
                  </div>
                  <div className="text-sm text-slate-400">
                    {tasksInRange.length} task{tasksInRange.length === 1 ? '' : 's'} in range
                  </div>
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
                    const dayTasks = tasksByDate[iso] ?? [];
                    const dayNumber = String(Number(iso.slice(8, 10)));
                    const monthShort = iso.endsWith('-01') ? formatIsoMonthShort(iso) : '';
                    const topRight = dayTasks.length ? String(dayTasks.length) : '';

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
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-slate-200">{dayNumber}</span>
                            {monthShort ? <span className="text-xs text-slate-400">{monthShort}</span> : null}
                          </div>
                          {topRight ? (
                            <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-white/10">
                              {topRight}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 space-y-1">
                          {dayTasks.slice(0, 3).map((t) => (
                            <div
                              key={t.id}
                              className={[
                                'truncate rounded-md px-2 py-1 text-xs ring-1',
                                t.status === 'DONE'
                                  ? 'bg-emerald-500/10 text-emerald-100 ring-emerald-500/20'
                                  : t.status === 'IN_PROGRESS'
                                    ? 'bg-cyan-500/10 text-cyan-100 ring-cyan-400/20'
                                    : 'bg-white/5 text-slate-200 ring-white/10',
                              ].join(' ')}
                              title={`${t.title}${t.client ? ` · ${getClientDisplayName(t.client)}` : ''}`}
                            >
                              {t.title}
                            </div>
                          ))}
                          {dayTasks.length > 3 ? (
                            <div className="px-1 text-xs text-slate-400">+{dayTasks.length - 3} more</div>
                          ) : null}
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
                  {selectedDayTasks.map((task) => (
                    <div key={task.id} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{task.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {task.client ? getClientDisplayName(task.client) : 'No client'}
                          </p>
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
                      {(() => {
                        const googleCalendarUrl = buildGoogleCalendarTaskUrl(task);
                        return googleCalendarUrl ? (
                          <div className="mt-2">
                            <a
                              href={googleCalendarUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-cyan-400/30 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/10"
                            >
                              Google Calendar
                            </a>
                          </div>
                        ) : null;
                      })()}
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
                          onChange={(e) =>
                            setHoursDraftByTask((prev) => ({ ...prev, [task.id]: e.target.value }))
                          }
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
                  ))}
                  {selectedDayTasks.length === 0 ? <p className="text-sm text-slate-400">No tasks for this day.</p> : null}
                </div>
              </div>

              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.15em] text-slate-400">In progress</p>
                    <p className="text-lg font-semibold">
                      {inProgressTasks.length} task{inProgressTasks.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">Within selected period</div>
                </div>

                <div className="space-y-2">
                  {inProgressTasks.slice(0, 12).map((task) => (
                    <div key={task.id} className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
                      <p className="truncate text-sm font-semibold">{task.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {task.client ? getClientDisplayName(task.client) : 'No client'}
                        {getTaskIsoDueDate(task) ? ` · ${formatIsoDateShort(getTaskIsoDueDate(task)!)}` : ''}
                      </p>
                      {(() => {
                        const googleCalendarUrl = buildGoogleCalendarTaskUrl(task);
                        return googleCalendarUrl ? (
                          <div className="mt-2">
                            <a
                              href={googleCalendarUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-cyan-400/30 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/10"
                            >
                              Google Calendar
                            </a>
                          </div>
                        ) : null;
                      })()}
                      {(() => {
                        const hours = formatTaskHours(task.timeSpentHours);
                        return hours ? <p className="mt-1 text-xs text-cyan-200">{hours}</p> : null;
                      })()}
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                          className="w-full rounded-lg bg-white/5 px-3 py-1.5 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        >
                          <option value="PENDING">Pending</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="DONE">Done</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  {inProgressTasks.length > 12 ? (
                    <p className="text-xs text-slate-400">Showing 12 of {inProgressTasks.length} tasks.</p>
                  ) : null}
                  {inProgressTasks.length === 0 ? <p className="text-sm text-slate-400">Nothing in progress.</p> : null}
                </div>
              </div>

              {tasksWithoutDueDate.length ? (
                <div className="card p-4">
                  <div className="mb-3">
                    <p className="text-sm uppercase tracking-[0.15em] text-slate-400">No due date</p>
                    <p className="text-lg font-semibold">
                      {tasksWithoutDueDate.length} task{tasksWithoutDueDate.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {tasksWithoutDueDate.slice(0, 8).map((task) => (
                      <div key={task.id} className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
                        <p className="truncate text-sm font-semibold">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {task.client ? getClientDisplayName(task.client) : 'No client'}
                        </p>
                        {(() => {
                          const hours = formatTaskHours(task.timeSpentHours);
                          return hours ? <p className="mt-1 text-xs text-cyan-200">{hours}</p> : null;
                        })()}
                      </div>
                    ))}
                    {tasksWithoutDueDate.length > 8 ? (
                      <p className="text-xs text-slate-400">Showing 8 of {tasksWithoutDueDate.length} tasks.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </AppShell>
    </Guard>
  );
}

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
};

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';
type PeriodViewMode = 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string | null;
  timeSpentHours?: number | string | null;
  clientId?: string;
  client?: Client | null;
};

type TaskCreateInput = {
  title: string;
  clientId: string;
  dueDate: string;
  timeSpentHours?: number;
  status?: TaskStatus;
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function getTaskIsoDueDate(task: Task): string | null {
  if (!task.dueDate) return null;
  if (typeof task.dueDate !== 'string') return null;
  const trimmed = task.dueDate.trim();
  if (!trimmed) return null;
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
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
  const day = date.getUTCDay(); // 0=Sun..6=Sat
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

function formatIsoDateShort(iso: string): string {
  const date = isoToUtcDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatIsoMonthShort(iso: string): string {
  const date = isoToUtcDate(iso);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(date);
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

function isoToGoogleDate(iso: string): string {
  return iso.replaceAll('-', '');
}

function buildGoogleCalendarTaskUrl(task: Task): string | null {
  const dueIso = getTaskIsoDueDate(task);
  if (!dueIso) return null;
  const nextIso = addDaysIso(dueIso, 1);
  const detailsLines = [
    'Post-Sales task from CRM',
    `Status: ${task.status}`,
    task.client ? `Client: ${getClientDisplayName(task.client)}` : '',
  ].filter(Boolean);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.title || 'Post-Sales Task',
    dates: `${isoToGoogleDate(dueIso)}/${isoToGoogleDate(nextIso)}`,
    details: detailsLines.join('\n'),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function TaskCreateCard({
  clients,
  defaultDueDate,
  disabled,
  onSubmit,
}: {
  clients: Client[];
  defaultDueDate: string;
  disabled: boolean;
  onSubmit: (payload: TaskCreateInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [status, setStatus] = useState<TaskStatus>('IN_PROGRESS');
  const [timeSpentHours, setTimeSpentHours] = useState('');
  const [saving, setSaving] = useState(false);
  const lastDefaultRef = useRef(defaultDueDate);

  useEffect(() => {
    // Keep due date in sync with the selected day unless the user manually changed it.
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
        timeSpentHours:
          parsedHours !== undefined && Number.isFinite(parsedHours) && parsedHours >= 0 ? parsedHours : undefined,
      });
      setTitle('');
      setClientId('');
      setStatus('IN_PROGRESS');
      setTimeSpentHours('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4">
      <div className="mb-3">
        <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Add task</p>
        <p className="text-lg font-semibold">Create a post-sales task</p>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="text-sm text-slate-300">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            placeholder="Onboarding kickoff, delivery planning…"
            disabled={disabled || saving}
          />
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
            {saving ? 'Adding…' : 'Add task'}
          </button>
        </div>
      </div>
    </form>
  );
}
