'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import { useI18n } from '../../../contexts/I18nContext';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
};

export default function AdminUsersPage() {
  const { token, user: currentUser } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    api<User[]>('/admin/users')
      .then((data) => {
        setUsers(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  useEffect(() => {
    if (!currentUser?.tenantId) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams({
      tenantId: currentUser.tenantId,
      tenantName: currentUser.tenantName || 'Workspace',
    });
    setInviteUrl(`${window.location.origin}/register?${params.toString()}`);
  }, [currentUser?.tenantId, currentUser?.tenantName]);

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    setInviteMessage(null);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteMessage(t('adminUsers.invite.copied'));
    } catch {
      setInviteMessage(t('adminUsers.invite.copyFailed'));
    }
  };

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
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('nav.admin')}</p>
          <h1 className="text-3xl font-semibold">{t('adminUsers.title')}</h1>
        </div>

        <div className="card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-100">{t('adminUsers.invite.title')}</p>
              <p className="mt-1 text-sm text-slate-400">{t('adminUsers.invite.subtitle')}</p>
              <p className="mt-2 text-xs text-slate-500">{t('adminUsers.invite.rolesHint')}</p>
            </div>
            <button type="button" className="btn-primary" onClick={copyInviteLink} disabled={!inviteUrl}>
              {t('adminUsers.invite.copyButton')}
            </button>
          </div>

          {inviteUrl ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs text-slate-400">{t('adminUsers.invite.linkLabel')}</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-200">{inviteUrl}</p>
              {inviteMessage ? <p className="mt-2 text-xs text-emerald-200">{inviteMessage}</p> : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{t('adminUsers.invite.missingTenant')}</p>
          )}
        </div>

        {loading && <p className="mt-6 text-slate-300">{t('adminUsers.loading')}</p>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}

        {!loading && (
          <div className="card mt-6 p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 text-left">{t('field.name')}</th>
                    <th className="pb-2 text-left">{t('field.email')}</th>
                    <th className="pb-2 text-left">{t('adminUsers.role')}</th>
                    <th className="pb-2 text-left">{t('adminUsers.created')}</th>
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
                          <option value="OWNER">{t('adminUsers.roleOwner')}</option>
                          <option value="ADMIN">{t('adminUsers.roleAdmin')}</option>
                          <option value="MEMBER">{t('adminUsers.roleMember')}</option>
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
            {users.length === 0 ? <p className="mt-4 text-sm text-slate-400">{t('adminUsers.empty')}</p> : null}
          </div>
        )}
      </AppShell>
    </Guard>
  );
}
