'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';

type Task = {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  client?: { id: string; name: string };
};

type Client = { id: string; name: string };

export default function TasksPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    Promise.all([api('/tasks'), api('/clients')]).then(([tasksData, clientsData]) => {
      setTasks(tasksData);
      setClients(clientsData);
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token]);

  const handleCreate = async (payload: any) => {
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
                  {task.client?.name ? `Client: ${task.client.name}` : 'No client'} ·{' '}
                  {task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date'}
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

function TaskForm({ clients, onSubmit }: { clients: Client[]; onSubmit: (payload: any) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({ title, clientId, dueDate: dueDate || undefined });
    setSaving(false);
    setTitle('');
    setClientId('');
    setDueDate('');
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-3 p-4 md:grid-cols-3">
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">Task title</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div>
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
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-300">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-3 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add task'}
        </button>
      </div>
    </form>
  );
}
