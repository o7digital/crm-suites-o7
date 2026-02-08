'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';

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

type Client = {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
};

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price?: string | number | null;
  currency: string;
  isActive: boolean;
};

type DealItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice?: string | number | null;
  product?: Product;
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
  items?: DealItem[];
};

const DEAL_CURRENCIES = ['USD', 'EUR', 'MXN', 'CAD'] as const;
type DealCurrency = (typeof DEAL_CURRENCIES)[number];

export default function CrmPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [requestedStageId, setRequestedStageId] = useState<string | null>(null);
  const [highlightStageId, setHighlightStageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    value: string;
    currency: DealCurrency;
    expectedCloseDate: string;
    clientId: string;
    productIds: string[];
  }>({
    title: '',
    value: '',
    currency: 'USD',
    expectedCloseDate: '',
    clientId: '',
    productIds: [],
  });

  useEffect(() => {
    if (!token) return;
    api<Product[]>('/products')
      .then((data) => setProducts(data))
      .catch(() => {
        // Products are optional for CRM; ignore failures here.
      });
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    setClientsError(null);
    api<Client[]>('/clients')
      .then((data) => {
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        setClients(sorted);
      })
      .catch((err: Error) => setClientsError(err.message));
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<Pipeline[]>('/pipelines')
      .then((data) => {
        setPipelines(data);
        let requested: string | null = null;
        let requestedStage: string | null = null;
        if (typeof window !== 'undefined') {
          try {
            const params = new URLSearchParams(window.location.search);
            requested = params.get('pipelineId');
            requestedStage = params.get('stageId');
          } catch {
            // ignore malformed URL
          }
        }
        setRequestedStageId(requestedStage || null);
        const match = requested ? data.find((p) => p.id === requested) : null;
        const defaultPipeline = match || data.find((p) => p.isDefault) || data[0];
        setPipelineId(defaultPipeline?.id || '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api, token]);

  useEffect(() => {
    if (!token || !pipelineId) return;
    let active = true;
    setError(null);
    setLoading(true);
    Promise.allSettled([
      api<Stage[]>(`/stages?pipelineId=${pipelineId}`),
      api<Deal[]>(`/deals?pipelineId=${pipelineId}`),
    ])
      .then(([stagesResult, dealsResult]) => {
        if (!active) return;

        if (stagesResult.status === 'fulfilled') {
          setStages(stagesResult.value);
        } else {
          setStages([]);
        }

        if (dealsResult.status === 'fulfilled') {
          setDeals(dealsResult.value);
        } else {
          setDeals([]);
        }

        if (stagesResult.status === 'rejected' || dealsResult.status === 'rejected') {
          const stageMessage =
            stagesResult.status === 'rejected' && stagesResult.reason instanceof Error
              ? stagesResult.reason.message
              : null;
          const dealMessage =
            dealsResult.status === 'rejected' && dealsResult.reason instanceof Error
              ? dealsResult.reason.message
              : null;

          setError(stageMessage || dealMessage || 'Unable to load pipeline data');
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, pipelineId, token]);

  const sortedStages = useMemo(() => {
    return [...stages].sort((a, b) => a.position - b.position);
  }, [stages]);

  useEffect(() => {
    if (!requestedStageId) return;
    if (sortedStages.length === 0) return;

    const exists = sortedStages.some((stage) => stage.id === requestedStageId);
    if (!exists) return;

    const el = document.getElementById(`stage-${requestedStageId}`);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlightStageId(requestedStageId);

    const timer = window.setTimeout(() => setHighlightStageId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [requestedStageId, sortedStages]);

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
      expectedCloseDate: form.expectedCloseDate || undefined,
      clientId: form.clientId || undefined,
      pipelineId,
      stageId: defaultStageId,
      productIds: form.productIds,
    };
    try {
      const created = await api<Deal>('/deals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDeals((prev) => [created, ...prev]);
      setShowModal(false);
      setForm({ title: '', value: '', currency: 'USD', expectedCloseDate: '', clientId: '', productIds: [] });
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
              onChange={(e) => {
                const next = e.target.value;
                setPipelineId(next);
                setRequestedStageId(null);
                setHighlightStageId(null);
                router.replace(`/crm?pipelineId=${next}`);
              }}
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
              highlighted={highlightStageId === stage.id}
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
                  Client
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.clientId}
                    onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}
                  >
                    <option value="">{clients.length ? 'Select client' : 'No clients yet'}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? ` · ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                  {clients.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Add a client first in{' '}
                      <Link href="/clients" className="text-cyan-200 hover:underline">
                        Clients
                      </Link>
                      .
                    </p>
                  ) : null}
                  {clientsError ? <p className="mt-2 text-xs text-red-200">{clientsError}</p> : null}
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
                  Closing date
                  <input
                    type="date"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.expectedCloseDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, expectedCloseDate: e.target.value }))}
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

                <div>
                  <p className="text-sm text-slate-300">Products</p>
                  <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/10 bg-white/5 p-3">
                    {products.filter((p) => p.isActive).length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No products configured yet. Go to Admin → Parameters → Products.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {products
                          .filter((p) => p.isActive)
                          .map((p) => {
                            const checked = form.productIds.includes(p.id);
                            return (
                              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-200">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-cyan-400"
                                  checked={checked}
                                  onChange={(e) => {
                                    setForm((prev) => {
                                      const next = e.target.checked
                                        ? [...prev.productIds, p.id]
                                        : prev.productIds.filter((id) => id !== p.id);
                                      return { ...prev, productIds: next };
                                    });
                                  }}
                                />
                                <span className="truncate">{p.name}</span>
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
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
  highlighted,
}: {
  stage: Stage;
  deals: Deal[];
  onMoveDeal: (dealId: string, stageId: string) => void;
  highlighted: boolean;
}) {
  const router = useRouter();
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
      id={`stage-${stage.id}`}
      className={`card p-4 ${highlighted ? 'ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/10' : ''}`}
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
        <button
          type="button"
          className="text-left"
          onClick={() => router.push(`/crm/stage/${stage.id}`)}
          title="Open stage list"
        >
          <p className="text-sm text-slate-400">{stage.status}</p>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{stage.name}</h3>
            <span className="text-xs text-slate-500">→</span>
          </div>
        </button>
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
            {deal.client?.name ? (
              <p className="mt-1 text-[11px] text-slate-400">
                Client: {deal.client.name}
                {deal.client.company ? ` · ${deal.client.company}` : ''}
              </p>
            ) : null}
            {deal.items && deal.items.length > 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">
                {(() => {
                  const names = deal.items
                    .map((it) => it.product?.name)
                    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
                  const shown = names.slice(0, 2);
                  const more = names.length - shown.length;
                  return shown.join(', ') + (more > 0 ? ` +${more}` : '');
                })()}
              </p>
            ) : null}
            {deal.expectedCloseDate ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Closing: {new Date(deal.expectedCloseDate).toLocaleDateString()}
              </p>
            ) : null}
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
