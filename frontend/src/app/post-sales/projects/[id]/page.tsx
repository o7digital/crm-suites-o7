'use client';

import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '../../../../components/AppShell';
import { Guard } from '../../../../components/Guard';
import { useApi, useAuth } from '../../../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';
import { useEffect } from 'react';

type Section = {
  id: string;
  name: string;
  position: number;
};

type Project = {
  id: string;
  name: string;
  description?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'WAITING_CLIENT' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  healthStatus: 'HEALTHY' | 'RISK' | 'CRITICAL';
  startDate?: string | null;
  dueDate?: string | null;
  createdAt: string;
  client: {
    id: string;
    firstName?: string | null;
    name: string;
    company?: string | null;
    email?: string | null;
  };
  deal?: { id: string; title: string; value: number | string; currency: string } | null;
  owner?: { id: string; name: string; email?: string | null } | null;
  sections: Section[];
  _count?: { tasks: number };
};

type Task = {
  id: string;
  projectId: string;
  sectionId?: string | null;
  clientId?: string | null;
  title: string;
  description?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'WAITING_CLIENT' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assigneeUserId?: string | null;
  dueDate?: string | null;
  estimatedHours?: string | number | null;
  spentHours?: string | number | null;
  position: number;
  section?: Section | null;
  assignee?: { id: string; name: string; email?: string | null } | null;
  client?: { id: string; firstName?: string | null; name: string; company?: string | null } | null;
  _count?: { comments: number; children: number };
};

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
  company?: string | null;
};

type UserOption = {
  id: string;
  name: string;
  email?: string;
};

type Tab = 'overview' | 'board' | 'tasks' | 'calendar';

type BoardColumn = {
  key: Task['status'];
  label: string;
  section: Section | null;
};

const TAB_ITEMS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'board', label: 'Board' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'calendar', label: 'Calendar' },
];

const STATUS_LABEL: Record<Task['status'], string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  WAITING_CLIENT: 'Waiting Client',
  DONE: 'Done',
};

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

const PROJECT_STATUS_LABEL: Record<Project['status'], string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  WAITING_CLIENT: 'Waiting Client',
  COMPLETED: 'Completed',
};

const PROJECT_HEALTH_LABEL: Record<Project['healthStatus'], string> = {
  HEALTHY: 'Healthy',
  RISK: 'Risk',
  CRITICAL: 'Critical',
};

