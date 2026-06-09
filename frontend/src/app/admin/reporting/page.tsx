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

type Deal = {
  id: string;
  title: string;
  value: number | string | null;
  currency?: string | null;
  expectedCloseDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  clientId?: string | null;
  client?: Client | null;
  stage?: { id: string; name: string; status: 'OPEN' | 'WON' | 'LOST' } | null;
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

type ReportingSale = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  dateIso: string;
  amount: number;
  currency: string;
  stageName: string;
};

const HOURS = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const MONEY = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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

function parseAmount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${MONEY.format(amount)}`;
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
  const [deals, setDeals] = useState<Deal[]>([]);
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
      const [tasksData, dealsData, clientsData] = await Promise.all([
        api<Task[]>('/tasks'),
        api<Deal[]>('/deals'),
        api<Client[]>('/clients'),
      ]);
      setTasks(tasksData);
      setDeals(dealsData);
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

  const filteredSales = useMemo<ReportingSale[]>(() => {
    const clientsById = new Map(clients.map((c) => [c.id, c]));
    return deals
      .map((deal) => {
        if (deal.stage?.status !== 'WON') return null;
        const dateIso = toIsoDate(deal.expectedCloseDate) || toIsoDate(deal.updatedAt) || toIsoDate(deal.createdAt);
        if (!dateIso) return null;
        if (rangeValid && (dateIso < startDate || dateIso > endDate)) return null;

        const fallbackClient = deal.clientId ? clientsById.get(deal.clientId) : null;
        const clientName = deal.client
          ? getClientDisplayName(deal.client)
          : fallbackClient
            ? getClientDisplayName(fallbackClient)
            : 'No client';

        return {
          id: deal.id,
          title: deal.title || 'Untitled sale',
          clientId: deal.clientId || '__no_client__',
          clientName,
          dateIso,
          amount: parseAmount(deal.value),
          currency: String(deal.currency || 'USD').toUpperCase(),
          stageName: deal.stage?.name || 'Won',
        };
      })
      .filter((x): x is ReportingSale => Boolean(x));
  }, [clients, deals, endDate, rangeValid, startDate]);

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

  const salesSummary = useMemo(() => {
    const uniqueClients = new Set<string>();
    const totalsByCurrency = new Map<string, { amount: number; sales: number }>();
    for (const sale of filteredSales) {
      uniqueClients.add(sale.clientId);
      const currencyTotal = totalsByCurrency.get(sale.currency) || { amount: 0, sales: 0 };
      currencyTotal.amount += sale.amount;
      currencyTotal.sales += 1;
      totalsByCurrency.set(sale.currency, currencyTotal);
    }
    const primaryCurrency = Array.from(totalsByCurrency.entries()).sort((a, b) => b[1].amount - a[1].amount)[0];
    return {
      sales: filteredSales.length,
      clients: uniqueClients.size,
      averageSale: primaryCurrency && primaryCurrency[1].sales > 0 ? primaryCurrency[1].amount / primaryCurrency[1].sales : 0,
      primaryTotal: primaryCurrency ? formatMoney(primaryCurrency[0], primaryCurrency[1].amount) : '—',
      totals: Array.from(totalsByCurrency.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([currency, total]) => ({ currency, amount: total.amount, sales: total.sales })),
    };
  }, [filteredSales]);

  const salesByClient = useMemo(() => {
    const map = new Map<
      string,
      { clientId: string; clientName: string; currency: string; sales: number; amount: number }
    >();
    for (const sale of filteredSales) {
      const key = `${sale.clientId}::${sale.currency}`;
      const row = map.get(key) || {
        clientId: sale.clientId,
        clientName: sale.clientName,
        currency: sale.currency,
        sales: 0,
        amount: 0,
      };
      row.sales += 1;
      row.amount += sale.amount;
      map.set(key, row);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.amount - a.amount || b.sales - a.sales || a.clientName.localeCompare(b.clientName),
    );
  }, [filteredSales]);

  const salesByPeriod = useMemo(() => {
    const map = new Map<string, { period: string; currency: string; sales: number; amount: number }>();
    for (const sale of filteredSales) {
      const period = periodKey(sale.dateIso, granularity);
      const key = `${period}::${sale.currency}`;
      const row = map.get(key) || { period, currency: sale.currency, sales: 0, amount: 0 };
      row.sales += 1;
      row.amount += sale.amount;
      map.set(key, row);
    }
    return Array.from(map.values())
      .map((row) => ({ ...row, periodLabel: periodLabel(row.period, granularity) }))
      .sort((a, b) => b.period.localeCompare(a.period) || b.amount - a.amount);
  }, [filteredSales, granularity]);

  const saleRows = useMemo(() => {
    return [...filteredSales].sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.amount - a.amount).slice(0, 60);
  }, [filteredSales]);

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
              Sales and Post-Sales reports by selected period.
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
            <div className="card p-4">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Sales report</h2>
                  <p className="text-xs text-slate-400">Won deals from {startDate} to {endDate}</p>
                </div>
                <p className="text-xs text-slate-400">{salesSummary.sales} sale(s)</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Revenue</p>
                  <p className="mt-2 text-2xl font-semibold">{salesSummary.primaryTotal}</p>
                </div>
                <div className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Sales</p>
                  <p className="mt-2 text-2xl font-semibold">{INT.format(salesSummary.sales)}</p>
                </div>
                <div className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Clients</p>
                  <p className="mt-2 text-2xl font-semibold">{INT.format(salesSummary.clients)}</p>
                </div>
                <div className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Average sale</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {salesSummary.totals[0] ? formatMoney(salesSummary.totals[0].currency, salesSummary.averageSale) : '—'}
                  </p>
                </div>
              </div>

              {salesSummary.totals.length > 1 ? (
                <p className="mt-3 text-xs text-slate-400">
                  Totals by currency:{' '}
                  {salesSummary.totals.map((row) => formatMoney(row.currency, row.amount)).join(' · ')}
                </p>
              ) : null}

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="overflow-x-auto">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200">Sales by client</h3>
                    <p className="text-xs text-slate-400">{salesByClient.length} row(s)</p>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-400">
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Revenue</th>
                        <th className="px-3 py-2">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesByClient.map((row) => (
                        <tr key={`${row.clientId}-${row.currency}`} className="border-t border-white/10">
                          <td className="px-3 py-2">{row.clientName}</td>
                          <td className="px-3 py-2">{formatMoney(row.currency, row.amount)}</td>
                          <td className="px-3 py-2">{INT.format(row.sales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {salesByClient.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-400">No won sales in this period.</p>
                  ) : null}
                </div>

                <div className="overflow-x-auto">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200">Sales by {granularity}</h3>
                    <p className="text-xs text-slate-400">{salesByPeriod.length} row(s)</p>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-400">
                        <th className="px-3 py-2">Period</th>
                        <th className="px-3 py-2">Revenue</th>
                        <th className="px-3 py-2">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesByPeriod.map((row) => (
                        <tr key={`${row.period}-${row.currency}`} className="border-t border-white/10">
                          <td className="px-3 py-2">{row.periodLabel}</td>
                          <td className="px-3 py-2">{formatMoney(row.currency, row.amount)}</td>
                          <td className="px-3 py-2">{INT.format(row.sales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {salesByPeriod.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-400">No won sales in this period.</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Sales detail</h3>
                  <p className="text-xs text-slate-400">Top {Math.min(saleRows.length, 60)} sales</p>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Deal</th>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleRows.map((row) => (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="px-3 py-2">{row.dateIso}</td>
                        <td className="px-3 py-2">{row.title}</td>
                        <td className="px-3 py-2">{row.clientName}</td>
                        <td className="px-3 py-2">{row.stageName}</td>
                        <td className="px-3 py-2">{formatMoney(row.currency, row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {saleRows.length === 0 ? <p className="px-3 py-4 text-sm text-slate-400">No won sales in this period.</p> : null}
              </div>
            </div>

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
