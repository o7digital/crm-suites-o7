'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
  company?: string | null;
};

type Deal = {
  id: string;
  title: string;
  stage?: { status?: 'OPEN' | 'WON' | 'LOST' | null } | null;
  clientId?: string | null;
};

type Project = {
  id: string;
  name: string;
  description?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'WAITING_CLIENT' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  healthStatus: 'HEALTHY' | 'RISK' | 'CRITICAL';
  dueDate?: string | null;
  createdAt: string;
  client: Client;
  deal?: { id: string; title: string } | null;
  owner?: { id: string; name: string; email?: string | null } | null;
  _count?: { tasks: number };
};

type ProjectStatusOption = Project['status'];
type ProjectPriorityOption = Project['priority'];

type CreateProjectPayload = {
  name: string;
  description?: string;
  clientId: string;
  dealId?: string;
  status: ProjectStatusOption;
  priority: ProjectPriorityOption;
  dueDate?: string;
};

const STATUS_LABEL: Record<Project['status'], string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  WAITING_CLIENT: 'Waiting Client',
  COMPLETED: 'Completed',
};

const PRIORITY_LABEL: Record<Project['priority'], string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

const HEALTH_LABEL: Record<Project['healthStatus'], string> = {
  HEALTHY: 'Healthy',
  RISK: 'Risk',
  CRITICAL: 'Critical',
};

export default function PostSalesProjectsPage() {
  const { token } = useAuth();
  const api = useApi(token);

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [wonDeals, setWonDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | Project['status']>('ALL');

  const [form, setForm] = useState<CreateProjectPayload>({
    name: '',
    description: '',
    clientId: '',
    dealId: '',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    dueDate: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsData, clientsData, dealsData] = await Promise.all([
        api<Project[]>('/post-sales/projects'),
        api<Client[]>('/clients'),
        api<Deal[]>('/deals'),
      ]);
      setProjects(projectsData);
      setClients(clientsData);
      setWonDeals(
        dealsData.filter((deal) => (deal.stage?.status || 'OPEN') === 'WON'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load post-sales projects');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!token) return;
    void loadData();
  }, [loadData, token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const prefillDealId = params.get('dealId') || '';
    const prefillClientId = params.get('clientId') || '';
    const prefillName = params.get('name') || '';

    if (!prefillDealId && !prefillClientId && !prefillName) return;

    setForm((prev) => ({
      ...prev,
      dealId: prefillDealId || prev.dealId,
      clientId: prefillClientId || prev.clientId,
      name: prefillName || prev.name,
    }));
    setShowCreate(true);
  }, []);

  const filteredProjects = useMemo(() => {
    if (statusFilter === 'ALL') return projects;
    return projects.filter((project) => project.status === statusFilter);
  }, [projects, statusFilter]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<Project>('/post-sales/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description?.trim() || undefined,
          clientId: form.clientId,
          dealId: form.dealId?.trim() || undefined,
          status: form.status,
          priority: form.priority,
          dueDate: form.dueDate?.trim() || undefined,
        }),
      });
      setProjects((prev) => [created, ...prev]);
      setShowCreate(false);
      setForm({
        name: '',
        description: '',
        clientId: '',
        dealId: '',
        status: 'ACTIVE',
        priority: 'MEDIUM',
        dueDate: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Post-Sales</p>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="mt-2 text-sm text-slate-300">
              Delivery workspace connected to won deals and clients.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => void loadData()}>
              Refresh
            </button>
            <button type="button" className="btn-primary text-sm" onClick={() => setShowCreate((prev) => !prev)}>
              {showCreate ? 'Close' : 'New Project'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {showCreate ? (
          <form onSubmit={handleCreate} className="card mb-6 grid gap-4 p-4 lg:grid-cols-2">
            <div>
              <label className="text-sm text-slate-300">Project name</label>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                placeholder="Implementation ACME Website"
              />
            </div>

            <div>
              <label className="text-sm text-slate-300">Client</label>
              <select
                required
                value={form.clientId}
                onChange={(event) => setForm((prev) => ({ ...prev, clientId: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {getClientDisplayName(client)}
                    {client.company ? ` · ${client.company}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-300">Linked won deal (optional)</label>
              <select
                value={form.dealId}
                onChange={(event) => {
                  const nextDealId = event.target.value;
                  const selectedDeal = wonDeals.find((deal) => deal.id === nextDealId);
                  setForm((prev) => ({
                    ...prev,
                    dealId: nextDealId,
                    name: prev.name || selectedDeal?.title || prev.name,
                    clientId: prev.clientId || selectedDeal?.clientId || prev.clientId,
                  }));
                }}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              >
                <option value="">No deal</option>
                {wonDeals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-slate-300">Status</label>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      status: event.target.value as ProjectStatusOption,
                    }))
                  }
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-300">Priority</label>
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      priority: event.target.value as ProjectPriorityOption,
                    }))
                  }
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                >
                  {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-300">Due date</label>
                <input
                  type="date"
                  value={form.dueDate || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <label className="text-sm text-slate-300">Description</label>
              <textarea
                rows={3}
                value={form.description || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              />
            </div>

            <div className="lg:col-span-2 flex justify-end">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </form>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['ALL', 'DRAFT', 'ACTIVE', 'WAITING_CLIENT', 'COMPLETED'] as const).map((status) => {
            const active = statusFilter === status;
            const label = status === 'ALL' ? 'All' : STATUS_LABEL[status];
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  active
                    ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {loading ? <p className="text-sm text-slate-300">Loading projects…</p> : null}

        {!loading && filteredProjects.length === 0 ? (
          <div className="card p-6 text-sm text-slate-300">
            No projects yet. Create your first project from this page or from a won deal.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              href={`/post-sales/projects/${project.id}`}
              className="card block p-4 transition hover:border-cyan-400/30 hover:bg-white/[0.08]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{project.name}</h3>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                  {STATUS_LABEL[project.status]}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-300 line-clamp-3">
                {project.description?.trim() || 'No description'}
              </p>

              <div className="mt-3 space-y-1 text-xs text-slate-400">
                <p>Client: {getClientDisplayName(project.client)}</p>
                <p>Priority: {PRIORITY_LABEL[project.priority]} · Health: {HEALTH_LABEL[project.healthStatus]}</p>
                <p>Tasks: {project._count?.tasks ?? 0}</p>
                {project.deal ? <p>Deal: {project.deal.title}</p> : null}
                <p>
                  Due: {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'No due date'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </AppShell>
    </Guard>
  );
}
