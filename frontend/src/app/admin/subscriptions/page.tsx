'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import { useI18n } from '../../../contexts/I18nContext';
import { industryGroups, industryLabel, industryRecommendedMode } from '../../../lib/industries';

export default function AdminSubscriptionsPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t, language } = useI18n();
  const INDUSTRY_GROUPS = industryGroups();

  const [origin, setOrigin] = useState('');
  const [items, setItems] = useState<
    Array<{
      id: string;
      customerName: string;
      customerTenantId: string;
      contactFirstName?: string | null;
      contactLastName?: string | null;
      contactEmail?: string | null;
      plan?: string | null;
      seats?: number | null;
      trialEndsAt?: string | null;
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
  const [industryId, setIndustryId] = useState('');
  const [industryOther, setIndustryOther] = useState('');
  const [plan, setPlan] = useState<
    'TRIAL' | 'PULSE_BASIC' | 'PULSE_STANDARD' | 'PULSE_ADVANCED' | 'PULSE_ADVANCED_PLUS' | 'PULSE_TEAM'
  >('TRIAL');
  const [teamSeats, setTeamSeats] = useState(20);
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
    const first = contactFirstName.trim();
    const last = contactLastName.trim();
    const email = contactEmail.trim();
    const industryValue = industryId === 'OTHER' ? industryOther.trim() : industryId;
    if (!name || !first || !last || !email || !industryValue) return;

    setCreating(true);
    try {
      const created = await api<(typeof items)[number]>('/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customerName: name,
          contactFirstName: first,
          contactLastName: last,
          contactEmail: email,
          crmMode,
          industry: industryValue,
          plan,
          seats: plan === 'PULSE_TEAM' ? teamSeats : undefined,
        }),
      });
      setItems((prev) => [created, ...prev]);
      setCustomerName('');
      setContactFirstName('');
      setContactLastName('');
      setContactEmail('');
      setIndustryId('');
      setIndustryOther('');
      setCrmMode('B2B');
      setCrmModeLocked(false);
      setPlan('TRIAL');
      setTeamSeats(20);

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
                  required
                />
              </div>
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.contactLastName')}</label>
                <input
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={contactLastName}
                  onChange={(e) => setContactLastName(e.target.value)}
                  placeholder={t('adminSubscriptions.contactLastNamePlaceholder')}
                  required
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
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.4fr_220px_1fr_auto] lg:items-end">
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.plan')}</label>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <select
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                    value={plan}
                    onChange={(e) =>
                      setPlan(
                        e.target.value as typeof plan,
                      )
                    }
                  >
                    <option value="TRIAL">{t('adminSubscriptions.planTrial')}</option>
                    <option value="PULSE_BASIC">{t('adminSubscriptions.planBasic')}</option>
                    <option value="PULSE_STANDARD">{t('adminSubscriptions.planStandard')}</option>
                    <option value="PULSE_ADVANCED">{t('adminSubscriptions.planAdvanced')}</option>
                    <option value="PULSE_ADVANCED_PLUS">{t('adminSubscriptions.planAdvancedPlus')}</option>
                    <option value="PULSE_TEAM">{t('adminSubscriptions.planTeam')}</option>
                  </select>

                  {plan === 'PULSE_TEAM' ? (
                    <select
                      className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                      value={teamSeats}
                      onChange={(e) => setTeamSeats(Number(e.target.value))}
                      aria-label={t('adminSubscriptions.seats')}
                    >
                      {Array.from({ length: 20 }, (_, i) => 11 + i).map((n) => (
                        <option key={n} value={n}>
                          {n} {t('adminSubscriptions.users')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                </div>
              </div>
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
                <select
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={industryId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setIndustryId(next);
                    if (next !== 'OTHER') setIndustryOther('');
                    const recommended = industryRecommendedMode(next);
                    if (recommended && !crmModeLocked) setCrmMode(recommended);
                  }}
                  required
                >
                  <option value="">{t('adminSubscriptions.industryPlaceholder')}</option>
                  <optgroup label="B2C">
                    {INDUSTRY_GROUPS.b2c.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {industryLabel(opt, language)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="B2B">
                    {INDUSTRY_GROUPS.b2b.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {industryLabel(opt, language)}
                      </option>
                    ))}
                  </optgroup>
                  {INDUSTRY_GROUPS.other.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {industryLabel(opt, language)}
                    </option>
                  ))}
                </select>
                {industryId === 'OTHER' ? (
                  <input
                    className="mt-2 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                    value={industryOther}
                    onChange={(e) => setIndustryOther(e.target.value)}
                    placeholder={t('adminSubscriptions.industryPlaceholder')}
                    required
                  />
                ) : null}
              </div>
              <button
                type="submit"
                className="btn-primary justify-center"
                disabled={
                  creating ||
                  !customerName.trim() ||
                  !contactFirstName.trim() ||
                  !contactLastName.trim() ||
                  !contactEmail.trim() ||
                  !industryId ||
                  (industryId === 'OTHER' && !industryOther.trim())
                }
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
                    <th className="pb-2 text-left">{t('adminSubscriptions.table.plan')}</th>
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
                      <td className="py-3 text-slate-300">
                        <p className="text-xs text-slate-200">
                          {sub.plan === 'PULSE_BASIC'
                            ? t('adminSubscriptions.planBasic')
                            : sub.plan === 'PULSE_STANDARD'
                              ? t('adminSubscriptions.planStandard')
                              : sub.plan === 'PULSE_ADVANCED'
                                ? t('adminSubscriptions.planAdvanced')
                                : sub.plan === 'PULSE_ADVANCED_PLUS'
                                  ? t('adminSubscriptions.planAdvancedPlus')
                                  : sub.plan === 'PULSE_TEAM'
                                    ? t('adminSubscriptions.planTeam')
                                    : t('adminSubscriptions.planTrial')}
                          {sub.plan === 'PULSE_TEAM' && sub.seats ? ` · ${sub.seats} ${t('adminSubscriptions.users')}` : ''}
                        </p>
                        {sub.plan === 'TRIAL' && sub.trialEndsAt ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {t('adminSubscriptions.trialUntil', {
                              date: new Date(sub.trialEndsAt).toLocaleDateString(),
                            })}
                          </p>
                        ) : null}
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
