'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import { useI18n } from '../../../contexts/I18nContext';

export default function AdminSubscriptionsPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();

  const [origin, setOrigin] = useState('');
  const [items, setItems] = useState<
    Array<{
      id: string;
      customerName: string;
      customerTenantId: string;
      status: 'ACTIVE' | 'PAUSED' | 'CANCELED';
      createdAt: string;
      updatedAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api<typeof items>('/admin/subscriptions')
      .then((data) => {
        setItems(data);
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
    if (typeof window === 'undefined') return;
    setOrigin(window.location.origin);
  }, []);

  const buildInviteUrl = useCallback(
    (tenantId: string, tenantName: string) => {
      if (!origin) return '';
      const params = new URLSearchParams({
        tenantId,
        tenantName,
      });
      return `${origin}/register?${params.toString()}`;
    },
    [origin],
  );

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setInfo(null);
    setError(null);
    const name = customerName.trim();
    if (!name) return;

    setCreating(true);
    try {
      const created = await api<(typeof items)[number]>('/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ customerName: name }),
      });
      setItems((prev) => [created, ...prev]);
      setCustomerName('');

      const url = buildInviteUrl(created.customerTenantId, created.customerName);
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
          setInfo(t('adminSubscriptions.copied'));
        } catch {
          setInfo(t('adminSubscriptions.copyFailed'));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create subscription';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = async (sub: (typeof items)[number]) => {
    setInfo(null);
    setError(null);
    const url = buildInviteUrl(sub.customerTenantId, sub.customerName);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setInfo(t('adminSubscriptions.copied'));
    } catch {
      setInfo(t('adminSubscriptions.copyFailed'));
    }
  };

  const rows = useMemo(
    () =>
      items.map((sub) => ({
        ...sub,
        inviteUrl: buildInviteUrl(sub.customerTenantId, sub.customerName),
      })),
    [buildInviteUrl, items],
  );

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('nav.admin')}</p>
          <h1 className="text-3xl font-semibold">{t('adminSubscriptions.title')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('adminSubscriptions.subtitle')}</p>
        </div>

        <div className="card p-6">
          <p className="text-sm font-semibold text-slate-100">{t('adminSubscriptions.create.title')}</p>
          <p className="mt-1 text-sm text-slate-400">{t('adminSubscriptions.create.subtitle')}</p>

          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={create}>
            <div className="flex-1">
              <label className="text-sm text-slate-300">{t('adminSubscriptions.customerName')}</label>
              <input
                className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('adminSubscriptions.customerNamePlaceholder')}
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary justify-center"
              disabled={creating || !customerName.trim()}
            >
              {creating ? t('adminSubscriptions.creating') : t('adminSubscriptions.createButton')}
            </button>
          </form>

          {info ? <p className="mt-3 text-sm text-emerald-200">{info}</p> : null}
          {error ? <div className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div> : null}
        </div>

        {loading ? <p className="mt-6 text-slate-300">{t('adminSubscriptions.loading')}</p> : null}

        {!loading ? (
          <div className="card mt-6 p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 text-left">{t('adminSubscriptions.table.customer')}</th>
                    <th className="pb-2 text-left">{t('adminSubscriptions.table.status')}</th>
                    <th className="pb-2 text-left">{t('adminSubscriptions.table.link')}</th>
                    <th className="pb-2 text-left">{t('adminSubscriptions.table.created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((sub) => (
                    <tr key={sub.id} className="border-t border-white/5 align-top">
                      <td className="py-3 font-medium text-slate-100">{sub.customerName}</td>
                      <td className="py-3 text-slate-300">
                        <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-200 ring-1 ring-white/10">
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50"
                          onClick={() => copyInvite(sub)}
                          disabled={!sub.inviteUrl}
                        >
                          {t('adminSubscriptions.copyLink')}
                        </button>
                        <p className="mt-2 break-all font-mono text-xs text-slate-300">{sub.inviteUrl || '—'}</p>
                      </td>
                      <td className="py-3 text-slate-400">{new Date(sub.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {items.length === 0 ? <p className="mt-4 text-sm text-slate-400">{t('adminSubscriptions.empty')}</p> : null}
          </div>
        ) : null}
      </AppShell>
    </Guard>
  );
}
