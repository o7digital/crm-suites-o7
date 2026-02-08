'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';

type Pipeline = {
  id: string;
  name: string;
  isDefault?: boolean;
};

type Stage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  status: 'OPEN' | 'WON' | 'LOST';
  pipelineId: string;
};

type Deal = {
  id: string;
  title: string;
  value: number;
  currency: string;
  stageId: string;
  pipelineId: string;
};

const DEAL_CURRENCIES = ['USD', 'EUR', 'MXN', 'CAD'] as const;
type DealCurrency = (typeof DEAL_CURRENCIES)[number];

export default function CrmPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<{ title: string; value: string; currency: DealCurrency }>({
    title: '',
    value: '',
    currency: 'USD',
  });

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<Pipeline[]>('/pipelines')
      .then((data) => {
        setPipelines(data);
        const defaultPipeline = data.find((p) => p.isDefault) || data[0];
        setPipelineId(defaultPipeline?.id || '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api, token]);

  useEffect(() => {
    if (!token || !pipelineId) return;
    setLoading(true);
    Promise.all([
      api<Stage[]>(`/stages?pipelineId=${pipelineId}`),
      api<Deal[]>(`/deals?pipelineId=${pipelineId}`),
    ])
      .then(([stageData, dealData]) => {
        setStages(stageData);
        setDeals(dealData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api, pipelineId, token]);

  const sortedStages = useMemo(() => {
    return [...stages].sort((a, b) => a.position - b.position);
  }, [stages]);

  const defaultStageId = useMemo(() => {
    const openStage = sortedStages.find((stage) => stage.status === 'OPEN');
    return openStage?.id || sortedStages[0]?.id || '';
  }, [sortedStages]);

  const handleCreateDeal = async () => {
    if (!form.title || !form.value || !pipelineId) return;
    setError(null);
    const payload = {
      title: form.title,
      value: Number(form.value),
      currency: form.currency,
      pipelineId,
      stageId: defaultStageId,
    };
    try {
      const created = await api<Deal>('/deals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDeals((prev) => [created, ...prev]);
      setShowModal(false);
      setForm({ title: '', value: '', currency: 'USD' });
    } catch (err: any) {
      setError(err.message || 'Unable to create deal');
    }
  };

  const handleMoveDeal = async (dealId: string, stageId: string) => {
    try {
      await api(`/deals/${dealId}/move-stage`, {
        method: 'POST',
        body: JSON.stringify({ stageId }),
      });
      setDeals((prev) =>
        prev.map((deal) => (deal.id === dealId ? { ...deal, stageId } : deal)),
      );
    } catch (err: any) {
      setError(err.message || 'Unable to move deal');
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">CRM</p>
            <h1 className="text-3xl font-semibold">Pipeline</h1>
          </div>
          <div className="flex gap-3">
            <select
              className="btn-secondary text-sm"
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              New deal
            </button>
          </div>
        </div>

        {loading && <p className="text-slate-300">Loading pipeline...</p>}
        {error && <p className="text-red-300">Error: {error}</p>}

        {!loading && sortedStages.length === 0 && (
          <div className="card p-6 text-slate-300">
            No stages yet. Add stages to this pipeline first.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-4">
          {sortedStages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={deals.filter((deal) => deal.stageId === stage.id)}
              onMoveDeal={handleMoveDeal}
            />
          ))}
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="card w-full max-w-md p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">New deal</h2>
                <button className="text-slate-400" onClick={() => setShowModal(false)}>
                  ✕
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-300">
                  Deal name
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
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
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleCreateDeal}>
                  Create deal
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </Guard>
  );
}

function StageColumn({
  stage,
  deals,
  onMoveDeal,
}: {
  stage: Stage;
  deals: Deal[];
  onMoveDeal: (dealId: string, stageId: string) => void;
}) {
  const totals = deals.reduce<Record<string, number>>((acc, deal) => {
    const currency = (deal.currency || 'USD').toUpperCase();
    const value = Number(deal.value);
    if (!Number.isFinite(value)) return acc;
    acc[currency] = (acc[currency] || 0) + value;
    return acc;
  }, {});

  const totalLabel = (() => {
    const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return '—';
    return entries.map(([currency, value]) => `${currency} ${value.toLocaleString()}`).join(' | ');
  })();

  return (
    <div
      className="card p-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const dealId = event.dataTransfer.getData('text/plain');
        if (dealId) {
          onMoveDeal(dealId, stage.id);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{stage.status}</p>
          <h3 className="text-lg font-semibold">{stage.name}</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Deals</p>
          <p className="text-sm font-semibold">{deals.length}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">Total: {totalLabel}</p>
      <div className="mt-4 space-y-3">
        {deals.map((deal) => (
          <div
            key={deal.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/plain', deal.id)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm"
          >
            <p className="font-semibold">{deal.title}</p>
            <p className="text-xs text-slate-400">
              {deal.currency} {Number(deal.value).toLocaleString()}
            </p>
          </div>
        ))}
        {deals.length === 0 && <p className="text-xs text-slate-500">No deals</p>}
      </div>
    </div>
  );
}
