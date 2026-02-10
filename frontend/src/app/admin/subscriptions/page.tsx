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
      contactFirstName?: string | null;
      contactLastName?: string | null;
      contactEmail?: string | null;
      status: 'ACTIVE' | 'PAUSED' | 'CANCELED';
      createdAt: string;
      updatedAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [crmMode, setCrmMode] = useState<'B2B' | 'B2C'>('B2B');
  const [crmModeLocked, setCrmModeLocked] = useState(false);
  const [industry, setIndustry] = useState('');
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
    (opts: { tenantId: string; tenantName: string; contactName?: string; contactEmail?: string }) => {
      if (!origin) return '';
      const params = new URLSearchParams({
        tenantId: opts.tenantId,
        tenantName: opts.tenantName,
      });
      if (opts.contactName) params.set('name', opts.contactName);
      if (opts.contactEmail) params.set('email', opts.contactEmail);
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
        body: JSON.stringify({
          customerName: name,
          contactFirstName: contactFirstName.trim() ? contactFirstName.trim() : null,
          contactLastName: contactLastName.trim() ? contactLastName.trim() : null,
          contactEmail: contactEmail.trim() ? contactEmail.trim() : null,
          crmMode,
          industry: industry.trim() ? industry.trim() : null,
        }),
      });
      setItems((prev) => [created, ...prev]);
      setCustomerName('');
      setContactFirstName('');
      setContactLastName('');
      setContactEmail('');
      setIndustry('');
      setCrmMode('B2B');
      setCrmModeLocked(false);

      const contactName = [created.contactFirstName, created.contactLastName].filter(Boolean).join(' ').trim();
      const url = buildInviteUrl({
        tenantId: created.customerTenantId,
        tenantName: created.customerName,
        contactName: contactName || undefined,
        contactEmail: created.contactEmail || undefined,
      });
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
    const contactName = [sub.contactFirstName, sub.contactLastName].filter(Boolean).join(' ').trim();
    const url = buildInviteUrl({
      tenantId: sub.customerTenantId,
      tenantName: sub.customerName,
      contactName: contactName || undefined,
      contactEmail: sub.contactEmail || undefined,
    });
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
        inviteUrl: buildInviteUrl({
          tenantId: sub.customerTenantId,
          tenantName: sub.customerName,
          contactName: [sub.contactFirstName, sub.contactLastName].filter(Boolean).join(' ').trim() || undefined,
          contactEmail: sub.contactEmail || undefined,
        }),
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

          <form className="mt-4 space-y-4" onSubmit={create}>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className="text-sm text-slate-300">{t('adminSubscriptions.customerName')}</label>
                <input
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t('adminSubscriptions.customerNamePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.contactFirstName')}</label>
                <input
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={contactFirstName}
                  onChange={(e) => setContactFirstName(e.target.value)}
                  placeholder={t('adminSubscriptions.contactFirstNamePlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.contactLastName')}</label>
                <input
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={contactLastName}
                  onChange={(e) => setContactLastName(e.target.value)}
                  placeholder={t('adminSubscriptions.contactLastNamePlaceholder')}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-slate-300">{t('adminSubscriptions.contactEmail')}</label>
                <input
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={t('adminSubscriptions.contactEmailPlaceholder')}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.crmMode')}</label>
                <select
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={crmMode}
                  onChange={(e) => {
                    setCrmMode(e.target.value as 'B2B' | 'B2C');
                    setCrmModeLocked(true);
                  }}
                >
                  <option value="B2B">{t('adminSubscriptions.crmModeB2B')}</option>
                  <option value="B2C">{t('adminSubscriptions.crmModeB2C')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.industry')}</label>
                <input
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={industry}
                  onChange={(e) => {
                    const next = e.target.value;
                    setIndustry(next);
                    // Simple heuristic: common B2C industries default to B2C.
                    const v = next.trim().toLowerCase();
                    const looksB2c =
                      v.includes('hotel') ||
                      v.includes('hoteler') ||
                      v.includes('ecommerce') ||
                      v.includes('e-commerce') ||
                      v.includes('retail') ||
                      v.includes('restaurant') ||
                      v.includes('tourism') ||
                      v.includes('travel');
                    if (looksB2c && !crmModeLocked) setCrmMode('B2C');
                  }}
                  placeholder={t('adminSubscriptions.industryPlaceholder')}
                />
              </div>
              <button
                type="submit"
                className="btn-primary justify-center"
                disabled={creating || !customerName.trim()}
              >
                {creating ? t('adminSubscriptions.creating') : t('adminSubscriptions.createButton')}
              </button>
            </div>
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
                      <td className="py-3">
                        <p className="font-medium text-slate-100">{sub.customerName}</p>
                        {sub.contactFirstName || sub.contactLastName || sub.contactEmail ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {[sub.contactFirstName, sub.contactLastName].filter(Boolean).join(' ') || '—'}
                            {sub.contactEmail ? ` · ${sub.contactEmail}` : ''}
                          </p>
                        ) : null}
                      </td>
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
