'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { CLIENT_FUNCTION_OPTIONS, getClientDisplayName } from '@/lib/clients';
import { convertCurrency, formatCurrencyTotal, type FxRatesSnapshot } from '@/lib/fx';
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
const STAGE_STATUSES: Stage['status'][] = ['OPEN', 'WON', 'LOST'];

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
  crmDisplayCurrency?: DealCurrency;
  industry?: string | null;
};

const DEAL_CURRENCIES = ['USD', 'EUR', 'MXN', 'CAD'] as const;
type DealCurrency = (typeof DEAL_CURRENCIES)[number];
type WorkflowStageDraft = {
  id: string;
  name: string;
  probabilityPct: string;
  status: Stage['status'];
};

type NewStageDraft = {
  name: string;
  probabilityPct: string;
  status: Stage['status'];
  afterStageId: string;
};

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

function toProbabilityPct(value?: number | null) {
  const probability = Number(value);
  if (!Number.isFinite(probability)) return '0';
  return String(Math.round(probability * 100));
}

function parseProbabilityPct(value: string) {
  const normalized = String(value || '').replace(',', '.').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

export default function CrmPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const router = useRouter();
  const { t, stageName } = useI18n();
  const lastDragAtRef = useRef<number>(0);
  const proposalRef = useRef<HTMLInputElement | null>(null);
  const [crmMode, setCrmMode] = useState<TenantSettings['crmMode']>('B2B');
  const [crmDisplayCurrency, setCrmDisplayCurrency] = useState<DealCurrency>('USD');
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
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [proposalFileName, setProposalFileName] = useState('');
  const [proposalError, setProposalError] = useState<string | null>(null);
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
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [workflowPipelineName, setWorkflowPipelineName] = useState('');
  const [workflowStageDrafts, setWorkflowStageDrafts] = useState<WorkflowStageDraft[]>([]);
  const [newStageDraft, setNewStageDraft] = useState<NewStageDraft>({
    name: '',
    probabilityPct: '50',
    status: 'OPEN',
    afterStageId: '',
  });
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowAddingStage, setWorkflowAddingStage] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowInfo, setWorkflowInfo] = useState<string | null>(null);
  const [statusDropHover, setStatusDropHover] = useState<Stage['status'] | null>(null);

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
      setProposalFile(null);
      setProposalFileName('');
      setProposalError(null);
      if (proposalRef.current) proposalRef.current.value = '';
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
        const rawCurrency =
          settingsResult.status === 'fulfilled'
            ? String(settingsResult.value.settings?.crmDisplayCurrency || 'USD').toUpperCase()
            : 'USD';
        setCrmDisplayCurrency(
          DEAL_CURRENCIES.includes(rawCurrency as DealCurrency) ? (rawCurrency as DealCurrency) : 'USD',
        );

        const data = pipelinesResult.status === 'fulfilled' ? pipelinesResult.value : [];
        if (pipelinesResult.status === 'rejected') {
          const message = pipelinesResult.reason instanceof Error ? pipelinesResult.reason.message : 'Unable to load pipelines';
          setError(message);
        }

        // Keep CRM board focused on the sales + post-sales flow.
        // Hide legacy/alternate B2C board from the main selector.
        let filtered = data.filter((p) => p.name !== 'B2C');
        if (filtered.length === 0) filtered = data;

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
        const defaultPipeline =
          match || filtered.find((p) => p.name === 'New Sales') || filtered.find((p) => p.isDefault) || filtered[0];
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

  const selectedPipeline = useMemo(() => {
    return pipelines.find((pipeline) => pipeline.id === pipelineId) || null;
  }, [pipelineId, pipelines]);

  const stageStatusById = useMemo(() => {
    const map: Record<string, Stage['status']> = {};
    for (const stage of sortedStages) map[stage.id] = stage.status;
    return map;
  }, [sortedStages]);

  const stageNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const stage of sortedStages) map[stage.id] = stage.name;
    return map;
  }, [sortedStages]);

  const firstWonStage = useMemo(() => {
    return sortedStages.find((stage) => stage.status === 'WON') || null;
  }, [sortedStages]);

  const firstLostStage = useMemo(() => {
    return sortedStages.find((stage) => stage.status === 'LOST') || null;
  }, [sortedStages]);

  const openLeadsCount = useMemo(() => {
    return deals.reduce((sum, deal) => (stageStatusById[deal.stageId] === 'OPEN' ? sum + 1 : sum), 0);
  }, [deals, stageStatusById]);

  const wonDeals = useMemo(() => {
    return deals.filter((deal) => stageStatusById[deal.stageId] === 'WON');
  }, [deals, stageStatusById]);

  const lostDeals = useMemo(() => {
    return deals.filter((deal) => stageStatusById[deal.stageId] === 'LOST');
  }, [deals, stageStatusById]);

  const resetWorkflowEditor = (sourceStages: Stage[], afterStageId?: string) => {
    const orderedStages = [...sourceStages].sort((a, b) => a.position - b.position);
    setWorkflowStageDrafts(
      orderedStages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        status: stage.status,
        probabilityPct: toProbabilityPct(stage.probability),
      })),
    );

    const preferredAfterStageId =
      afterStageId && orderedStages.some((stage) => stage.id === afterStageId)
        ? afterStageId
        : orderedStages[orderedStages.length - 1]?.id || '';
    const referenceStage =
      orderedStages.find((stage) => stage.id === preferredAfterStageId) || orderedStages[orderedStages.length - 1];

    setNewStageDraft({
      name: '',
      probabilityPct: toProbabilityPct(referenceStage?.probability ?? 0.5),
      status: referenceStage?.status ?? 'OPEN',
      afterStageId: preferredAfterStageId,
    });
  };

  const openWorkflowEditor = (afterStageId?: string) => {
    setWorkflowPipelineName(selectedPipeline?.name || '');
    resetWorkflowEditor(sortedStages, afterStageId);
    setWorkflowError(null);
    setWorkflowInfo(null);
    setShowWorkflowModal(true);
  };

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
    setProposalFile(null);
    setProposalFileName('');
    setProposalError(null);
    if (proposalRef.current) proposalRef.current.value = '';
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
    setProposalFile(null);
    setProposalFileName('');
    setProposalError(null);
    if (proposalRef.current) proposalRef.current.value = '';
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

        let finalDeal: Deal = { ...editingDeal, ...updated, stageId };

        if (proposalFile) {
          const proposalForm = new FormData();
          proposalForm.append('file', proposalFile);
          try {
            const withProposal = await api<Deal>(`/deals/${editingDeal.id}/proposal`, {
              method: 'POST',
              body: proposalForm,
            });
            finalDeal = { ...finalDeal, ...withProposal };
            setProposalError(null);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to upload proposal PDF';
            setProposalError(message);
            throw err;
          }
        }

        setDeals((prev) =>
          prev.map((deal) =>
            deal.id === editingDeal.id ? { ...deal, ...finalDeal } : deal,
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
        let finalDeal = created;

        // Optimistically add the deal so it's not lost even if the PDF upload fails.
        if (targetPipelineId === pipelineId) {
          setDeals((prev) => [created, ...prev]);
        }

        if (proposalFile) {
          const proposalForm = new FormData();
          proposalForm.append('file', proposalFile);
          try {
            const withProposal = await api<Deal>(`/deals/${created.id}/proposal`, {
              method: 'POST',
              body: proposalForm,
            });
            finalDeal = withProposal;
            setProposalError(null);
            if (targetPipelineId === pipelineId) {
              setDeals((prev) => prev.map((d) => (d.id === created.id ? { ...d, ...withProposal } : d)));
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to upload proposal PDF';
            setProposalError(message);
            // Keep the modal open in edit mode so the user can retry the upload.
            if (targetPipelineId !== pipelineId) {
              setPipelineId(targetPipelineId);
              setRequestedStageId(null);
              setHighlightStageId(null);
              router.replace(`/crm?pipelineId=${targetPipelineId}`);
            }
            setEditingDeal(created);
            return;
          }
        }

        if (targetPipelineId !== pipelineId) {
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

  const handleDropDealToStatus = async (dealId: string, status: Stage['status']) => {
    const targetStage = status === 'WON' ? firstWonStage : firstLostStage;
    if (!targetStage) {
      setError(`No ${status} stage available in this pipeline`);
      return;
    }
    await handleMoveDeal(dealId, targetStage.id);
  };

  const updateWorkflowStageDraft = (stageId: string, patch: Partial<WorkflowStageDraft>) => {
    setWorkflowStageDrafts((prev) =>
      prev.map((draft) => (draft.id === stageId ? { ...draft, ...patch } : draft)),
    );
  };

  const handleSaveWorkflow = async () => {
    if (!pipelineId) return;
    setWorkflowSaving(true);
    setWorkflowError(null);
    setWorkflowInfo(null);

    try {
      const nextPipelineName = workflowPipelineName.trim();
      if (!nextPipelineName) {
        throw new Error('Workflow name is required');
      }

      if (selectedPipeline && nextPipelineName !== selectedPipeline.name) {
        await api(`/pipelines/${pipelineId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: nextPipelineName }),
        });
        setPipelines((prev) =>
          prev.map((pipeline) => (pipeline.id === pipelineId ? { ...pipeline, name: nextPipelineName } : pipeline)),
        );
      }

      const existingById = new Map(sortedStages.map((stage) => [stage.id, stage]));
      for (const draft of workflowStageDrafts) {
        const name = draft.name.trim();
        if (!name) throw new Error('Each stage needs a name');

        const probabilityPct = parseProbabilityPct(draft.probabilityPct);
        if (probabilityPct === null) throw new Error('Probability must be between 0 and 100');
        const probability = probabilityPct / 100;

        const current = existingById.get(draft.id);
        if (!current) continue;
        const changed =
          current.name !== name ||
          current.status !== draft.status ||
          Math.abs((current.probability ?? 0) - probability) > 0.00001;
        if (!changed) continue;

        await api(`/stages/${draft.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            status: draft.status,
            probability,
          }),
        });
      }

      const refreshedStages = await api<Stage[]>(`/stages?pipelineId=${pipelineId}`);
      setStages(refreshedStages);
      setStagesByPipelineId((prev) => ({ ...prev, [pipelineId]: refreshedStages }));
      resetWorkflowEditor(refreshedStages, newStageDraft.afterStageId || undefined);
      setWorkflowInfo(t('common.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save workflow';
      setWorkflowError(message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const handleCreateStageFromWorkflow = async () => {
    if (!pipelineId) return;
    const stageNameValue = newStageDraft.name.trim();
    if (!stageNameValue) {
      setWorkflowError('Stage name is required');
      return;
    }

    const probabilityPct = parseProbabilityPct(newStageDraft.probabilityPct);
    if (probabilityPct === null) {
      setWorkflowError('Probability must be between 0 and 100');
      return;
    }

    setWorkflowAddingStage(true);
    setWorkflowError(null);
    setWorkflowInfo(null);

    try {
      const created = await api<Stage>('/stages', {
        method: 'POST',
        body: JSON.stringify({
          pipelineId,
          name: stageNameValue,
          status: newStageDraft.status,
          probability: probabilityPct / 100,
        }),
      });

      let refreshedStages = await api<Stage[]>(`/stages?pipelineId=${pipelineId}`);
      const orderedStages = [...refreshedStages].sort((a, b) => a.position - b.position);
      const createdStage = orderedStages.find((stage) => stage.id === created.id);

      if (createdStage && newStageDraft.afterStageId) {
        const withoutCreated = orderedStages.filter((stage) => stage.id !== createdStage.id);
        const afterIndex = withoutCreated.findIndex((stage) => stage.id === newStageDraft.afterStageId);
        if (afterIndex >= 0) {
          const desiredOrder = [
            ...withoutCreated.slice(0, afterIndex + 1),
            createdStage,
            ...withoutCreated.slice(afterIndex + 1),
          ];
          const hasChangedOrder = desiredOrder.some((stage, index) => stage.id !== orderedStages[index]?.id);
          if (hasChangedOrder) {
            await api('/stages/reorder', {
              method: 'PATCH',
              body: JSON.stringify({
                items: desiredOrder.map((stage, position) => ({ id: stage.id, position })),
              }),
            });
            refreshedStages = await api<Stage[]>(`/stages?pipelineId=${pipelineId}`);
          }
        }
      }

      setStages(refreshedStages);
      setStagesByPipelineId((prev) => ({ ...prev, [pipelineId]: refreshedStages }));
      resetWorkflowEditor(refreshedStages, created.id);
      setWorkflowInfo('Stage added');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to add stage';
      setWorkflowError(message);
    } finally {
      setWorkflowAddingStage(false);
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
            <button className="btn-secondary text-sm" type="button" onClick={() => openWorkflowEditor()}>
              {t('common.manage')} {t('tasks.section')}
            </button>
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
                displayCurrency={crmDisplayCurrency}
                fx={fx}
                fxLoading={fxLoading}
                onMoveDeal={handleMoveDeal}
                onOpenDeal={openDealFromCard}
                onDealDragStart={() => {
                  lastDragAtRef.current = Date.now();
                }}
                onRequestAddStageAfter={(sourceStage) => openWorkflowEditor(sourceStage.id)}
                highlighted={highlightStageId === stage.id}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(['WON', 'LOST'] as Stage['status'][]).map((status) => {
            const targetStage = status === 'WON' ? firstWonStage : firstLostStage;
            const isHover = statusDropHover === status;
            return (
              <div
                key={status}
                className={`rounded-xl border px-4 py-3 transition ${
                  targetStage
                    ? isHover
                      ? 'border-cyan-300/60 bg-cyan-400/10'
                      : 'border-white/15 bg-white/5'
                    : 'border-white/10 bg-white/[0.03] opacity-70'
                }`}
                onDragOver={(event) => {
                  if (!targetStage) return;
                  event.preventDefault();
                  setStatusDropHover(status);
                }}
                onDragLeave={() => {
                  if (statusDropHover === status) setStatusDropHover(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setStatusDropHover(null);
                  const dealId = event.dataTransfer.getData('text/plain');
                  if (!dealId) return;
                  handleDropDealToStatus(dealId, status);
                }}
              >
                <p className="text-sm font-semibold text-slate-100">{t(`stageStatus.${status}`)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {targetStage ? stageName(targetStage.name) : t('crm.noStagesShort')}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-100">{t(`stageStatus.WON`)}</p>
              <p className="text-xs text-slate-400">
                {wonDeals.length} {t('crm.deals')}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {wonDeals.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
                  onClick={() => openEditModal(deal)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{deal.title}</p>
                    <p className="text-xs text-slate-400">
                      {deal.currency} {Number(deal.value).toLocaleString()}
                    </p>
                  </div>
                  {stageNameById[deal.stageId] ? (
                    <p className="mt-1 text-xs text-slate-500">{stageName(stageNameById[deal.stageId])}</p>
                  ) : null}
                </button>
              ))}
              {wonDeals.length === 0 ? <p className="text-xs text-slate-500">{t('crm.noDeals')}</p> : null}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-100">{t(`stageStatus.LOST`)}</p>
              <p className="text-xs text-slate-400">
                {lostDeals.length} {t('crm.deals')}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {lostDeals.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
                  onClick={() => openEditModal(deal)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{deal.title}</p>
                    <p className="text-xs text-slate-400">
                      {deal.currency} {Number(deal.value).toLocaleString()}
                    </p>
                  </div>
                  {stageNameById[deal.stageId] ? (
                    <p className="mt-1 text-xs text-slate-500">{stageName(stageNameById[deal.stageId])}</p>
                  ) : null}
                </button>
              ))}
              {lostDeals.length === 0 ? <p className="text-xs text-slate-500">{t('crm.noDeals')}</p> : null}
            </div>
          </div>
        </div>

        {showWorkflowModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10">
            <div className="card flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {t('common.manage')} {t('tasks.section')}
                </h2>
                <button
                  className="text-slate-400"
                  onClick={() => {
                    setShowWorkflowModal(false);
                    setWorkflowError(null);
                    setWorkflowInfo(null);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
                <label className="block text-sm text-slate-300">
                  {t('crm.pipeline')}
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={workflowPipelineName}
                    onChange={(e) => setWorkflowPipelineName(e.target.value)}
                  />
                </label>

                <div>
                  <p className="text-sm text-slate-300">{t('tasks.section')}</p>
                  <div className="mt-2 space-y-2">
                    {workflowStageDrafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="grid gap-2 rounded-lg border border-white/10 bg-white/5 p-3 md:grid-cols-[1fr_150px_130px]"
                      >
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          value={draft.name}
                          onChange={(e) =>
                            updateWorkflowStageDraft(draft.id, {
                              name: e.target.value,
                            })
                          }
                        />
                        <select
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                          value={draft.status}
                          onChange={(e) =>
                            updateWorkflowStageDraft(draft.id, {
                              status: e.target.value as Stage['status'],
                            })
                          }
                        >
                          {STAGE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {t(`stageStatus.${status}`)}
                            </option>
                          ))}
                        </select>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-7 text-sm"
                            value={draft.probabilityPct}
                            onChange={(e) =>
                              updateWorkflowStageDraft(draft.id, {
                                probabilityPct: e.target.value,
                              })
                            }
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            %
                          </span>
                        </div>
                      </div>
                    ))}
                    {workflowStageDrafts.length === 0 ? (
                      <p className="text-xs text-slate-500">{t('crm.noStagesShort')}</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-slate-100">+ {t('crm.stage')}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                      placeholder={t('crm.stage')}
                      value={newStageDraft.name}
                      onChange={(e) =>
                        setNewStageDraft((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                    <select
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                      value={newStageDraft.afterStageId}
                      onChange={(e) =>
                        setNewStageDraft((prev) => ({
                          ...prev,
                          afterStageId: e.target.value,
                        }))
                      }
                    >
                      <option value="">At end</option>
                      {workflowStageDrafts.map((draft) => (
                        <option key={draft.id} value={draft.id}>
                          {stageName(draft.name)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                      value={newStageDraft.status}
                      onChange={(e) =>
                        setNewStageDraft((prev) => ({
                          ...prev,
                          status: e.target.value as Stage['status'],
                        }))
                      }
                    >
                      {STAGE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`stageStatus.${status}`)}
                        </option>
                      ))}
                    </select>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-7 text-sm"
                        value={newStageDraft.probabilityPct}
                        onChange={(e) =>
                          setNewStageDraft((prev) => ({
                            ...prev,
                            probabilityPct: e.target.value,
                          }))
                        }
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      className="btn-secondary"
                      onClick={handleCreateStageFromWorkflow}
                      disabled={workflowAddingStage || workflowSaving}
                    >
                      {workflowAddingStage ? t('common.saving') : `+ ${t('crm.stage')}`}
                    </button>
                  </div>
                </div>

                {workflowInfo ? <p className="text-sm text-emerald-200">{workflowInfo}</p> : null}
                {workflowError ? <p className="text-sm text-red-200">{workflowError}</p> : null}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowWorkflowModal(false);
                    setWorkflowError(null);
                    setWorkflowInfo(null);
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSaveWorkflow}
                  disabled={workflowSaving || workflowAddingStage}
                >
                  {workflowSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10">
            <div className="card flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{editingDeal ? t('crm.editDeal') : t('crm.newDeal')}</h2>
                <button className="text-slate-400" onClick={() => setShowModal(false)}>
                  ✕
                </button>
              </div>
              <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
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

                <div>
                  <p className="text-sm text-slate-300">{t('crm.proposalPdf')}</p>
                  <div className="mt-2 flex items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-3 text-sm text-slate-300">
                    <input
                      ref={proposalRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        setProposalError(null);
                        const file = e.target.files?.[0] || null;
                        if (!file) {
                          setProposalFile(null);
                          setProposalFileName('');
                          return;
                        }
                        const ok =
                          (file.type || '').toLowerCase() === 'application/pdf' ||
                          (file.name || '').toLowerCase().endsWith('.pdf');
                        if (!ok) {
                          setProposalFile(null);
                          setProposalFileName('');
                          if (proposalRef.current) proposalRef.current.value = '';
                          setProposalError(t('crm.proposalPdfOnly'));
                          return;
                        }
                        setProposalFile(file);
                        setProposalFileName(file.name || 'proposal.pdf');
                      }}
                    />
                    <button type="button" className="btn-secondary" onClick={() => proposalRef.current?.click()}>
                      {t('invoices.chooseFile')}
                    </button>
                    <span className="text-slate-400">{proposalFileName || t('invoices.noFileChosen')}</span>
                    {proposalFileName ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setProposalFile(null);
                          setProposalFileName('');
                          setProposalError(null);
                          if (proposalRef.current) proposalRef.current.value = '';
                        }}
                      >
                        {t('common.delete')}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t('crm.proposalPdfHint')}</p>
                  {proposalError ? <p className="mt-2 text-xs text-red-200">{proposalError}</p> : null}
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
  displayCurrency,
  fx,
  fxLoading,
  onMoveDeal,
  onOpenDeal,
  onDealDragStart,
  onRequestAddStageAfter,
  highlighted,
}: {
  stage: Stage;
  deals: Deal[];
  displayCurrency: DealCurrency;
  fx: FxRatesSnapshot | null;
  fxLoading: boolean;
  onMoveDeal: (dealId: string, stageId: string) => void;
  onOpenDeal: (deal: Deal) => void;
  onDealDragStart: () => void;
  onRequestAddStageAfter: (stage: Stage) => void;
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
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  const requiresConversion = entries.some(([currency]) => currency !== displayCurrency);

  const totalLabel = (() => {
    if (entries.length === 0) return '—';

    if (!requiresConversion) {
      const sameCurrencyTotal = totals[displayCurrency] ?? 0;
      return formatCurrencyTotal(sameCurrencyTotal, displayCurrency);
    }

    if (!fx) {
      return fxLoading ? `${displayCurrency} …` : `${displayCurrency} —`;
    }

    const missing = entries
      .map(([currency]) => currency)
      .filter((currency) => convertCurrency(1, currency, displayCurrency, fx) === null);
    if (missing.length > 0) return `${displayCurrency} —`;

    const convertedTotal = entries.reduce((sum, [currency, value]) => {
      const converted = convertCurrency(value, currency, displayCurrency, fx);
      return converted === null ? sum : sum + converted;
    }, 0);
    return formatCurrencyTotal(convertedTotal, displayCurrency);
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
            <button
              type="button"
              className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-slate-300 transition hover:border-cyan-300/60 hover:text-cyan-200"
              title={`+ ${t('crm.stage')}`}
              onClick={() => onRequestAddStageAfter(stage)}
            >
              +
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">{t('crm.deals')}</p>
          <p className="text-sm font-semibold">{deals.length}</p>
        </div>
      </div>
      <p
        className="mt-2 text-xs text-slate-400"
        title={
          requiresConversion && fx?.date
            ? t('crm.convertedToCurrency', { currency: displayCurrency, date: fx.date })
            : undefined
        }
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
