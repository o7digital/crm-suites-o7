'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
};

const ROLE_LABEL: Record<User['role'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

export default function AdminUsersPage() {
  const { token, user: currentUser } = useAuth();
  const api = useApi(token);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    api<User[]>('/admin/users')
      .then(setUsers)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const updateRole = async (id: string, role: User['role']) => {
    setError(null);
    try {
      const updated = await api<User>(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update role';
      setError(message);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Users</h1>
        </div>

        {loading && <p className="text-slate-300">Loading users…</p>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}

        {!loading && (
          <div className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 text-left">Name</th>
                    <th className="pb-2 text-left">Email</th>
                    <th className="pb-2 text-left">Role</th>
                    <th className="pb-2 text-left">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-white/5">
                      <td className="py-2 font-medium">{u.name || '—'}</td>
                      <td className="py-2 text-slate-300">{u.email}</td>
                      <td className="py-2">
                        <select
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value as User['role'])}
                          className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                          disabled={!currentUser || currentUser.id === u.id}
                          title={currentUser?.id === u.id ? 'You cannot change your own role here.' : undefined}
                        >
                          <option value="OWNER">{ROLE_LABEL.OWNER}</option>
                          <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                          <option value="MEMBER">{ROLE_LABEL.MEMBER}</option>
                        </select>
                        {currentUser?.id === u.id ? (
                          <p className="mt-1 text-xs text-slate-500">Your role is managed by the workspace.</p>
                        ) : null}
                      </td>
                      <td className="py-2 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 ? <p className="mt-4 text-sm text-slate-400">No users found.</p> : null}
          </div>
        )}
      </AppShell>
    </Guard>
  );
}

