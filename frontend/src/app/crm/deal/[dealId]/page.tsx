'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { Guard } from '../../../../components/Guard';
import { useApi, useAuth } from '../../../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';

type Stage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  status: 'OPEN' | 'WON' | 'LOST';
  pipelineId: string;
};

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
  company?: string | null;
};

type Deal = {
  id: string;
  title: string;
  value: number;
  currency: string;
  expectedCloseDate?: string | null;
  clientId?: string | null;
  client?: Client | null;
  stageId: string;
  pipelineId: string;
  stage?: Stage | null;
  createdAt: string;
  updatedAt: string;
};

const DEAL_CURRENCIES = ['USD', 'EUR', 'MXN', 'CAD'] as const;
type DealCurrency = (typeof DEAL_CURRENCIES)[number];

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10);
  return '';
}

export default function DealPage() {
  const params = useParams<{ dealId: string }>();
  const dealId = params?.dealId;
  const { token } = useAuth();
  const api = useApi(token);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<{
    title: string;
    value: string;
    currency: DealCurrency;
    expectedCloseDate: string;
    clientId: string;
    stageId: string;
  }>({
    title: '',
    value: '',
    currency: 'USD',
    expectedCloseDate: '',
    clientId: '',
    stageId: '',
  });

  const load = useCallback(async () => {
    if (!dealId) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const dealData = await api<Deal>(`/deals/${dealId}`);
      setDeal(dealData);
      setForm({
        title: dealData.title ?? '',
        value: dealData.value === null || dealData.value === undefined ? '' : String(dealData.value),
        currency: (String(dealData.currency || 'USD').toUpperCase() as DealCurrency) || 'USD',
        expectedCloseDate: toDateInputValue(dealData.expectedCloseDate),
        clientId: dealData.clientId ?? '',
        stageId: dealData.stageId ?? '',
      });

      const [stageData, clientData] = await Promise.allSettled([
        api<Stage[]>(`/stages?pipelineId=${dealData.pipelineId}`),
        api<Client[]>('/clients'),
      ]);
      if (stageData.status === 'fulfilled') {
        setStages([...stageData.value].sort((a, b) => a.position - b.position));
      } else {
        setStages([]);
      }
      if (clientData.status === 'fulfilled') {
        setClients([...clientData.value].sort((a, b) => getClientDisplayName(a).localeCompare(getClientDisplayName(b))));
      } else {
        setClients([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load deal';
      setError(message);
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, [api, dealId]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const selectedStage = useMemo(() => {
    return stages.find((s) => s.id === form.stageId) || deal?.stage || null;
  }, [deal?.stage, form.stageId, stages]);

  const probabilityPct = Math.round(((selectedStage?.probability ?? 0) as number) * 100);

  const handleSave = useCallback(async () => {
    if (!dealId || !deal) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const nextTitle = form.title.trim();
      if (!nextTitle) throw new Error('Title is required');

      const nextValue = Number(form.value);
      if (!Number.isFinite(nextValue)) throw new Error('Amount must be a number');

      const nextCurrency = (form.currency || 'USD').toUpperCase();
      const nextClientId = form.clientId ? form.clientId : null;
      const nextExpectedCloseDate = form.expectedCloseDate ? form.expectedCloseDate : undefined;

      const stageChanged = form.stageId && form.stageId !== deal.stageId;

      const updated = await api<Deal>(`/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: nextTitle,
          value: nextValue,
          currency: nextCurrency,
          expectedCloseDate: nextExpectedCloseDate,
          clientId: nextClientId,
        }),
      });

      if (stageChanged) {
        await api(`/deals/${dealId}/move-stage`, {
          method: 'POST',
          body: JSON.stringify({ stageId: form.stageId }),
        });
      }

      const refreshed = stageChanged ? await api<Deal>(`/deals/${dealId}`) : updated;
      setDeal(refreshed);
      setForm((prev) => ({
        ...prev,
        stageId: refreshed.stageId,
      }));
      setSuccess('Saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save deal';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [api, deal, dealId, form.clientId, form.currency, form.expectedCloseDate, form.stageId, form.title, form.value]);

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">CRM</p>
          <h1 className="text-3xl font-semibold">{deal?.title || 'Deal'}</h1>
          {deal ? (
            <p className="mt-2 text-sm text-slate-400">
              Stage: <span className="text-slate-200">{selectedStage?.name || deal.stageId}</span> · Probability:{' '}
              <span className="text-slate-200">{probabilityPct}%</span>
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            {deal ? (
              <Link href={`/crm?pipelineId=${encodeURIComponent(deal.pipelineId)}`} className="btn-secondary text-sm">
                Back to board
              </Link>
            ) : (
              <Link href="/crm" className="btn-secondary text-sm">
                Back to board
              </Link>
            )}
            <button className="btn-secondary text-sm" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {loading && <p className="text-slate-300">Loading deal…</p>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}
        {success && <div className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-200">{success}</div>}

        {!loading && deal && (
          <div className="space-y-6">
            <div className="card p-5">
              <p className="text-sm text-slate-400">Deal details</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Title
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </label>

                <label className="block text-sm text-slate-300">
                  Stage
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.stageId}
                    onChange={(e) => setForm((prev) => ({ ...prev, stageId: e.target.value }))}
                  >
                    {stages.length === 0 ? <option value={deal.stageId}>Current stage</option> : null}
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.status} · {Math.round((s.probability ?? 0) * 100)}%
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-300">
                  Client
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.clientId}
                    onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}
                  >
                    <option value="">No client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getClientDisplayName(c)}
                        {c.company ? ` · ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-300">
                  Probability
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                    value={`${probabilityPct}%`}
                    readOnly
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Probability comes from the stage settings.</p>
                </label>

                <label className="block text-sm text-slate-300">
                  Amount
                  <input
                    type="number"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.value}
                    onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
                  />
                </label>

                <label className="block text-sm text-slate-300">
                  Currency
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.currency}
                    onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value as DealCurrency }))}
                  >
                    {DEAL_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-300">
                  Closing date
                  <input
                    type="date"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.expectedCloseDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, expectedCloseDate: e.target.value }))}
                  />
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button className="btn-secondary" onClick={load} disabled={saving}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </Guard>
  );
}
