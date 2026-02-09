'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';

type Task = {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  amount?: number | string | null;
  currency?: string;
  client?: { id: string; firstName?: string | null; name: string };
};

type Client = { id: string; firstName?: string | null; name: string };
type TaskInput = { title: string; clientId: string; dueDate?: string; amount?: number; currency?: string };

export default function TasksPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    Promise.all([api<Task[]>('/tasks'), api<Client[]>('/clients')]).then(([tasksData, clientsData]) => {
      setTasks(tasksData);
      setClients(clientsData);
      setLoading(false);
    });
  }, [api]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, loadData]);

  const handleCreate = async (payload: TaskInput) => {
    await api('/tasks', { method: 'POST', body: JSON.stringify(payload) });
    loadData();
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  };

  const handleDelete = async (taskId: string) => {
    await api(`/tasks/${taskId}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Workflow</p>
            <h1 className="text-3xl font-semibold">Tasks</h1>
          </div>
        </div>

        <TaskForm clients={clients} onSubmit={handleCreate} />

        {loading && <div className="mt-6 text-slate-300">Loading tasks…</div>}

        <div className="mt-6 space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">{task.title}</p>
                <p className="text-sm text-slate-400">
                  {task.client ? `Client: ${getClientDisplayName(task.client)}` : 'No client'} ·{' '}
                  {task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date'}
                  {task.amount !== null && task.amount !== undefined && task.amount !== '' ? (
                    <>
                      {' '}
                      · {(task.currency || 'USD').toUpperCase()} {Number(task.amount).toLocaleString()}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value)}
                  className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                >
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DONE">Done</option>
                </select>
                <button
                  className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                  onClick={() => handleDelete(task.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {tasks.length === 0 && !loading && <p className="text-sm text-slate-400">No tasks yet.</p>}
        </div>
      </AppShell>
    </Guard>
  );
}

function TaskForm({ clients, onSubmit }: { clients: Client[]; onSubmit: (payload: TaskInput) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'MXN'>('USD');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({
      title,
      clientId,
      dueDate: dueDate || undefined,
      amount: amount.trim() ? Number(amount) : undefined,
      currency,
    });
    setSaving(false);
    setTitle('');
    setClientId('');
    setDueDate('');
    setAmount('');
    setCurrency('USD');
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-3 p-4 md:grid-cols-6">
      <div className="md:col-span-3">
        <label className="text-sm text-slate-300">Task title</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-3">
        <label className="text-sm text-slate-300">Client</label>
        <select
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">Select client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {getClientDisplayName(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">Amount</label>
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
        <label className="text-sm text-slate-300">Currency</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as 'USD' | 'EUR' | 'MXN')}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="MXN">MXN</option>
        </select>
      </div>
      <div className="md:col-span-6 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add task'}
        </button>
      </div>
    </form>
  );
}
