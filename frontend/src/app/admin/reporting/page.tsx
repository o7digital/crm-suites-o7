'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
};

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string | null;
  createdAt?: string;
  clientId?: string | null;
  client?: Client | null;
  timeSpentHours?: number | string | null;
};

type Granularity = 'month' | 'year';

type ReportingTask = {
  id: string;
  title: string;
  status: TaskStatus;
  clientId: string;
  clientName: string;
  dateIso: string;
  hours: number;
};

const HOURS = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function toIsoDate(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  return null;
}

function parseHours(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

function monthRangeUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function yearRangeUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const start = `${y}-01-01`;
  const end = `${y}-12-31`;
  return { start, end };
}

function periodKey(iso: string, granularity: Granularity): string {
  return granularity === 'year' ? iso.slice(0, 4) : iso.slice(0, 7);
}

function periodLabel(key: string, granularity: Granularity): string {
  if (granularity === 'year') return key;
  const [yRaw, mRaw] = key.split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return key;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export default function AdminReportingPage() {
  const { token } = useAuth();
  const api = useApi(token);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('month');
  const defaultMonth = useMemo(() => monthRangeUtc(), []);
  const [startDate, setStartDate] = useState(defaultMonth.start);
  const [endDate, setEndDate] = useState(defaultMonth.end);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [tasksData, clientsData] = await Promise.all([
        api<Task[]>('/tasks'),
        api<Client[]>('/clients'),
      ]);
      setTasks(tasksData);
      setClients(clientsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reporting data');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [loadData, token]);

  const rangeValid = Boolean(startDate && endDate && startDate <= endDate);

  const filteredTasks = useMemo<ReportingTask[]>(() => {
    const clientsById = new Map(clients.map((c) => [c.id, c]));
    return tasks
      .map((task) => {
        const dueIso = toIsoDate(task.dueDate);
        const createdIso = toIsoDate(task.createdAt);
        const dateIso = dueIso || createdIso;
        if (!dateIso) return null;
        if (rangeValid && (dateIso < startDate || dateIso > endDate)) return null;

        const fallbackClient = task.clientId ? clientsById.get(task.clientId) : null;
        const clientName = task.client
          ? getClientDisplayName(task.client)
          : fallbackClient
            ? getClientDisplayName(fallbackClient)
            : 'No client';

        return {
          id: task.id,
          title: task.title || 'Untitled task',
          status: task.status || 'PENDING',
          clientId: task.clientId || '__no_client__',
          clientName,
          dateIso,
          hours: parseHours(task.timeSpentHours),
        };
      })
      .filter((x): x is ReportingTask => Boolean(x));
  }, [clients, endDate, rangeValid, startDate, tasks]);

  const summary = useMemo(() => {
    const uniqueClients = new Set<string>();
    const uniqueDays = new Set<string>();
    let totalHours = 0;
    for (const task of filteredTasks) {
      uniqueClients.add(task.clientId);
      uniqueDays.add(task.dateIso);
      totalHours += task.hours;
    }
    return {
      tasks: filteredTasks.length,
      clients: uniqueClients.size,
      activeDays: uniqueDays.size,
      totalHours,
    };
  }, [filteredTasks]);

  const byClient = useMemo(() => {
    const map = new Map<
      string,
      { clientId: string; clientName: string; tasks: number; hours: number; activeDays: Set<string> }
    >();
    for (const task of filteredTasks) {
      const key = task.clientId;
      const row = map.get(key) || {
        clientId: task.clientId,
        clientName: task.clientName,
        tasks: 0,
        hours: 0,
        activeDays: new Set<string>(),
      };
      row.tasks += 1;
      row.hours += task.hours;
      row.activeDays.add(task.dateIso);
      map.set(key, row);
    }
    return Array.from(map.values())
      .map((row) => ({
        clientId: row.clientId,
        clientName: row.clientName,
        tasks: row.tasks,
        hours: row.hours,
        activeDays: row.activeDays.size,
      }))
      .sort((a, b) => b.hours - a.hours || b.tasks - a.tasks || a.clientName.localeCompare(b.clientName));
  }, [filteredTasks]);

  const byTask = useMemo(() => {
    return [...filteredTasks]
      .sort((a, b) => b.hours - a.hours || b.dateIso.localeCompare(a.dateIso))
      .slice(0, 40);
  }, [filteredTasks]);

  const byPeriodClient = useMemo(() => {
    const map = new Map<
      string,
      { period: string; clientName: string; tasks: number; hours: number; activeDays: Set<string> }
    >();
    for (const task of filteredTasks) {
      const period = periodKey(task.dateIso, granularity);
      const key = `${period}::${task.clientId}`;
      const row = map.get(key) || {
        period,
        clientName: task.clientName,
        tasks: 0,
        hours: 0,
        activeDays: new Set<string>(),
      };
      row.tasks += 1;
      row.hours += task.hours;
      row.activeDays.add(task.dateIso);
      map.set(key, row);
    }
    return Array.from(map.values())
      .map((row) => ({
        period: row.period,
        periodLabel: periodLabel(row.period, granularity),
        clientName: row.clientName,
        tasks: row.tasks,
        hours: row.hours,
        activeDays: row.activeDays.size,
      }))
      .sort((a, b) => b.period.localeCompare(a.period) || b.hours - a.hours || a.clientName.localeCompare(b.clientName));
  }, [filteredTasks, granularity]);

  const setThisMonth = useCallback(() => {
    const next = monthRangeUtc();
    setStartDate(next.start);
    setEndDate(next.end);
    setGranularity('month');
  }, []);

  const setThisYear = useCallback(() => {
    const next = yearRangeUtc();
    setStartDate(next.start);
    setEndDate(next.end);
    setGranularity('year');
  }, []);

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
            <h1 className="text-3xl font-semibold">Reporting</h1>
            <p className="mt-2 text-sm text-slate-400">
              Post-Sales reports: hours per client/task, active days, and month/year breakdowns.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={setThisMonth}>
              This month
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={setThisYear}>
              This year
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => void loadData()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="card mb-6 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-sm text-slate-300">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Breakdown</label>
              <select
                value={granularity}
                onChange={(e) => setGranularity(e.target.value as Granularity)}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              >
                <option value="month">By month</option>
                <option value="year">By year</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300">Period</label>
              <div className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10">
                {rangeValid ? `${startDate} -> ${endDate}` : 'Select a valid date range'}
              </div>
            </div>
          </div>
          {!rangeValid && startDate && endDate && startDate > endDate ? (
            <p className="mt-3 text-sm text-red-200">Start date must be before end date.</p>
          ) : null}
        </div>

        {error ? <div className="mb-6 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div> : null}

        {loading ? <div className="card p-6 text-slate-300">Loading reporting data...</div> : null}

        {!loading && rangeValid ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="card p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Tasks</p>
                <p className="mt-2 text-2xl font-semibold">{INT.format(summary.tasks)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Clients</p>
                <p className="mt-2 text-2xl font-semibold">{INT.format(summary.clients)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Active days</p>
                <p className="mt-2 text-2xl font-semibold">{INT.format(summary.activeDays)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Total hours</p>
                <p className="mt-2 text-2xl font-semibold">{HOURS.format(summary.totalHours)}h</p>
              </div>
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Hours and days by client</h2>
                <p className="text-xs text-slate-400">{byClient.length} client(s)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Hours</th>
                      <th className="px-3 py-2">Tasks</th>
                      <th className="px-3 py-2">Active days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byClient.map((row) => (
                      <tr key={row.clientId} className="border-t border-white/10">
                        <td className="px-3 py-2">{row.clientName}</td>
                        <td className="px-3 py-2">{HOURS.format(row.hours)}h</td>
                        <td className="px-3 py-2">{INT.format(row.tasks)}</td>
                        <td className="px-3 py-2">{INT.format(row.activeDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {byClient.length === 0 ? <p className="px-3 py-4 text-sm text-slate-400">No tasks in this period.</p> : null}
              </div>
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Time by task</h2>
                <p className="text-xs text-slate-400">Top {Math.min(byTask.length, 40)} tasks</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-3 py-2">Task</th>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTask.map((row) => (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="px-3 py-2">{row.title}</td>
                        <td className="px-3 py-2">{row.clientName}</td>
                        <td className="px-3 py-2">{row.dateIso}</td>
                        <td className="px-3 py-2">{row.status}</td>
                        <td className="px-3 py-2">{HOURS.format(row.hours)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {byTask.length === 0 ? <p className="px-3 py-4 text-sm text-slate-400">No tasks in this period.</p> : null}
              </div>
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Client breakdown by {granularity}</h2>
                <p className="text-xs text-slate-400">{byPeriodClient.length} row(s)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Hours</th>
                      <th className="px-3 py-2">Tasks</th>
                      <th className="px-3 py-2">Active days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPeriodClient.map((row, idx) => (
                      <tr key={`${row.period}-${row.clientName}-${idx}`} className="border-t border-white/10">
                        <td className="px-3 py-2">{row.periodLabel}</td>
                        <td className="px-3 py-2">{row.clientName}</td>
                        <td className="px-3 py-2">{HOURS.format(row.hours)}h</td>
                        <td className="px-3 py-2">{INT.format(row.tasks)}</td>
                        <td className="px-3 py-2">{INT.format(row.activeDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {byPeriodClient.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-400">No tasks in this period.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </Guard>
  );
}
