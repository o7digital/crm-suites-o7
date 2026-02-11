'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

type PendingInvite = {
  id: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  token: string;
  status: 'PENDING';
  createdAt: string;
  updatedAt: string;
};

export default function AdminUsersPage() {
  const { token, user: currentUser } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER'>('ADMIN');
  const [savingInvite, setSavingInvite] = useState(false);

  const buildInviteLink = useCallback(
    (invite: { token: string; email: string; name: string | null }) => {
      if (!currentUser?.tenantId || typeof window === 'undefined') return '';
      const params = new URLSearchParams({
        tenantId: currentUser.tenantId,
        tenantName: currentUser.tenantName || 'Workspace',
        email: invite.email,
        inviteToken: invite.token,
      });
      if (invite.name) params.set('name', invite.name);
      return `${window.location.origin}/register?${params.toString()}`;
    },
    [currentUser?.tenantId, currentUser?.tenantName],
  );

  const load = useCallback(() => {
    Promise.allSettled([api<User[]>('/admin/users'), api<PendingInvite[]>('/admin/user-invites')])
      .then(([usersRes, invitesRes]) => {
        if (usersRes.status === 'fulfilled') {
          setUsers(usersRes.value);
          setError(null);
        } else {
          setError(usersRes.reason instanceof Error ? usersRes.reason.message : 'Unable to load users');
        }

        if (invitesRes.status === 'fulfilled') {
          setInvites(invitesRes.value);
        } else {
          const msg = invitesRes.reason instanceof Error ? invitesRes.reason.message : '';
          if (msg) setInviteMessage(`Invites unavailable: ${msg}`);
        }
      })
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

  const copyPendingInvite = async (invite: PendingInvite) => {
    const link = buildInviteLink(invite);
    if (!link) return;
    setInviteMessage(null);
    try {
      await navigator.clipboard.writeText(link);
      setInviteMessage(`Invite ready for ${invite.email}`);
    } catch {
      setInviteMessage(t('adminUsers.invite.copyFailed'));
    }
  };

  const createInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;

    setSavingInvite(true);
    setError(null);
    try {
      const created = await api<PendingInvite>('/admin/user-invites', {
        method: 'POST',
        body: JSON.stringify({
          email,
          name: inviteName.trim() || undefined,
          role: inviteRole,
        }),
      });
      setInvites((prev) => {
        const next = prev.filter((x) => x.id !== created.id);
        return [created, ...next];
      });
      const link = buildInviteLink(created);
      if (link) {
        await navigator.clipboard.writeText(link).catch(() => undefined);
        setInviteMessage(`Invitation created for ${created.email}${link ? ' (link copied)' : ''}`);
      }
      setInviteEmail('');
      setInviteName('');
      setInviteRole('ADMIN');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create invite';
      setError(message);
    } finally {
      setSavingInvite(false);
    }
  };

  const revokeInvite = async (id: string) => {
    setError(null);
    try {
      await api(`/admin/user-invites/${id}`, { method: 'DELETE' });
      setInvites((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to revoke invite';
      setError(message);
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

  const canCreateInvite = useMemo(() => inviteEmail.trim().length > 0 && !savingInvite, [inviteEmail, savingInvite]);

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
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{t('adminUsers.invite.missingTenant')}</p>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-sm text-slate-300">Invite email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jorge@company.com"
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Name (optional)</label>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Jorge"
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Role on join</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'OWNER' | 'ADMIN' | 'MEMBER')}
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              >
                <option value="ADMIN">{t('adminUsers.roleAdmin')}</option>
                <option value="MEMBER">{t('adminUsers.roleMember')}</option>
                <option value="OWNER">{t('adminUsers.roleOwner')}</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="button" className="btn-secondary w-full justify-center" disabled={!canCreateInvite} onClick={createInvite}>
                {savingInvite ? 'Creating…' : 'Create invite'}
              </button>
            </div>
          </div>

          {inviteMessage ? <p className="mt-3 text-xs text-emerald-200">{inviteMessage}</p> : null}
        </div>

        {loading && <p className="mt-6 text-slate-300">{t('adminUsers.loading')}</p>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}

        {!loading && (
          <div className="card mt-6 p-5">
            <p className="mb-3 text-sm font-semibold text-slate-100">Pending invites</p>
            {invites.length === 0 ? (
              <p className="text-sm text-slate-400">No pending invites.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-2 text-left">Email</th>
                      <th className="pb-2 text-left">Role</th>
                      <th className="pb-2 text-left">Created</th>
                      <th className="pb-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => (
                      <tr key={inv.id} className="border-t border-white/5">
                        <td className="py-2 text-slate-200">{inv.email}</td>
                        <td className="py-2 text-slate-300">{inv.role}</td>
                        <td className="py-2 text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <button type="button" className="btn-secondary text-xs" onClick={() => void copyPendingInvite(inv)}>
                              Copy link
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10"
                              onClick={() => void revokeInvite(inv.id)}
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
