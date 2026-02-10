'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { CLIENT_FUNCTION_OPTIONS, getClientDisplayName } from '@/lib/clients';
import { formatUsdTotal, toUsd, type FxRatesSnapshot } from '@/lib/fx';
import { useI18n } from '../../contexts/I18nContext';

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
  firstName?: string | null;
  name: string;
  function?: string | null;
  companySector?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
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

type TenantSettings = {
  crmMode: 'B2B' | 'B2C';
  industry?: string | null;
};

const DEAL_CURRENCIES = ['USD', 'EUR', 'MXN', 'CAD'] as const;
type DealCurrency = (typeof DEAL_CURRENCIES)[number];

function parseContactLine(input: string): { name?: string; email?: string } {
  const raw = (input || '').trim();
  if (!raw) return {};

  // `Full Name <email@domain>` (common email header format)
  const angle = raw.match(/^\s*"?([^"<]+?)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (angle) {
    const name = angle[1]?.trim();
    const email = angle[2]?.trim();
    return { name: name || undefined, email: email || undefined };
  }

  // Fall back to extracting the first email-like token from the string.
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    return { email: emailMatch[0] };
  }

  return {};
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10);
  return '';
}

export default function CrmPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const router = useRouter();
  const { t, stageName } = useI18n();
  const lastDragAtRef = useRef<number>(0);
  const [crmMode, setCrmMode] = useState<TenantSettings['crmMode']>('B2B');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [fx, setFx] = useState<FxRatesSnapshot | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [requestedStageId, setRequestedStageId] = useState<string | null>(null);
  const [highlightStageId, setHighlightStageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [stagesByPipelineId, setStagesByPipelineId] = useState<Record<string, Stage[]>>({});
  const [modalStagesLoading, setModalStagesLoading] = useState(false);
  const [modalStagesError, setModalStagesError] = useState<string | null>(null);
  const [showClientCreate, setShowClientCreate] = useState(false);
  const [clientDraft, setClientDraft] = useState<{
    firstName: string;
    name: string;
    clientFunction: string;
    companySector: string;
    email: string;
    company: string;
    phone: string;
  }>({
    firstName: '',
    name: '',
    clientFunction: '',
    companySector: '',
    email: '',
    company: '',
    phone: '',
  });
  const [clientDraftError, setClientDraftError] = useState<string | null>(null);
  const [clientDraftSaving, setClientDraftSaving] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    value: string;
    currency: DealCurrency;
    expectedCloseDate: string;
    clientId: string;
    productIds: string[];
    pipelineId: string;
    stageId: string;
  }>({
    title: '',
    value: '',
    currency: 'USD',
    expectedCloseDate: '',
    clientId: '',
    productIds: [],
    pipelineId: '',
    stageId: '',
  });

  useEffect(() => {
    if (!showModal) {
      setShowClientCreate(false);
      setModalStagesLoading(false);
      setModalStagesError(null);
      setClientDraft({
        firstName: '',
        name: '',
        clientFunction: '',
        companySector: '',
        email: '',
        company: '',
        phone: '',
      });
      setClientDraftError(null);
      setClientDraftSaving(false);
      setEditingDeal(null);
      setForm({
        title: '',
        value: '',
        currency: 'USD',
        expectedCloseDate: '',
        clientId: '',
        productIds: [],
        pipelineId: '',
        stageId: '',
      });
    }
  }, [showModal]);

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
    let active = true;
    setFxLoading(true);
    api<FxRatesSnapshot>('/fx/usd')
      .then((data) => {
        if (!active) return;
        setFx(data);
      })
      .catch(() => {
        if (!active) return;
        setFx(null);
      })
      .finally(() => {
        if (!active) return;
        setFxLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    setClientsError(null);
    api<Client[]>('/clients')
      .then((data) => {
        const sorted = [...data].sort((a, b) =>
          getClientDisplayName(a).localeCompare(getClientDisplayName(b)),
        );
        setClients(sorted);
      })
      .catch((err: Error) => setClientsError(err.message));
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.allSettled([
      api<{ settings: TenantSettings }>('/tenant/settings', { method: 'GET' }),
      api<Pipeline[]>('/pipelines'),
    ])
      .then(([settingsResult, pipelinesResult]) => {
        const mode =
          settingsResult.status === 'fulfilled' && settingsResult.value.settings?.crmMode === 'B2C'
            ? 'B2C'
            : 'B2B';
        setCrmMode(mode);

        const data = pipelinesResult.status === 'fulfilled' ? pipelinesResult.value : [];
        if (pipelinesResult.status === 'rejected') {
          const message = pipelinesResult.reason instanceof Error ? pipelinesResult.reason.message : 'Unable to load pipelines';
          setError(message);
        }

        const filtered =
          mode === 'B2C' ? data.filter((p) => p.name !== 'New Sales') : data.filter((p) => p.name !== 'B2C');

        setPipelines(filtered);
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
        const match = requested ? filtered.find((p) => p.id === requested) : null;
        const defaultPipeline = match || filtered.find((p) => p.isDefault) || filtered[0];
        setPipelineId(defaultPipeline?.id || '');
      })
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
          setStagesByPipelineId((prev) => ({ ...prev, [pipelineId]: stagesResult.value }));
        } else {
          setStages([]);
          setStagesByPipelineId((prev) => ({ ...prev, [pipelineId]: [] }));
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

  const stageStatusById = useMemo(() => {
    const map: Record<string, Stage['status']> = {};
    for (const stage of sortedStages) map[stage.id] = stage.status;
    return map;
  }, [sortedStages]);

  const openLeadsCount = useMemo(() => {
    return deals.reduce((sum, deal) => (stageStatusById[deal.stageId] === 'OPEN' ? sum + 1 : sum), 0);
  }, [deals, stageStatusById]);

  useEffect(() => {
    if (!requestedStageId) return;
    if (sortedStages.length === 0) return;

    const exists = sortedStages.some((stage) => stage.id === requestedStageId);
    if (!exists) return;

    const el = document.getElementById(`stage-${requestedStageId}`);
    if (!el) return;

    // Horizontal scroll (kanban-style): ensure the column is visible.
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    setHighlightStageId(requestedStageId);

    const timer = window.setTimeout(() => setHighlightStageId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [requestedStageId, sortedStages]);

  const defaultStageId = useMemo(() => {
    const openStage = sortedStages.find((stage) => stage.status === 'OPEN');
    return openStage?.id || sortedStages[0]?.id || '';
  }, [sortedStages]);

  const modalPipelineId = form.pipelineId || pipelineId;

  const modalSortedStages = useMemo(() => {
    const cached = modalPipelineId ? stagesByPipelineId[modalPipelineId] : undefined;
    const fallback = modalPipelineId === pipelineId ? stages : [];
    const source = cached ?? fallback;
    return [...(source || [])].sort((a, b) => a.position - b.position);
  }, [modalPipelineId, pipelineId, stages, stagesByPipelineId]);

  const modalDefaultStageId = useMemo(() => {
    const openStage = modalSortedStages.find((stage) => stage.status === 'OPEN');
    return openStage?.id || modalSortedStages[0]?.id || '';
  }, [modalSortedStages]);

  const modalSelectedStage = useMemo(() => {
    return modalSortedStages.find((stage) => stage.id === form.stageId) || null;
  }, [form.stageId, modalSortedStages]);

  const stageProbabilityPct = Math.round(((modalSelectedStage?.probability ?? 0) as number) * 100);

  useEffect(() => {
    if (!token) return;
    if (!showModal) return;
    if (!modalPipelineId) return;

    // Fetch stages for the selected pipeline if we don't have them yet.
    if (stagesByPipelineId[modalPipelineId]) return;
    if (modalPipelineId === pipelineId && stages.length > 0) return;

    let active = true;
    setModalStagesLoading(true);
    setModalStagesError(null);
    api<Stage[]>(`/stages?pipelineId=${modalPipelineId}`)
      .then((data) => {
        if (!active) return;
        setStagesByPipelineId((prev) => ({ ...prev, [modalPipelineId]: data }));
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load stages';
        setModalStagesError(message);
        setStagesByPipelineId((prev) => ({ ...prev, [modalPipelineId]: [] }));
      })
      .finally(() => {
        if (!active) return;
        setModalStagesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, modalPipelineId, pipelineId, showModal, stages, stagesByPipelineId, token]);

  useEffect(() => {
    if (!showModal) return;
    if (!modalPipelineId) return;
    if (modalSortedStages.length === 0) return;
    const exists = modalSortedStages.some((stage) => stage.id === form.stageId);
    if (exists) return;
    setForm((prev) => ({ ...prev, stageId: modalDefaultStageId }));
  }, [form.stageId, modalDefaultStageId, modalPipelineId, modalSortedStages, showModal]);

  const openCreateModal = () => {
    setError(null);
    setEditingDeal(null);
    setForm({
      title: '',
      value: '',
      currency: 'USD',
      expectedCloseDate: '',
      clientId: '',
      productIds: [],
      pipelineId,
      stageId: defaultStageId,
    });
    setShowModal(true);
  };

  const openEditModal = (deal: Deal) => {
    setError(null);
    setEditingDeal(deal);
    setForm({
      title: deal.title ?? '',
      value: deal.value === null || deal.value === undefined ? '' : String(deal.value),
      currency: (String(deal.currency || 'USD').toUpperCase() as DealCurrency) || 'USD',
      expectedCloseDate: toDateInputValue(deal.expectedCloseDate),
      clientId: deal.clientId ?? '',
      productIds: (deal.items ?? []).map((it) => it.productId).filter(Boolean),
      pipelineId: deal.pipelineId,
      stageId: deal.stageId,
    });
    setShowModal(true);
  };

  const openDealFromCard = (deal: Deal) => {
    // Avoid opening the modal right after a drag & drop interaction.
    if (Date.now() - lastDragAtRef.current < 250) return;
    openEditModal(deal);
  };

  const handleSaveDeal = async () => {
    const targetPipelineId = form.pipelineId || pipelineId;
    if (!form.title || !form.value || !targetPipelineId) return;
    setError(null);
    try {
      const title = form.title.trim();
      const value = Number(form.value);
      if (!title) throw new Error('Deal name is required');
      if (!Number.isFinite(value)) throw new Error('Amount must be a number');

      const stageId = form.stageId || modalDefaultStageId || defaultStageId;
      if (!stageId) throw new Error('Stage is required');

      if (editingDeal) {
        const updated = await api<Deal>(`/deals/${editingDeal.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title,
            value,
            currency: form.currency,
            expectedCloseDate: form.expectedCloseDate || undefined,
            clientId: form.clientId ? form.clientId : null,
          }),
        });

        if (stageId !== editingDeal.stageId) {
          await api(`/deals/${editingDeal.id}/move-stage`, {
            method: 'POST',
            body: JSON.stringify({ stageId }),
          });
        }

        setDeals((prev) =>
          prev.map((deal) =>
            deal.id === editingDeal.id ? { ...deal, ...updated, stageId } : deal,
          ),
        );
      } else {
        const created = await api<Deal>('/deals', {
          method: 'POST',
          body: JSON.stringify({
            title,
            value,
            currency: form.currency,
            expectedCloseDate: form.expectedCloseDate || undefined,
            clientId: form.clientId || undefined,
            pipelineId: targetPipelineId,
            stageId,
            productIds: form.productIds,
          }),
        });
        if (targetPipelineId === pipelineId) {
          setDeals((prev) => [created, ...prev]);
        } else {
          // Created in a different pipeline: switch the board so the user immediately sees it.
          setPipelineId(targetPipelineId);
          setRequestedStageId(null);
          setHighlightStageId(null);
          router.replace(`/crm?pipelineId=${targetPipelineId}`);
        }
      }
      setShowModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save deal';
      setError(message);
    }
  };

  const handleDeleteDeal = async () => {
    if (!editingDeal) return;
    setError(null);
    try {
      await api(`/deals/${editingDeal.id}`, { method: 'DELETE' });
      setDeals((prev) => prev.filter((d) => d.id !== editingDeal.id));
      setShowModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete deal';
      setError(message);
    }
  };

  const handleCreateClientFromCrm = async () => {
    const name = clientDraft.name.trim();
    if (!name) {
      setClientDraftError('Name is required');
      return;
    }

    const optional = (value: string) => {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    };

    setClientDraftSaving(true);
    setClientDraftError(null);
    try {
      const created = await api<Client>('/clients', {
        method: 'POST',
        body: JSON.stringify({
          firstName: optional(clientDraft.firstName),
          name,
          function: optional(clientDraft.clientFunction),
          companySector: optional(clientDraft.companySector),
          email: optional(clientDraft.email),
          company: optional(clientDraft.company),
          phone: optional(clientDraft.phone),
        }),
      });

      setClients((prev) => {
        const next = [...prev, created].sort((a, b) =>
          getClientDisplayName(a).localeCompare(getClientDisplayName(b)),
        );
        return next;
      });
      setForm((prev) => ({ ...prev, clientId: created.id }));
      setShowClientCreate(false);
      setClientDraft({
        firstName: '',
        name: '',
        clientFunction: '',
        companySector: '',
        email: '',
        company: '',
        phone: '',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save client';
      setClientDraftError(message);
    } finally {
      setClientDraftSaving(false);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to move deal';
      setError(message);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('nav.crm')}</p>
            <h1 className="text-3xl font-semibold">{t('crm.title')}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {t('crm.openLeads', { open: openLeadsCount, total: deals.length })}
            </p>
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
            <button className="btn-primary" onClick={openCreateModal}>
              {t('crm.newDeal')}
            </button>
          </div>
        </div>

        {loading && <p className="text-slate-300">{t('crm.loading')}</p>}
        {error && (
          <p className="text-red-300">
            {t('common.error')}: {error}
          </p>
        )}

        {!loading && sortedStages.length === 0 && (
          <div className="card p-6 text-slate-300">
            {t('crm.noStages')}
          </div>
        )}

        {/* Keep all stages on one line (no wrap). Horizontal scroll if needed. */}
        <div className="overflow-x-auto pb-4 2xl:-ml-48 2xl:w-[calc(100%+24rem)]">
          <div className="flex w-max gap-4 pr-6">
            {sortedStages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={deals.filter((deal) => deal.stageId === stage.id)}
                fx={fx}
                fxLoading={fxLoading}
                onMoveDeal={handleMoveDeal}
                onOpenDeal={openDealFromCard}
                onDealDragStart={() => {
                  lastDragAtRef.current = Date.now();
                }}
                highlighted={highlightStageId === stage.id}
              />
            ))}
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="card w-full max-w-md p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{editingDeal ? t('crm.editDeal') : t('crm.newDeal')}</h2>
                <button className="text-slate-400" onClick={() => setShowModal(false)}>
                  ✕
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-300">
                  {t('crm.dealName')}
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  {t('tasks.client')}
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.clientId}
                    onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}
                  >
                    <option value="">{clients.length ? t('tasks.selectClient') : t('crm.noClients')}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getClientDisplayName(c)}
                        {c.company ? ` · ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                  {showClientCreate ? (
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-xs text-slate-400">{t('crm.newClient')}</p>
                      <div className="mt-2 grid gap-2">
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          placeholder={t('field.firstName')}
                          value={clientDraft.firstName}
                          onChange={(e) => setClientDraft((prev) => ({ ...prev, firstName: e.target.value }))}
                          autoComplete="given-name"
                        />
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          placeholder={t('field.name')}
                          value={clientDraft.name}
                          onChange={(e) => setClientDraft((prev) => ({ ...prev, name: e.target.value }))}
                          autoComplete="family-name"
                        />
                        <select
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          value={clientDraft.clientFunction}
                          onChange={(e) =>
                            setClientDraft((prev) => ({ ...prev, clientFunction: e.target.value }))
                          }
                        >
                          <option value="">{t('field.function')}</option>
                          {CLIENT_FUNCTION_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          placeholder={t('field.companySector')}
                          value={clientDraft.companySector}
                          onChange={(e) => setClientDraft((prev) => ({ ...prev, companySector: e.target.value }))}
                        />
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          placeholder={t('field.email')}
                          type="email"
                          value={clientDraft.email}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw.includes('<') || raw.includes('>')) {
                              const parsed = parseContactLine(raw);
                              setClientDraft((prev) => {
                                let nextFirstName = prev.firstName;
                                let nextName = prev.name;

                                if (parsed.name && !nextFirstName.trim() && !nextName.trim()) {
                                  const parts = parsed.name.split(/\s+/).filter(Boolean);
                                  if (parts.length >= 2) {
                                    nextFirstName = parts[0];
                                    nextName = parts.slice(1).join(' ');
                                  } else {
                                    nextName = parsed.name;
                                  }
                                } else if (parsed.name && !nextName.trim()) {
                                  nextName = parsed.name;
                                }

                                return {
                                  ...prev,
                                  email: parsed.email ?? raw,
                                  firstName: nextFirstName,
                                  name: nextName,
                                };
                              });
                              return;
                            }
                            setClientDraft((prev) => ({ ...prev, email: raw }));
                          }}
                        />
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          placeholder={t('field.company')}
                          value={clientDraft.company}
                          onChange={(e) => setClientDraft((prev) => ({ ...prev, company: e.target.value }))}
                          autoComplete="organization"
                        />
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          placeholder={t('field.phone')}
                          value={clientDraft.phone}
                          onChange={(e) => setClientDraft((prev) => ({ ...prev, phone: e.target.value }))}
                          autoComplete="tel"
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        {t('clients.emailTip')}{' '}
                        <span className="font-mono">
                          Name {'<'}email@domain{'>'}
                        </span>{' '}
                        {t('crm.emailTipEnd')}
                      </p>
                      {clientDraftError ? <p className="mt-2 text-xs text-red-200">{clientDraftError}</p> : null}
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setShowClientCreate(false);
                            setClientDraftError(null);
                          }}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={clientDraftSaving}
                          onClick={handleCreateClientFromCrm}
                        >
                          {clientDraftSaving ? t('common.saving') : t('clients.add')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-4 text-xs">
                      <button
                        type="button"
                        className="text-cyan-200 hover:underline"
                        onClick={() => {
                          setShowClientCreate(true);
                          setClientDraftError(null);
                        }}
                      >
                        + {t('clients.add')}
                      </button>
                      <Link href="/clients" className="text-slate-400 hover:underline">
                        {t('crm.manageClients')}
                      </Link>
                    </div>
                  )}
                  {clientsError ? <p className="mt-2 text-xs text-red-200">{clientsError}</p> : null}
                </label>
                <label className="block text-sm text-slate-300">
                  {t('crm.pipeline')}
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.pipelineId || pipelineId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setModalStagesError(null);
                      setForm((prev) => ({ ...prev, pipelineId: next, stageId: '' }));
                    }}
                    disabled={Boolean(editingDeal)}
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {modalStagesLoading ? <p className="mt-1 text-xs text-slate-500">{t('common.loading')}</p> : null}
                  {modalStagesError ? <p className="mt-1 text-xs text-red-200">{modalStagesError}</p> : null}
                </label>

                <label className="block text-sm text-slate-300">
                  {t('crm.stage')}
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.stageId}
                    onChange={(e) => setForm((prev) => ({ ...prev, stageId: e.target.value }))}
                    disabled={modalStagesLoading || modalSortedStages.length === 0}
                  >
                    <option value="">{modalSortedStages.length ? t('crm.selectStage') : t('crm.noStagesShort')}</option>
                    {modalSortedStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {stageName(s.name)} · {t(`stageStatus.${s.status}`)} · {Math.round((s.probability ?? 0) * 100)}%
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-300">
                  {t('crm.probability')}
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                    value={`${stageProbabilityPct}%`}
                    readOnly
                  />
                  <p className="mt-1 text-[11px] text-slate-500">{t('crm.probabilityHint')}</p>
                </label>

                <label className="block text-sm text-slate-300">
                  {t('field.amount')}
                  <input
                    type="number"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.value}
                    onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  {t('crm.closingDate')}
                  <input
                    type="date"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.expectedCloseDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, expectedCloseDate: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  {t('field.currency')}
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
                  <p className="text-sm text-slate-300">{t('crm.products')}</p>
                  <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/10 bg-white/5 p-3">
                    {products.filter((p) => p.isActive).length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {t('crm.noProducts')}
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
                {editingDeal ? (
                  <button className="btn-secondary" onClick={handleDeleteDeal}>
                    {t('common.delete')}
                  </button>
                ) : null}
                <button className="btn-secondary" onClick={() => setShowModal(false)}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" onClick={handleSaveDeal}>
                  {editingDeal ? t('common.save') : t('crm.createDeal')}
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
  fx,
  fxLoading,
  onMoveDeal,
  onOpenDeal,
  onDealDragStart,
  highlighted,
}: {
  stage: Stage;
  deals: Deal[];
  fx: FxRatesSnapshot | null;
  fxLoading: boolean;
  onMoveDeal: (dealId: string, stageId: string) => void;
  onOpenDeal: (deal: Deal) => void;
  onDealDragStart: () => void;
  highlighted: boolean;
}) {
  const { t, stageName } = useI18n();
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

    const hasNonUsd = entries.some(([currency]) => currency !== 'USD');
    if (!hasNonUsd) {
      const usd = totals.USD ?? 0;
      return formatUsdTotal(usd);
    }

    if (!fx) {
      return fxLoading ? 'USD …' : 'USD —';
    }

    const missing = entries
      .map(([currency]) => currency)
      .filter((currency) => currency !== 'USD')
      .filter((currency) => toUsd(1, currency, fx) === null);
    if (missing.length > 0) return 'USD —';

    const usdTotal = entries.reduce((sum, [currency, value]) => {
      if (currency === 'USD') return sum + value;
      const converted = toUsd(value, currency, fx);
      return converted === null ? sum : sum + converted;
    }, 0);
    return formatUsdTotal(usdTotal);
  })();

  return (
    <div
      id={`stage-${stage.id}`}
      className={`card w-[260px] shrink-0 p-4 ${
        highlighted ? 'ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/10' : ''
      }`}
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
        <div className="text-left">
          <p className="text-sm text-slate-400">{t(`stageStatus.${stage.status}`)}</p>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{stageName(stage.name)}</h3>
            <span className="text-xs text-slate-500">{Math.round((stage.probability ?? 0) * 100)}%</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">{t('crm.deals')}</p>
          <p className="text-sm font-semibold">{deals.length}</p>
        </div>
      </div>
      <p
        className="mt-2 text-xs text-slate-400"
        title={fx?.date ? t('crm.convertedToUsd', { date: fx.date }) : undefined}
      >
        {t('crm.total')}: {totalLabel}
      </p>
      <div className="mt-4 space-y-3">
        {deals.map((deal) => (
          <div
            key={deal.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', deal.id);
              onDealDragStart();
            }}
            role="button"
            tabIndex={0}
            title={t('crm.editDeal')}
            onClick={() => onOpenDeal(deal)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenDeal(deal);
              }
            }}
            className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{deal.title}</p>
              <span className="mt-0.5 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
                {Math.round((stage.probability ?? 0) * 100)}%
              </span>
            </div>
            {deal.client ? (
              <p className="mt-1 text-[11px] text-slate-400">
                {t('tasks.client')}: {getClientDisplayName(deal.client)}
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
                {t('crm.closing')}: {new Date(deal.expectedCloseDate).toLocaleDateString()}
              </p>
            ) : null}
            <p className="text-xs text-slate-400">
              {deal.currency} {Number(deal.value).toLocaleString()}
            </p>
          </div>
        ))}
        {deals.length === 0 && <p className="text-xs text-slate-500">{t('crm.noDeals')}</p>}
      </div>
    </div>
  );
}