function normalize(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function formatDateLabel(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function findSectionByStatus(status: Task['status'], sections: Section[]) {
  if (status === 'TODO') {
    return sections.find((section) => {
      const name = normalize(section.name);
      return name === 'to do' || name === 'todo';
    });
  }
  if (status === 'IN_PROGRESS') {
    return sections.find((section) => normalize(section.name).includes('progress'));
  }
  if (status === 'WAITING_CLIENT') {
    return sections.find((section) => normalize(section.name).includes('waiting'));
  }
  if (status === 'DONE') {
    return sections.find((section) => normalize(section.name) === 'done');
  }
  return undefined;
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function PostSalesProjectDetailPage() {
  const { token, user } = useAuth();
  const api = useApi(token);
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [quickInputByStatus, setQuickInputByStatus] = useState<Record<Task['status'], string>>({
    TODO: '',
    IN_PROGRESS: '',
    WAITING_CLIENT: '',
    DONE: '',
  });
  const [addingQuickTaskStatus, setAddingQuickTaskStatus] = useState<Task['status'] | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [commentByTaskId, setCommentByTaskId] = useState<Record<string, string>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [projectData, tasksData, clientsData] = await Promise.all([
        api<Project>(`/post-sales/projects/${projectId}`),
        api<Task[]>(`/post-sales/projects/${projectId}/tasks`),
        api<Client[]>('/clients'),
      ]);

      let usersData: UserOption[] = [];
      try {
        usersData = await api<UserOption[]>('/admin/users');
      } catch {
        usersData = user ? [{ id: user.id, name: user.name, email: user.email }] : [];
      }

      setProject(projectData);
      setTasks(tasksData);
      setClients(clientsData);
      setUsers(usersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load project details');
    } finally {
      setLoading(false);
    }
  }, [api, projectId, user]);

  useEffect(() => {
    if (!token || !projectId) return;
    void loadData();
  }, [loadData, projectId, token]);

  const boardColumns = useMemo<BoardColumn[]>(() => {
    const sections = project?.sections || [];
    return [
      {
        key: 'TODO',
        label: 'To Do',
        section: findSectionByStatus('TODO', sections) || sections[0] || null,
      },
      {
        key: 'IN_PROGRESS',
        label: 'In Progress',
        section: findSectionByStatus('IN_PROGRESS', sections) || sections[1] || null,
      },
      {
        key: 'WAITING_CLIENT',
        label: 'Waiting Client',
        section: findSectionByStatus('WAITING_CLIENT', sections) || sections[2] || null,
      },
      {
        key: 'DONE',
        label: 'Done',
        section: findSectionByStatus('DONE', sections) || sections[3] || null,
      },
    ];
  }, [project?.sections]);

  const tasksByStatus = useMemo(() => {
    return {
      TODO: tasks.filter((task) => task.status === 'TODO').sort((a, b) => a.position - b.position),
      IN_PROGRESS: tasks.filter((task) => task.status === 'IN_PROGRESS').sort((a, b) => a.position - b.position),
      WAITING_CLIENT: tasks
        .filter((task) => task.status === 'WAITING_CLIENT')
        .sort((a, b) => a.position - b.position),
      DONE: tasks.filter((task) => task.status === 'DONE').sort((a, b) => a.position - b.position),
    };
  }, [tasks]);

  const [clientFilter, setClientFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Task['status']>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');

  const filteredTaskList = useMemo(() => {
    return tasks.filter((task) => {
      if (clientFilter !== 'ALL' && task.clientId !== clientFilter) return false;
      if (statusFilter !== 'ALL' && task.status !== statusFilter) return false;
      if (assigneeFilter !== 'ALL' && (task.assigneeUserId || '') !== assigneeFilter) return false;
      return true;
    });
  }, [assigneeFilter, clientFilter, statusFilter, tasks]);

  const monthTasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    const [y, m] = calendarMonth.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return map;

    for (const task of tasks) {
      if (!task.dueDate) continue;
      const due = task.dueDate.slice(0, 10);
      const dueDate = new Date(due);
      if (Number.isNaN(dueDate.getTime())) continue;
      const month = dueDate.getMonth() + 1;
      const year = dueDate.getFullYear();
      if (month !== m || year !== y) continue;
      (map[due] ||= []).push(task);
    }

    for (const day of Object.keys(map)) {
      map[day] = map[day].sort((a, b) => a.title.localeCompare(b.title));
    }

    return map;
  }, [calendarMonth, tasks]);

  const createTask = useCallback(
    async (payload: {
      title: string;
      status?: Task['status'];
      sectionId?: string;
      dueDate?: string;
    }) => {
      if (!project) return;
      const created = await api<Task>('/post-sales/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          title: payload.title,
          status: payload.status,
          sectionId: payload.sectionId,
          clientId: project.client.id,
          dueDate: payload.dueDate || undefined,
          priority: 'MEDIUM',
        }),
      });
      setTasks((prev) => [...prev, created]);
    },
    [api, project],
  );

  const patchTask = useCallback(
    async (taskId: string, patch: Partial<Task>) => {
      const updated = await api<Task>(`/post-sales/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...updated } : task)));
    },
    [api],
  );

  const handleBoardDrop = useCallback(
    async (status: Task['status'], sectionId: string | null) => {
      if (!draggingTaskId) return;
      const nextPosition = tasksByStatus[status].length;
      try {
        await patchTask(draggingTaskId, {
          status,
          sectionId,
          position: nextPosition,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to move task');
      } finally {
        setDraggingTaskId(null);
      }
    },
    [draggingTaskId, patchTask, tasksByStatus],
  );

  const handleQuickCreate = useCallback(
    async (column: BoardColumn) => {
      const title = (quickInputByStatus[column.key] || '').trim();
      if (!title) return;
      setAddingQuickTaskStatus(column.key);
      setError(null);
      try {
        await createTask({
          title,
          status: column.key,
          sectionId: column.section?.id,
        });
        setQuickInputByStatus((prev) => ({ ...prev, [column.key]: '' }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to create task');
      } finally {
        setAddingQuickTaskStatus(null);
      }
    },
    [createTask, quickInputByStatus],
  );

  const handleCreateTaskFromOverview = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    const todoColumn = boardColumns.find((column) => column.key === 'TODO');
    setError(null);
    try {
      await createTask({
        title: newTaskTitle.trim(),
        status: 'TODO',
        sectionId: todoColumn?.section?.id,
        dueDate: newTaskDueDate || undefined,
      });
      setNewTaskTitle('');
      setNewTaskDueDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create task');
    }
  };

  const handleAddComment = async (taskId: string) => {
    const body = (commentByTaskId[taskId] || '').trim();
    if (!body) return;
    setError(null);
    try {
      await api(`/post-sales/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setCommentByTaskId((prev) => ({ ...prev, [taskId]: '' }));
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                _count: {
                  comments: (task._count?.comments || 0) + 1,
                  children: task._count?.children || 0,
                },
              }
            : task,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add comment');
    }
  };

  return (
    <Guard>
      <AppShell>
        {loading ? <p className="text-sm text-slate-300">Loading project…</p> : null}

        {!loading && !project ? <p className="text-sm text-slate-300">Project not found.</p> : null}

        {project ? (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Post-Sales Project</p>
                <h1 className="text-3xl font-semibold">{project.name}</h1>
                <p className="mt-2 text-sm text-slate-300">
                  Client: {getClientDisplayName(project.client)}
                  {project.deal ? ` · Deal: ${project.deal.title}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                  {PROJECT_STATUS_LABEL[project.status]}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                  {PROJECT_HEALTH_LABEL[project.healthStatus]}
                </span>
              </div>
            </div>

            {error ? (
              <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mb-6 flex flex-wrap items-center gap-2">
              {TAB_ITEMS.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'overview' ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="card p-4 lg:col-span-2">
                  <h2 className="text-lg font-semibold">Overview</h2>
                  <p className="mt-2 text-sm text-slate-300">{project.description?.trim() || 'No description'}</p>
                  <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                    <p>Priority: {project.priority}</p>
                    <p>Tasks: {project._count?.tasks ?? tasks.length}</p>
                    <p>Start: {formatDateLabel(project.startDate)}</p>
                    <p>Due: {formatDateLabel(project.dueDate)}</p>
                    <p>Owner: {project.owner?.name || 'Unassigned'}</p>
                  </div>
                </div>

                <form onSubmit={handleCreateTaskFromOverview} className="card p-4">
                  <h3 className="text-lg font-semibold">Quick Task</h3>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-sm text-slate-300">Title</label>
                      <input
                        required
                        value={newTaskTitle}
                        onChange={(event) => setNewTaskTitle(event.target.value)}
                        className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-300">Due date</label>
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(event) => setNewTaskDueDate(event.target.value)}
                        className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                      />
                    </div>
                    <button type="submit" className="btn-primary w-full">
                      Create task
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {activeTab === 'board' ? (
              <div className="grid gap-4 lg:grid-cols-4">
                {boardColumns.map((column) => (
                  <div
                    key={column.key}
                    className="card p-3"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void handleBoardDrop(column.key, column.section?.id || null)}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-100">{column.label}</h3>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                        {tasksByStatus[column.key].length}
                      </span>
                    </div>

                    <div className="mb-3 flex gap-2">
                      <input
                        value={quickInputByStatus[column.key]}
                        onChange={(event) =>
                          setQuickInputByStatus((prev) => ({ ...prev, [column.key]: event.target.value }))
                        }
                        className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        placeholder="Quick task"
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10"
                        onClick={() => void handleQuickCreate(column)}
                        disabled={addingQuickTaskStatus === column.key}
                      >
                        +
                      </button>
                    </div>

                    <div className="space-y-2">
                      {tasksByStatus[column.key].map((task) => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggingTaskId(task.id)}
                          onDragEnd={() => setDraggingTaskId(null)}
                          className="cursor-grab rounded-lg border border-white/10 bg-white/5 p-2 text-xs hover:bg-white/10"
                        >
                          <p className="font-semibold text-slate-100">{task.title}</p>
                          <p className="mt-1 text-slate-400">
                            {task.assignee?.name || 'Unassigned'} · {formatDateLabel(task.dueDate)}
                          </p>
                        </div>
                      ))}
                      {tasksByStatus[column.key].length === 0 ? (
                        <p className="text-xs text-slate-500">No tasks</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === 'tasks' ? (
              <div className="space-y-4">
                <div className="card grid gap-3 p-3 md:grid-cols-3">
                  <div>
                    <label className="text-xs text-slate-300">Client</label>
                    <select
                      value={clientFilter}
                      onChange={(event) => setClientFilter(event.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                    >
                      <option value="ALL">All clients</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {getClientDisplayName(client)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as 'ALL' | Task['status'])}
                      className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                    >
                      <option value="ALL">All status</option>
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">Assignee</label>
                    <select
                      value={assigneeFilter}
                      onChange={(event) => setAssigneeFilter(event.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                    >
                      <option value="ALL">All assignees</option>
                      {users.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredTaskList.map((task) => (
                    <div key={task.id} className="card grid gap-2 p-3 md:grid-cols-12 md:items-center">
                      <div className="md:col-span-3">
                        <p className="text-sm font-semibold">{task.title}</p>
                        <p className="text-xs text-slate-400">{task.client ? getClientDisplayName(task.client) : 'No client'}</p>
                      </div>
                      <div className="md:col-span-2">
                        <select
                          value={task.status}
                          onChange={(event) =>
                            void patchTask(task.id, { status: event.target.value as Task['status'] })
                          }
                          className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        >
                          {Object.entries(STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <select
                          value={task.assigneeUserId || ''}
                          onChange={(event) =>
                            void patchTask(task.id, { assigneeUserId: event.target.value || null })
                          }
                          className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        >
                          <option value="">Unassigned</option>
                          {users.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <input
                          type="date"
                          value={toDateInput(task.dueDate)}
                          onChange={(event) => void patchTask(task.id, { dueDate: event.target.value })}
                          className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        />
                      </div>
                      <div className="md:col-span-1 text-xs text-slate-300">{PRIORITY_LABEL[task.priority]}</div>
                      <div className="md:col-span-2 flex items-center gap-2">
                        <input
                          value={commentByTaskId[task.id] || ''}
                          onChange={(event) =>
                            setCommentByTaskId((prev) => ({ ...prev, [task.id]: event.target.value }))
                          }
                          placeholder="Comment"
                          className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        />
                        <button
                          type="button"
                          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
                          onClick={() => void handleAddComment(task.id)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredTaskList.length === 0 ? <p className="text-sm text-slate-400">No tasks match filters.</p> : null}
                </div>
              </div>
            ) : null}

            {activeTab === 'calendar' ? (
              <div className="space-y-4">
                <div className="card p-4">
                  <label className="text-sm text-slate-300">Month</label>
                  <input
                    type="month"
                    value={calendarMonth}
                    onChange={(event) => setCalendarMonth(event.target.value)}
                    className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  />
                </div>

                <div className="card p-4">
                  <h3 className="text-lg font-semibold">Due tasks</h3>
                  <div className="mt-3 space-y-3">
                    {Object.entries(monthTasksByDate)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([day, dayTasks]) => (
                        <div key={day} className="rounded-lg border border-white/10 bg-white/5 p-3">
                          <p className="text-sm font-semibold">{new Date(day).toLocaleDateString()}</p>
                          <div className="mt-2 space-y-1">
                            {dayTasks.map((task) => (
                              <p key={task.id} className="text-sm text-slate-200">
                                {task.title} · {STATUS_LABEL[task.status]} · {task.assignee?.name || 'Unassigned'}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    {Object.keys(monthTasksByDate).length === 0 ? (
                      <p className="text-sm text-slate-400">No due tasks for this month.</p>
                    ) : null}
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
