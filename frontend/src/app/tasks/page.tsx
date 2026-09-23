'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';
import { useI18n } from '../../contexts/I18nContext';
import { CalendarSyncCard } from '@/components/CalendarSyncCard';
import { phase1Labels } from '@/lib/pulse-phase1';
import { TaskCalendarActions } from '@/components/TaskCalendarActions';

type Task = {
  id: string;
  title: string;
  status: string;
  assigneeId?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  opportunityId?: string | null;
  completedAt?: string | null;
  assignee?: { id: string; name: string } | null;
  opportunity?: { id: string; title: string } | null;
  dueDate?: string;
  amount?: number | string | null;
  currency?: string;
  timeSpentHours?: number | string | null;
  client?: { id: string; firstName?: string | null; name: string; email?: string | null };
};

type Client = { id: string; firstName?: string | null; name: string };
type Person = { id: string; name: string };
type Opportunity = { id: string; title: string };
type TaskInput = { assigneeId?: string | null; priority?: Task['priority']; opportunityId?: string | null; title: string; clientId: string; dueDate?: string; amount?: number; currency?: string };

export default function TasksPage() {
  const { token, user } = useAuth();
  const api = useApi(token);
  const { t, language } = useI18n();
  const labels = phase1Labels(language);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [error, setError] = useState('');

  const loadData = useCallback(() => {
    Promise.all([api<Task[]>('/tasks'), api<Client[]>('/clients'), api<Person[]>('/tasks/assignees'), api<Opportunity[]>('/deals')]).then(([tasksData, clientsData, members, deals]) => {
      setTasks(tasksData);
      setClients(clientsData);
      setPeople(members);
      setOpportunities(deals);
      setLoading(false);
    }).catch(err => { setError(err.message); setLoading(false); });
  }, [api]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, loadData]);

  const handleCreate = async (payload: TaskInput) => {
    await api('/tasks', { method: 'POST', body: JSON.stringify(payload) });
    loadData();
  };

  const handleUpdate = async (taskId: string, patch: Partial<TaskInput> & { status?: string }) => {
    setError('');
    try {
      const updated = await api<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setTasks(prev => prev.map(task => task.id === taskId ? { ...task, ...updated } : task));
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save'); }
  };
  const handleDelete = async (taskId: string) => {
    try {
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(task => task.id !== taskId));
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to delete'); }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('tasks.section')}</p>
            <h1 className="text-3xl font-semibold">{t('nav.tasks')}</h1>
          </div>
        </div>

        <CalendarSyncCard />

        <div className="mt-6">
          <TaskForm clients={clients} people={people} opportunities={opportunities} onSubmit={handleCreate} />
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        </div>

        {loading && <div className="mt-6 text-slate-300">{t('tasks.loading')}</div>}

        <div className="mt-6 space-y-3">
          {tasks.map((task) => (
            <div id={`task-${task.id}`} key={task.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">{task.title}</p>
                {task.completedAt && <p className="text-xs text-slate-400">{labels.complete}: {new Date(task.completedAt).toLocaleString()}</p>}
                <p className="text-sm text-slate-400">
                  {task.client ? `${t('tasks.client')}: ${getClientDisplayName(task.client)}` : t('tasks.noClient')} ·{' '}
                  {task.dueDate ? `${t('tasks.due')} ${new Date(task.dueDate).toLocaleDateString()}` : t('tasks.noDueDate')}
                  {task.amount !== null && task.amount !== undefined && task.amount !== '' ? (
                    <>
                      {' '}
                      · {(task.currency || 'USD').toUpperCase()} {Number(task.amount).toLocaleString()}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <select aria-label={labels.assignee} className="rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={task.assigneeId || ''} onChange={e => void handleUpdate(task.id, { assigneeId: e.target.value || null })}><option value="">{labels.none}</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
                <select aria-label={labels.priority} className="rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={task.priority} onChange={e => void handleUpdate(task.id, { priority: e.target.value as Task['priority'] })}>{(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(priority => <option key={priority} value={priority}>{labels[priority.toLowerCase() as 'low']}</option>)}</select>
                <select aria-label={labels.opportunity} className="max-w-48 rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={task.opportunityId || ''} onChange={e => void handleUpdate(task.id, { opportunityId: e.target.value || null })}><option value="">{labels.opportunity} —</option>{opportunities.map(deal => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select>
                <TaskCalendarActions task={task} ownerEmail={user?.email} />
                <select
                  value={task.status}
                  onChange={(e) => void handleUpdate(task.id, { status: e.target.value })}
                  className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                >
                  <option value="PENDING">{t('taskStatus.PENDING')}</option>
                  <option value="IN_PROGRESS">{t('taskStatus.IN_PROGRESS')}</option>
                  <option value="DONE">{t('taskStatus.DONE')}</option>
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                  onClick={() => handleDelete(task.id)}
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
          {tasks.length === 0 && !loading && <p className="text-sm text-slate-400">{t('tasks.empty')}</p>}
        </div>
      </AppShell>
    </Guard>
  );
}

function TaskForm({ clients, people, opportunities, onSubmit }: { clients: Client[]; people: Person[]; opportunities: Opportunity[]; onSubmit: (payload: TaskInput) => Promise<void> }) {
  const { t, language } = useI18n();
  const labels = phase1Labels(language);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('MEDIUM');
  const [opportunityId, setOpportunityId] = useState('');
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'MXN' | 'CAD'>('USD');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
    await onSubmit({
      assigneeId: assigneeId || null, priority, opportunityId: opportunityId || null,
      title,
      clientId,
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : undefined,
      amount: amount.trim() ? Number(amount) : undefined,
      currency,
    });
    setSaving(false);
    setTitle('');
    setClientId('');
    setDueDate('');
    setAmount('');
    setCurrency('USD');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save'); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-3 p-4 md:grid-cols-6">
      <div className="md:col-span-3">
        <label className="text-sm text-slate-300">{t('tasks.taskTitle')}</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-3">
        <label className="text-sm text-slate-300">{t('tasks.client')}</label>
        <select
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">{t('tasks.selectClient')}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {getClientDisplayName(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">{t('field.dueDate')}</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">{t('field.amount')}</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          placeholder="0.00"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">{t('field.currency')}</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as 'USD' | 'EUR' | 'MXN' | 'CAD')}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="MXN">MXN</option>
          <option value="CAD">CAD</option>
        </select>
      </div>
      <div className="md:col-span-2"><label className="text-sm text-slate-300">{labels.assignee}</label><select className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option value="">{labels.none}</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div>
      <div className="md:col-span-2"><label className="text-sm text-slate-300">{labels.priority}</label><select className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={priority} onChange={e => setPriority(e.target.value as Task['priority'])}>{(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(value => <option key={value} value={value}>{labels[value.toLowerCase() as 'low']}</option>)}</select></div>
      <div className="md:col-span-2"><label className="text-sm text-slate-300">{labels.opportunity}</label><select className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={opportunityId} onChange={e => setOpportunityId(e.target.value)}><option value="">—</option>{opportunities.map(deal => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select></div>
      {error && <p role="alert" className="md:col-span-6 text-sm text-red-300">{error}</p>}
      <div className="md:col-span-6 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t('tasks.adding') : t('tasks.add')}
        </button>
      </div>
    </form>
  );
}
