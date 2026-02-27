'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import { useI18n } from '../../../contexts/I18nContext';
import { industryGroups, industryLabel, industryRecommendedMode } from '../../../lib/industries';

type SubscriptionItem = {
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
};

type LinkDraft = {
  customerName: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  seats: number;
};

type PendingInvite = {
  id: string;
  email: string;
  name?: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  createdAt: string;
  updatedAt: string;
};

type InviteDraft = {
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
};

type CreateInviteRow = InviteDraft & { id: string };

type SubscriptionPlan = 'TRIAL' | 'PULSE_BASIC' | 'PULSE_STANDARD' | 'PULSE_ADVANCED' | 'PULSE_ADVANCED_PLUS' | 'PULSE_TEAM';

const DEFAULT_SEATS_BY_PLAN: Record<SubscriptionPlan, number> = {
  TRIAL: 1,
  PULSE_BASIC: 1,
  PULSE_STANDARD: 3,
  PULSE_ADVANCED: 5,
  PULSE_ADVANCED_PLUS: 10,
  PULSE_TEAM: 20,
};

const DEFAULT_INVITE_DRAFT: InviteDraft = {
  name: '',
  email: '',
  role: 'MEMBER',
};

function makeInviteRowId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `invite-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createInviteRow(): CreateInviteRow {
  return {
    id: makeInviteRowId(),
    name: '',
    email: '',
    role: 'MEMBER',
  };
}

export default function AdminSubscriptionsPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t, language } = useI18n();
  const INDUSTRY_GROUPS = industryGroups();

  const [origin, setOrigin] = useState('');
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingSubscriptionId, setSavingSubscriptionId] = useState<string | null>(null);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [linkDraftsById, setLinkDraftsById] = useState<Record<string, LinkDraft>>({});
  const [inviteDraftsById, setInviteDraftsById] = useState<Record<string, InviteDraft>>({});
  const [pendingInvitesById, setPendingInvitesById] = useState<Record<string, PendingInvite[]>>({});
  const [savingInviteSubscriptionId, setSavingInviteSubscriptionId] = useState<string | null>(null);
  const [loadingInviteSubscriptionId, setLoadingInviteSubscriptionId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [crmMode, setCrmMode] = useState<'B2B' | 'B2C'>('B2B');
  const [crmModeLocked, setCrmModeLocked] = useState(false);
  const [industryId, setIndustryId] = useState('');
  const [industryOther, setIndustryOther] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('TRIAL');
  const [seats, setSeats] = useState(DEFAULT_SEATS_BY_PLAN.TRIAL);
  const [createInviteRows, setCreateInviteRows] = useState<CreateInviteRow[]>(() => [createInviteRow()]);
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

  useEffect(() => {
    setCreateInviteRows((prev) => {
      if (prev.length <= seats) return prev;
      return prev.slice(0, seats);
    });
  }, [seats]);

  const buildInviteUrl = useCallback(
    (opts: { tenantId: string; tenantName: string; contactName?: string; contactEmail?: string; inviteToken?: string }) => {
      if (!origin) return '';
      const params = new URLSearchParams({
        tenantId: opts.tenantId,
        tenantName: opts.tenantName,
      });
      if (opts.contactName) params.set('name', opts.contactName);
      if (opts.contactEmail) params.set('email', opts.contactEmail);
      if (opts.inviteToken) params.set('inviteToken', opts.inviteToken);
      return `${origin}/register?${params.toString()}`;
    },
    [origin],
  );

  const getDefaultDraft = useCallback((sub: SubscriptionItem): LinkDraft => {
    return {
      customerName: sub.customerName || '',
      contactFirstName: sub.contactFirstName || '',
      contactLastName: sub.contactLastName || '',
      contactEmail: sub.contactEmail || '',
      seats: Math.min(30, Math.max(1, sub.seats || 1)),
    };
  }, []);

  const getLinkDraft = useCallback(
    (sub: SubscriptionItem): LinkDraft => {
      return linkDraftsById[sub.id] || getDefaultDraft(sub);
    },
    [getDefaultDraft, linkDraftsById],
  );

  const buildInviteUrlFromDraft = useCallback(
    (sub: SubscriptionItem, draft: LinkDraft) => {
      const contactName = [draft.contactFirstName, draft.contactLastName].filter(Boolean).join(' ').trim();
      return buildInviteUrl({
        tenantId: sub.customerTenantId,
        tenantName: draft.customerName.trim() || sub.customerName,
        contactName: contactName || undefined,
        contactEmail: draft.contactEmail.trim() || undefined,
      });
    },
    [buildInviteUrl],
  );

  const updateLinkDraft = useCallback((subscriptionId: string, patch: Partial<LinkDraft>) => {
    setLinkDraftsById((prev) => {
      const current = prev[subscriptionId] || { customerName: '', contactFirstName: '', contactLastName: '', contactEmail: '', seats: 1 };
      return {
        ...prev,
        [subscriptionId]: {
          ...current,
          ...patch,
        },
      };
    });
  }, []);

  const getInviteDraft = useCallback(
    (subscriptionId: string): InviteDraft => {
      return inviteDraftsById[subscriptionId] || DEFAULT_INVITE_DRAFT;
    },
    [inviteDraftsById],
  );

  const updateInviteDraft = useCallback((subscriptionId: string, patch: Partial<InviteDraft>) => {
    setInviteDraftsById((prev) => {
      const current = prev[subscriptionId] || DEFAULT_INVITE_DRAFT;
      return {
        ...prev,
        [subscriptionId]: {
          ...current,
          ...patch,
        },
      };
    });
  }, []);

  const updateCreateInviteRow = useCallback((rowId: string, patch: Partial<InviteDraft>) => {
    setCreateInviteRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          ...patch,
        };
      }),
    );
  }, []);

  const addCreateInviteRow = useCallback(() => {
    setCreateInviteRows((prev) => {
      if (prev.length >= seats) return prev;
      return [...prev, createInviteRow()];
    });
  }, [seats]);

  const removeCreateInviteRow = useCallback((rowId: string) => {
    setCreateInviteRows((prev) => {
      if (prev.length <= 1) return [createInviteRow()];
      return prev.filter((row) => row.id !== rowId);
    });
  }, []);

  const loadSubscriptionInvites = useCallback(
    async (subscriptionId: string) => {
      setLoadingInviteSubscriptionId(subscriptionId);
      try {
        const pending = await api<PendingInvite[]>(`/admin/subscriptions/${subscriptionId}/user-invites`);
        setPendingInvitesById((prev) => ({ ...prev, [subscriptionId]: pending }));
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load invites';
        setError(message);
      } finally {
        setLoadingInviteSubscriptionId((prev) => (prev === subscriptionId ? null : prev));
      }
    },
    [api],
  );

  const startEditingLink = useCallback(
    (sub: SubscriptionItem) => {
      setError(null);
      setInfo(null);
      setEditingSubscriptionId(sub.id);
      setLinkDraftsById((prev) => {
        if (prev[sub.id]) return prev;
        return {
          ...prev,
          [sub.id]: getDefaultDraft(sub),
        };
      });
      setInviteDraftsById((prev) => {
        if (prev[sub.id]) return prev;
        return {
          ...prev,
          [sub.id]: DEFAULT_INVITE_DRAFT,
        };
      });
      void loadSubscriptionInvites(sub.id);
    },
    [getDefaultDraft, loadSubscriptionInvites],
  );

  const cancelEditingLink = useCallback((sub: SubscriptionItem) => {
    setEditingSubscriptionId((prev) => (prev === sub.id ? null : prev));
    setLinkDraftsById((prev) => {
      const next = { ...prev };
      delete next[sub.id];
      return next;
    });
    setInviteDraftsById((prev) => {
      const next = { ...prev };
      delete next[sub.id];
      return next;
    });
  }, []);

  const copyUrl = useCallback(
    async (url: string) => {
      if (!url) return;
      setInfo(null);
      setError(null);
      try {
        await navigator.clipboard.writeText(url);
        setInfo(t('adminSubscriptions.copied'));
      } catch {
        setInfo(t('adminSubscriptions.copyFailed'));
      }
    },
    [t],
  );

  const saveSubscriptionLinkData = useCallback(
    async (sub: SubscriptionItem) => {
      const draft = getLinkDraft(sub);
      const nextCustomerName = draft.customerName.trim();
      if (!nextCustomerName) {
        setError(t('adminSubscriptions.customerNameRequired'));
        return;
      }

      setSavingSubscriptionId(sub.id);
      setError(null);
      setInfo(null);

      try {
        const updated = await api<SubscriptionItem>(`/admin/subscriptions/${sub.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            customerName: nextCustomerName,
            contactFirstName: draft.contactFirstName.trim() || null,
            contactLastName: draft.contactLastName.trim() || null,
            contactEmail: draft.contactEmail.trim() || null,
            seats: draft.seats,
          }),
        });

        setItems((prev) => prev.map((row) => (row.id === sub.id ? updated : row)));
        setEditingSubscriptionId(null);
        setLinkDraftsById((prev) => {
          const next = { ...prev };
          delete next[sub.id];
          return next;
        });

        const updatedDraft = getDefaultDraft(updated);
        await copyUrl(buildInviteUrlFromDraft(updated, updatedDraft));
        setInfo(t('adminSubscriptions.updatedAndCopied'));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update subscription';
        setError(message);
      } finally {
        setSavingSubscriptionId(null);
      }
    },
    [api, buildInviteUrlFromDraft, copyUrl, getDefaultDraft, getLinkDraft, t],
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

    const normalizedCreateInvites = createInviteRows
      .map((row) => ({
        name: row.name.trim(),
        email: row.email.trim().toLowerCase(),
        role: row.role,
      }))
      .filter((row) => row.email.length > 0);
    if (normalizedCreateInvites.length > seats) {
      setError(t('adminSubscriptions.createInvites.tooMany', { count: seats }));
      return;
    }

    const uniqueEmails = new Set<string>();
    for (const row of normalizedCreateInvites) {
      if (uniqueEmails.has(row.email)) {
        setError(t('adminSubscriptions.createInvites.duplicateEmail'));
        return;
      }
      uniqueEmails.add(row.email);
    }

    setCreating(true);
    try {
      const created = await api<SubscriptionItem>('/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customerName: name,
          contactFirstName: first,
          contactLastName: last,
          contactEmail: email,
          crmMode,
          industry: industryValue,
          plan,
          seats,
        }),
      });

      let inviteSuccessCount = 0;
      let inviteFailedCount = 0;
      if (normalizedCreateInvites.length > 0) {
        const inviteResults = await Promise.allSettled(
          normalizedCreateInvites.map((row) =>
            api<PendingInvite>(`/admin/subscriptions/${created.id}/user-invites`, {
              method: 'POST',
              body: JSON.stringify({
                email: row.email,
                name: row.name || undefined,
                role: row.role,
              }),
            }),
          ),
        );

        const successfulInvites = inviteResults
          .filter((result): result is PromiseFulfilledResult<PendingInvite> => result.status === 'fulfilled')
          .map((result) => result.value);
        inviteSuccessCount = successfulInvites.length;
        inviteFailedCount = inviteResults.length - inviteSuccessCount;

        if (successfulInvites.length > 0) {
          const links = successfulInvites.map((invite) =>
            buildInviteUrl({
              tenantId: created.customerTenantId,
              tenantName: created.customerName,
              contactName: invite.name || undefined,
              contactEmail: invite.email,
              inviteToken: invite.token,
            }),
          );
          try {
            await navigator.clipboard.writeText(links.join('\n'));
            setInfo(t('adminSubscriptions.createInvites.copied', { count: inviteSuccessCount }));
          } catch {
            setInfo(t('adminSubscriptions.createInvites.created', { count: inviteSuccessCount }));
          }
        }
      }

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
      setSeats(DEFAULT_SEATS_BY_PLAN.TRIAL);
      setCreateInviteRows([createInviteRow()]);

      if (inviteSuccessCount === 0) {
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
      } else if (inviteFailedCount > 0) {
        setError(t('adminSubscriptions.createInvites.partialError', { failed: inviteFailedCount }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create subscription';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = async (sub: SubscriptionItem) => {
    const draft = getLinkDraft(sub);
    await copyUrl(buildInviteUrlFromDraft(sub, draft));
  };

  const createSubscriptionInvite = useCallback(
    async (sub: SubscriptionItem) => {
      const inviteDraft = getInviteDraft(sub.id);
      const email = inviteDraft.email.trim();
      if (!email) return;

      setSavingInviteSubscriptionId(sub.id);
      setError(null);
      setInfo(null);

      try {
        const created = await api<PendingInvite>(`/admin/subscriptions/${sub.id}/user-invites`, {
          method: 'POST',
          body: JSON.stringify({
            email,
            name: inviteDraft.name.trim() || undefined,
            role: inviteDraft.role,
          }),
        });

        setPendingInvitesById((prev) => ({
          ...prev,
          [sub.id]: [created, ...(prev[sub.id] || []).filter((inv) => inv.id !== created.id)],
        }));
        setInviteDraftsById((prev) => ({
          ...prev,
          [sub.id]: DEFAULT_INVITE_DRAFT,
        }));

        const link = buildInviteUrl({
          tenantId: sub.customerTenantId,
          tenantName: getLinkDraft(sub).customerName.trim() || sub.customerName,
          contactName: created.name || undefined,
          contactEmail: created.email,
          inviteToken: created.token,
        });
        await copyUrl(link);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to create invite';
        setError(message);
      } finally {
        setSavingInviteSubscriptionId((prev) => (prev === sub.id ? null : prev));
      }
    },
    [api, buildInviteUrl, copyUrl, getInviteDraft, getLinkDraft],
  );

  const rows = useMemo(
    () =>
      items.map((sub) => ({
        ...sub,
        isEditing: editingSubscriptionId === sub.id,
        draft: getLinkDraft(sub),
        inviteDraft: getInviteDraft(sub.id),
        pendingInvites: pendingInvitesById[sub.id] || [],
        inviteUrl: buildInviteUrlFromDraft(sub, getLinkDraft(sub)),
      })),
    [buildInviteUrlFromDraft, editingSubscriptionId, getInviteDraft, getLinkDraft, items, pendingInvitesById],
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

            <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">{t('adminSubscriptions.createInvites.title')}</p>
                <button
                  type="button"
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50"
                  onClick={addCreateInviteRow}
                  disabled={createInviteRows.length >= seats}
                >
                  {t('adminSubscriptions.createInvites.addButton')}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">{t('adminSubscriptions.createInvites.subtitle')}</p>

              <div className="mt-2 space-y-2">
                {createInviteRows.map((row) => (
                  <div key={row.id} className="grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
                    <input
                      className="w-full rounded-lg bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                      value={row.name}
                      onChange={(e) => updateCreateInviteRow(row.id, { name: e.target.value })}
                      placeholder={t('adminSubscriptions.invites.namePlaceholder')}
                    />
                    <input
                      className="w-full rounded-lg bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                      value={row.email}
                      onChange={(e) => updateCreateInviteRow(row.id, { email: e.target.value })}
                      placeholder={t('adminSubscriptions.invites.emailPlaceholder')}
                      type="email"
                    />
                    <select
                      className="w-full rounded-lg bg-black/20 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                      value={row.role}
                      onChange={(e) => updateCreateInviteRow(row.id, { role: (e.target.value as 'ADMIN' | 'MEMBER') || 'MEMBER' })}
                    >
                      <option value="MEMBER">{t('adminSubscriptions.invites.roleMember')}</option>
                      <option value="ADMIN">{t('adminSubscriptions.invites.roleAdmin')}</option>
                    </select>
                    <button
                      type="button"
                      className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                      onClick={() => removeCreateInviteRow(row.id)}
                    >
                      {t('adminSubscriptions.createInvites.removeButton')}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_180px_220px_1fr_auto] lg:items-end">
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.plan')}</label>
                <select
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={plan}
                  onChange={(e) => {
                    const nextPlan = e.target.value as SubscriptionPlan;
                    setPlan(nextPlan);
                    setSeats(DEFAULT_SEATS_BY_PLAN[nextPlan]);
                  }}
                >
                  <option value="TRIAL">{t('adminSubscriptions.planTrial')}</option>
                  <option value="PULSE_BASIC">{t('adminSubscriptions.planBasic')}</option>
                  <option value="PULSE_STANDARD">{t('adminSubscriptions.planStandard')}</option>
                  <option value="PULSE_ADVANCED">{t('adminSubscriptions.planAdvanced')}</option>
                  <option value="PULSE_ADVANCED_PLUS">{t('adminSubscriptions.planAdvancedPlus')}</option>
                  <option value="PULSE_TEAM">{t('adminSubscriptions.planTeam')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-300">{t('adminSubscriptions.seats')}</label>
                <select
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  aria-label={t('adminSubscriptions.seats')}
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {t('adminSubscriptions.users')}
                    </option>
                  ))}
                </select>
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
                          {sub.seats ? ` · ${sub.seats} ${t('adminSubscriptions.users')}` : ''}
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
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50"
                            onClick={() => void copyInvite(sub)}
                            disabled={!sub.inviteUrl}
                          >
                            {t('adminSubscriptions.copyLink')}
                          </button>
                          {!sub.isEditing ? (
                            <button
                              type="button"
                              className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                              onClick={() => startEditingLink(sub)}
                            >
                              {t('adminSubscriptions.editLink')}
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-2 break-all font-mono text-xs text-slate-300">{sub.inviteUrl || '—'}</p>

                        {sub.isEditing ? (
                          <div className="mt-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                            <p className="text-xs font-semibold text-slate-200">{t('adminSubscriptions.editLinkTitle')}</p>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <input
                                className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                value={sub.draft.customerName}
                                onChange={(e) => updateLinkDraft(sub.id, { customerName: e.target.value })}
                                placeholder={t('adminSubscriptions.customerNamePlaceholder')}
                              />
                              <input
                                className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                value={sub.draft.contactEmail}
                                onChange={(e) => updateLinkDraft(sub.id, { contactEmail: e.target.value })}
                                placeholder={t('adminSubscriptions.contactEmailPlaceholder')}
                                type="email"
                              />
                              <input
                                className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                value={sub.draft.contactFirstName}
                                onChange={(e) => updateLinkDraft(sub.id, { contactFirstName: e.target.value })}
                                placeholder={t('adminSubscriptions.contactFirstNamePlaceholder')}
                              />
                              <input
                                className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                value={sub.draft.contactLastName}
                                onChange={(e) => updateLinkDraft(sub.id, { contactLastName: e.target.value })}
                                placeholder={t('adminSubscriptions.contactLastNamePlaceholder')}
                              />
                              <select
                                className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                value={sub.draft.seats}
                                onChange={(e) => updateLinkDraft(sub.id, { seats: Number(e.target.value) })}
                                aria-label={t('adminSubscriptions.seats')}
                              >
                                {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                                  <option key={n} value={n}>
                                    {n} {t('adminSubscriptions.users')}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="mt-3 rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
                              <p className="text-xs font-semibold text-slate-100">{t('adminSubscriptions.invites.title')}</p>
                              <p className="mt-1 text-xs text-slate-400">{t('adminSubscriptions.invites.subtitle')}</p>
                              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
                                <input
                                  className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                  value={sub.inviteDraft.name}
                                  onChange={(e) => updateInviteDraft(sub.id, { name: e.target.value })}
                                  placeholder={t('adminSubscriptions.invites.namePlaceholder')}
                                />
                                <input
                                  className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                  value={sub.inviteDraft.email}
                                  onChange={(e) => updateInviteDraft(sub.id, { email: e.target.value })}
                                  placeholder={t('adminSubscriptions.invites.emailPlaceholder')}
                                  type="email"
                                />
                                <select
                                  className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                                  value={sub.inviteDraft.role}
                                  onChange={(e) =>
                                    updateInviteDraft(sub.id, { role: (e.target.value as 'ADMIN' | 'MEMBER') || 'MEMBER' })
                                  }
                                >
                                  <option value="MEMBER">{t('adminSubscriptions.invites.roleMember')}</option>
                                  <option value="ADMIN">{t('adminSubscriptions.invites.roleAdmin')}</option>
                                </select>
                                <button
                                  type="button"
                                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/40 hover:bg-emerald-500/30 disabled:opacity-50"
                                  onClick={() => void createSubscriptionInvite(sub)}
                                  disabled={savingInviteSubscriptionId === sub.id || !sub.inviteDraft.email.trim()}
                                >
                                  {savingInviteSubscriptionId === sub.id
                                    ? t('adminSubscriptions.invites.inviting')
                                    : t('adminSubscriptions.invites.inviteButton')}
                                </button>
                              </div>

                              {loadingInviteSubscriptionId === sub.id ? (
                                <p className="mt-2 text-xs text-slate-400">{t('adminSubscriptions.invites.loading')}</p>
                              ) : null}

                              {sub.pendingInvites.length > 0 ? (
                                <div className="mt-2 space-y-2">
                                  {sub.pendingInvites.map((invite) => {
                                    const link = buildInviteUrl({
                                      tenantId: sub.customerTenantId,
                                      tenantName: sub.draft.customerName.trim() || sub.customerName,
                                      contactName: invite.name || undefined,
                                      contactEmail: invite.email,
                                      inviteToken: invite.token,
                                    });
                                    return (
                                      <div key={invite.id} className="rounded-lg bg-white/5 p-2 text-xs ring-1 ring-white/10">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-slate-200">
                                            {invite.name ? `${invite.name} · ` : ''}
                                            {invite.email} ·{' '}
                                            {invite.role === 'ADMIN'
                                              ? t('adminSubscriptions.invites.roleAdmin')
                                              : t('adminSubscriptions.invites.roleMember')}
                                          </p>
                                          <button
                                            type="button"
                                            className="rounded-lg bg-white/5 px-2 py-1 font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
                                            onClick={() => void copyUrl(link)}
                                            disabled={!link}
                                          >
                                            {t('adminSubscriptions.copyLink')}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">{t('adminSubscriptions.invites.empty')}</p>
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-300/40 hover:bg-cyan-500/30 disabled:opacity-50"
                                onClick={() => void saveSubscriptionLinkData(sub)}
                                disabled={savingSubscriptionId === sub.id}
                              >
                                {savingSubscriptionId === sub.id
                                  ? t('adminSubscriptions.saving')
                                  : t('adminSubscriptions.saveLinkData')}
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                                onClick={() => cancelEditingLink(sub)}
                                disabled={savingSubscriptionId === sub.id}
                              >
                                {t('adminSubscriptions.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : null}
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
