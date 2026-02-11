'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { Guard } from '../../../../components/Guard';
import { useApi, useAuth } from '../../../../contexts/AuthContext';
import { useI18n } from '../../../../contexts/I18nContext';
import { findIndustryOption, industryGroups, industryLabel, industryRecommendedMode } from '../../../../lib/industries';

type TenantSettings = {
  crmMode: 'B2B' | 'B2C';
  crmDisplayCurrency?: 'USD' | 'EUR' | 'MXN' | 'CAD';
  industry: string | null;
};
const CRM_DISPLAY_CURRENCIES = ['USD', 'EUR', 'MXN', 'CAD'] as const;
type CrmDisplayCurrency = (typeof CRM_DISPLAY_CURRENCIES)[number];

export default function AdminCrmParametersPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t, language } = useI18n();
  const INDUSTRY_GROUPS = industryGroups();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crmMode, setCrmMode] = useState<TenantSettings['crmMode']>('B2B');
  const [crmDisplayCurrency, setCrmDisplayCurrency] = useState<CrmDisplayCurrency>('USD');
  const [crmModeLocked, setCrmModeLocked] = useState(false);
  const [industryId, setIndustryId] = useState('');
  const [industryOther, setIndustryOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api<{ settings: TenantSettings }>('/tenant/settings', { method: 'GET' })
      .then((data) => {
        setCrmMode(data.settings?.crmMode === 'B2C' ? 'B2C' : 'B2B');
        const rawCurrency = String(data.settings?.crmDisplayCurrency || 'USD').toUpperCase();
        setCrmDisplayCurrency(
          CRM_DISPLAY_CURRENCIES.includes(rawCurrency as CrmDisplayCurrency)
            ? (rawCurrency as CrmDisplayCurrency)
            : 'USD',
        );
        setCrmModeLocked(false);

        const rawIndustry = (data.settings?.industry || '').trim();
        const known = findIndustryOption(rawIndustry);
        if (!rawIndustry) {
          setIndustryId('');
          setIndustryOther('');
        } else if (known) {
          setIndustryId(known.id);
          setIndustryOther('');
        } else {
          setIndustryId('OTHER');
          setIndustryOther(rawIndustry);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api, token]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);
    const computedIndustry = industryId === 'OTHER' ? industryOther.trim() : industryId;
    try {
      await api('/tenant/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          crmMode,
          crmDisplayCurrency,
          industry: computedIndustry ? computedIndustry : null,
        }),
      });
      setInfo(t('common.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('nav.admin')}</p>
          <h1 className="text-3xl font-semibold">CRM</h1>
          <p className="mt-2 text-sm text-slate-400">Configure B2B/B2C mode and default pipeline for this workspace.</p>
        </div>

        <div className="card p-6">
          {loading ? <p className="text-sm text-slate-300">{t('common.loading')}</p> : null}

          {!loading ? (
            <form className="mt-2 grid gap-4 md:grid-cols-2" onSubmit={save}>
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.crmMode')}</label>
                <select
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={crmMode}
                  onChange={(e) => {
                    setCrmMode(e.target.value as TenantSettings['crmMode']);
                    setCrmModeLocked(true);
                  }}
                >
                  <option value="B2B">{t('adminSubscriptions.crmModeB2B')}</option>
                  <option value="B2C">{t('adminSubscriptions.crmModeB2C')}</option>
                </select>
                <p className="mt-2 text-xs text-slate-500">B2C uses a dedicated pipeline (Lead → Qualified → Offer → Checkout → Won/Lost).</p>
              </div>

              <div>
                <label className="text-sm text-slate-300">{t('admin.crmDisplayCurrency')}</label>
                <select
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={crmDisplayCurrency}
                  onChange={(e) => setCrmDisplayCurrency(e.target.value as CrmDisplayCurrency)}
                >
                  {CRM_DISPLAY_CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">{t('admin.crmDisplayCurrencyHint')}</p>
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
                  />
                ) : null}
                <p className="mt-2 text-xs text-slate-500">Used for onboarding and workspace configuration.</p>
              </div>

              <div className="flex items-center gap-2 md:col-span-2 md:justify-end">
                <button type="submit" className="btn-primary text-sm" disabled={saving}>
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          ) : null}

          {info ? <p className="mt-3 text-sm text-emerald-200">{info}</p> : null}
          {error ? <div className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div> : null}
        </div>
      </AppShell>
    </Guard>
  );
}
