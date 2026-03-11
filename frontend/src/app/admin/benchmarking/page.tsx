'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';

type MarketingProvider = 'NONE' | 'MAILCHIMP' | 'BREVO' | 'MAILCOW' | 'SMTP';

type MarketingSetup = {
  provider: MarketingProvider;
  accountLabel?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
  } | null;
  mailchimp?: {
    apiKey?: string;
    serverPrefix?: string;
    audienceId?: string;
  } | null;
  brevo?: {
    apiKey?: string;
    senderEmail?: string;
    senderName?: string;
  } | null;
};

type TenantSettingsPayload = {
  settings?: {
    marketingSetup?: MarketingSetup | null;
  };
};

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
  company?: string | null;
  companySector?: string | null;
  email?: string | null;
};

type AudienceMode = 'ALL' | 'SECTOR' | 'MANUAL';

type NewsletterDraft = {
  subject: string;
  preheader: string;
  body: string;
};

type AudienceContact = {
  id: string;
  firstName?: string | null;
  name: string;
  company?: string | null;
  companySector?: string | null;
  email: string;
};

const DIRECT_SEND_PROVIDERS = new Set<MarketingProvider>(['SMTP', 'MAILCOW']);

const DEFAULT_MARKETING_SETUP: MarketingSetup = {
  provider: 'NONE',
  accountLabel: '',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  smtp: {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
  },
  mailchimp: {
    apiKey: '',
    serverPrefix: '',
    audienceId: '',
  },
  brevo: {
    apiKey: '',
    senderEmail: '',
    senderName: '',
  },
};

const EMPTY_DRAFT: NewsletterDraft = {
  subject: '',
  preheader: '',
  body: '',
};

function normalizeMarketingSetup(setup?: MarketingSetup | null): MarketingSetup {
  return {
    ...DEFAULT_MARKETING_SETUP,
    ...(setup || {}),
    smtp: {
      ...DEFAULT_MARKETING_SETUP.smtp,
      ...(setup?.smtp || {}),
    },
    mailchimp: {
      ...DEFAULT_MARKETING_SETUP.mailchimp,
      ...(setup?.mailchimp || {}),
    },
    brevo: {
      ...DEFAULT_MARKETING_SETUP.brevo,
      ...(setup?.brevo || {}),
    },
  };
}

function clientLabel(client: Pick<Client, 'firstName' | 'name' | 'company'>) {
  const parts = [client.firstName, client.name].map((value) => String(value || '').trim()).filter(Boolean);
  const fullName = parts.join(' ').trim() || String(client.name || '').trim() || 'Unnamed client';
  return client.company ? `${fullName} · ${client.company}` : fullName;
}

function renderTemplate(
  template: string,
  recipient: {
    firstName?: string | null;
    name?: string | null;
    fullName?: string | null;
    company?: string | null;
    companySector?: string | null;
    email?: string | null;
  },
) {
  const tokens: Record<string, string> = {
    firstName: String(recipient.firstName || '').trim(),
    name: String(recipient.name || '').trim(),
    fullName: String(recipient.fullName || '').trim(),
    company: String(recipient.company || '').trim(),
    companySector: String((recipient as AudienceContact).companySector || '').trim(),
    email: String(recipient.email || '').trim(),
  };

  return template.replace(/\{\{\s*(firstName|name|fullName|company|companySector|email)\s*\}\}/g, (_match, key) => {
    return tokens[key] || '';
  });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function toAudienceCsv(contacts: AudienceContact[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [
    ['firstName', 'name', 'company', 'companySector', 'email'],
    ...contacts.map((contact) => [
      String(contact.firstName || ''),
      contact.name,
      String(contact.company || ''),
      String(contact.companySector || ''),
      contact.email,
    ]),
  ];

  return rows.map((row) => row.map((cell) => escape(cell)).join(',')).join('\n');
}

export default function AdminBenchmarkingPage() {
  const { token, user } = useAuth();
  const api = useApi(token);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [savingSetup, setSavingSetup] = useState(false);
  const [sendingMode, setSendingMode] = useState<'test' | 'campaign' | null>(null);

  const [setup, setSetup] = useState<MarketingSetup>(DEFAULT_MARKETING_SETUP);
  const [clients, setClients] = useState<Client[]>([]);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('ALL');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [manualSearch, setManualSearch] = useState('');
  const [draft, setDraft] = useState<NewsletterDraft>(EMPTY_DRAFT);

  const draftStorageKey = user ? `o7-benchmarking-draft:${user.tenantId}:${user.id}` : '';

  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<NewsletterDraft>;
      setDraft({
        subject: String(parsed.subject || ''),
        preheader: String(parsed.preheader || ''),
        body: String(parsed.body || ''),
      });
    } catch {
      // Ignore invalid local drafts.
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // Ignore storage failures.
    }
  }, [draft, draftStorageKey]);

  useEffect(() => {
    if (!token) return;
    let active = true;

    setLoading(true);
    setError(null);

    Promise.all([api<TenantSettingsPayload>('/tenant/settings'), api<Client[]>('/clients')])
      .then(([settingsPayload, clientPayload]) => {
        if (!active) return;
        setSetup(normalizeMarketingSetup(settingsPayload.settings?.marketingSetup || null));
        setClients(
          [...clientPayload].sort((a, b) => clientLabel(a).localeCompare(clientLabel(b))),
        );
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  const audienceContacts = useMemo<AudienceContact[]>(
    () =>
      clients
        .map((client) => ({
          id: client.id,
          firstName: client.firstName,
          name: client.name,
          company: client.company,
          companySector: client.companySector,
          email: String(client.email || '').trim(),
        }))
        .filter((client) => isValidEmail(client.email)),
    [clients],
  );

  const sectorOptions = useMemo(
    () =>
      [...new Set(audienceContacts.map((client) => String(client.companySector || '').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [audienceContacts],
  );

  const audienceSelection = useMemo(() => {
    if (audienceMode === 'ALL') return audienceContacts;
    if (audienceMode === 'SECTOR') {
      if (selectedSectors.length === 0) return [];
      const selected = new Set(selectedSectors);
      return audienceContacts.filter((client) => selected.has(String(client.companySector || '').trim()));
    }

    const selected = new Set(selectedClientIds);
    return audienceContacts.filter((client) => selected.has(client.id));
  }, [audienceContacts, audienceMode, selectedClientIds, selectedSectors]);

  const manualFilteredContacts = useMemo(() => {
    const query = manualSearch.trim().toLowerCase();
    if (!query) return audienceContacts;
    return audienceContacts.filter((client) => {
      const haystack = [client.firstName, client.name, client.company, client.companySector, client.email]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });
  }, [audienceContacts, manualSearch]);

  const directSendEnabled = DIRECT_SEND_PROVIDERS.has(setup.provider);
  const contactsWithoutEmail = clients.length - audienceContacts.length;

  const previewRecipient = useMemo(() => {
    if (audienceSelection[0]) {
      const current = audienceSelection[0];
      return {
        ...current,
        fullName: [current.firstName, current.name].filter(Boolean).join(' ').trim(),
      };
    }

    if (user) {
      const firstName = String(user.name || '').split(/\s+/).filter(Boolean)[0] || '';
      return {
        firstName,
        name: String(user.name || ''),
        fullName: String(user.name || ''),
        company: String(user.tenantName || ''),
        email: String(user.email || ''),
      };
    }

    return null;
  }, [audienceSelection, user]);

  const previewSubject = previewRecipient ? renderTemplate(draft.subject, previewRecipient) : draft.subject;
  const previewPreheader = previewRecipient ? renderTemplate(draft.preheader, previewRecipient) : draft.preheader;
  const previewBody = previewRecipient ? renderTemplate(draft.body, previewRecipient) : draft.body;

  const saveSetup = async () => {
    setSavingSetup(true);
    setSaveError(null);
    setSaveInfo(null);

    try {
      await api('/tenant/settings', {
        method: 'PATCH',
        body: JSON.stringify({ marketingSetup: setup }),
      });
      setSaveInfo('Connector saved for this workspace.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save connector.');
    } finally {
      setSavingSetup(false);
    }
  };

  const sendTest = async () => {
    setSendingMode('test');
    setSendError(null);
    setSendInfo(null);

    try {
      const response = await api<{ sentCount: number; testEmail: string; failed?: string[] }>('/tenant/newsletter/test', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      setSendInfo(`Test newsletter sent to ${response.testEmail}.`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unable to send test newsletter.');
    } finally {
      setSendingMode(null);
    }
  };

  const sendCampaign = async () => {
    setSendingMode('campaign');
    setSendError(null);
    setSendInfo(null);

    try {
      const response = await api<{ sentCount: number; audienceSize: number; failed?: string[] }>('/tenant/newsletter/send', {
        method: 'POST',
        body: JSON.stringify({
          clientIds: audienceSelection.map((client) => client.id),
          ...draft,
        }),
      });
      const failedCount = response.failed?.length || 0;
      setSendInfo(
        failedCount > 0
          ? `${response.sentCount}/${response.audienceSize} newsletters sent. ${failedCount} failed.`
          : `${response.sentCount} newsletters sent to the current audience.`,
      );
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unable to send newsletter.');
    } finally {
      setSendingMode(null);
    }
  };

  const downloadAudienceCsv = () => {
    if (typeof window === 'undefined' || audienceSelection.length === 0) return;
    const csv = toAudienceCsv(audienceSelection);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crm-newsletter-audience.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Benchmarking</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Build newsletter audiences from real CRM clients, save a delivery connector per workspace, and send
            campaigns without seeded benchmark data.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {loading ? <p className="text-slate-300">Loading benchmarking workspace…</p> : null}

        {!loading ? (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Workspace scope only</p>
                  <p className="mt-1 text-sm text-slate-400">
                    This screen only uses clients from the current CRM tenant. Other subscriptions stay isolated.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-slate-400">Clients with email</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{audienceContacts.length}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-slate-400">Missing email</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{contactsWithoutEmail}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-slate-400">Current audience</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{audienceSelection.length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-4">
                <div className="card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Connector</p>
                      <h2 className="mt-1 text-xl font-semibold">Mail provider setup</h2>
                      <p className="mt-2 text-sm text-slate-400">
                        Mailchimp and Brevo can be stored here for workspace comparison. Direct sending from the CRM
                        is enabled when the active provider is SMTP or Mailcow.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                      Active: {setup.provider}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-slate-300">
                      Provider
                      <select
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={setup.provider}
                        onChange={(event) =>
                          setSetup((current) => ({
                            ...current,
                            provider: event.target.value as MarketingProvider,
                          }))
                        }
                      >
                        <option value="NONE">No connector</option>
                        <option value="MAILCHIMP">Mailchimp</option>
                        <option value="BREVO">Brevo</option>
                        <option value="MAILCOW">Mailcow</option>
                        <option value="SMTP">Custom SMTP</option>
                      </select>
                    </label>

                    <label className="text-sm text-slate-300">
                      Account label
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={setup.accountLabel || ''}
                        onChange={(event) =>
                          setSetup((current) => ({
                            ...current,
                            accountLabel: event.target.value,
                          }))
                        }
                        placeholder="e.g. France outbound / Brand A"
                      />
                    </label>

                    <label className="text-sm text-slate-300">
                      From name
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={setup.fromName || ''}
                        onChange={(event) =>
                          setSetup((current) => ({
                            ...current,
                            fromName: event.target.value,
                          }))
                        }
                        placeholder="Sales / Marketing team"
                      />
                    </label>

                    <label className="text-sm text-slate-300">
                      From email
                      <input
                        type="email"
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={setup.fromEmail || ''}
                        onChange={(event) =>
                          setSetup((current) => ({
                            ...current,
                            fromEmail: event.target.value,
                          }))
                        }
                        placeholder="newsletter@company.com"
                      />
                    </label>

                    <label className="text-sm text-slate-300 md:col-span-2">
                      Reply-to email
                      <input
                        type="email"
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={setup.replyTo || ''}
                        onChange={(event) =>
                          setSetup((current) => ({
                            ...current,
                            replyTo: event.target.value,
                          }))
                        }
                        placeholder="reply@company.com"
                      />
                    </label>
                  </div>

                  {(setup.provider === 'SMTP' || setup.provider === 'MAILCOW') && (
                    <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                      <p className="text-sm font-semibold text-cyan-100">Direct-send transport</p>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <label className="text-sm text-slate-300">
                          SMTP host
                          <input
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.smtp?.host || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                smtp: {
                                  ...current.smtp,
                                  host: event.target.value,
                                },
                              }))
                            }
                            placeholder={setup.provider === 'MAILCOW' ? 'mail.yourdomain.com' : 'smtp.provider.com'}
                          />
                        </label>

                        <label className="text-sm text-slate-300">
                          SMTP port
                          <input
                            type="number"
                            min={1}
                            max={65535}
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.smtp?.port || 587}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                smtp: {
                                  ...current.smtp,
                                  port: Number(event.target.value || 587),
                                },
                              }))
                            }
                          />
                        </label>

                        <label className="text-sm text-slate-300">
                          Username
                          <input
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.smtp?.username || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                smtp: {
                                  ...current.smtp,
                                  username: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>

                        <label className="text-sm text-slate-300">
                          Password
                          <input
                            type="password"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.smtp?.password || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                smtp: {
                                  ...current.smtp,
                                  password: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>

                      <label className="mt-4 flex items-center gap-3 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/20 bg-white/5"
                          checked={Boolean(setup.smtp?.secure)}
                          onChange={(event) =>
                            setSetup((current) => ({
                              ...current,
                              smtp: {
                                ...current.smtp,
                                secure: event.target.checked,
                              },
                            }))
                          }
                        />
                        Use secure SMTP/TLS
                      </label>
                    </div>
                  )}

                  {setup.provider === 'MAILCHIMP' && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-slate-100">Mailchimp account</p>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <label className="text-sm text-slate-300">
                          API key
                          <input
                            type="password"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.mailchimp?.apiKey || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                mailchimp: {
                                  ...current.mailchimp,
                                  apiKey: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="text-sm text-slate-300">
                          Server prefix
                          <input
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.mailchimp?.serverPrefix || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                mailchimp: {
                                  ...current.mailchimp,
                                  serverPrefix: event.target.value,
                                },
                              }))
                            }
                            placeholder="us1"
                          />
                        </label>
                        <label className="text-sm text-slate-300 md:col-span-2">
                          Audience ID
                          <input
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.mailchimp?.audienceId || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                mailchimp: {
                                  ...current.mailchimp,
                                  audienceId: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {setup.provider === 'BREVO' && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-slate-100">Brevo account</p>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <label className="text-sm text-slate-300 md:col-span-2">
                          API key
                          <input
                            type="password"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.brevo?.apiKey || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                brevo: {
                                  ...current.brevo,
                                  apiKey: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="text-sm text-slate-300">
                          Sender email
                          <input
                            type="email"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.brevo?.senderEmail || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                brevo: {
                                  ...current.brevo,
                                  senderEmail: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="text-sm text-slate-300">
                          Sender name
                          <input
                            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            value={setup.brevo?.senderName || ''}
                            onChange={(event) =>
                              setSetup((current) => ({
                                ...current,
                                brevo: {
                                  ...current.brevo,
                                  senderName: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button className="btn-primary" type="button" onClick={saveSetup} disabled={savingSetup}>
                      {savingSetup ? 'Saving…' : 'Save connector'}
                    </button>
                    <div className="text-xs text-slate-500">
                      Direct send: {directSendEnabled ? 'enabled' : 'disabled'} for the current provider
                    </div>
                  </div>
                  {saveInfo ? <p className="mt-3 text-sm text-emerald-200">{saveInfo}</p> : null}
                  {saveError ? <p className="mt-3 text-sm text-red-200">{saveError}</p> : null}
                </div>

                <div className="card p-5">
                  <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Audience</p>
                  <h2 className="mt-1 text-xl font-semibold">CRM recipient builder</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Audience is computed only from real client records that already exist in this workspace.
                  </p>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {([
                      ['ALL', `All emailable clients (${audienceContacts.length})`],
                      ['SECTOR', `By sector (${sectorOptions.length})`],
                      ['MANUAL', 'Manual selection'],
                    ] as Array<[AudienceMode, string]>).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        className={[
                          'rounded-xl border px-3 py-3 text-left text-sm transition',
                          audienceMode === mode
                            ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                        ].join(' ')}
                        onClick={() => setAudienceMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {audienceMode === 'SECTOR' ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {sectorOptions.length === 0 ? (
                        <p className="text-sm text-slate-500">No sector data is available on current CRM clients.</p>
                      ) : (
                        sectorOptions.map((sector) => {
                          const active = selectedSectors.includes(sector);
                          return (
                            <button
                              key={sector}
                              type="button"
                              className={[
                                'rounded-full border px-3 py-2 text-sm transition',
                                active
                                  ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                              ].join(' ')}
                              onClick={() =>
                                setSelectedSectors((current) =>
                                  current.includes(sector) ? current.filter((value) => value !== sector) : [...current, sector],
                                )
                              }
                            >
                              {sector}
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}

                  {audienceMode === 'MANUAL' ? (
                    <div className="mt-4">
                      <input
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        placeholder="Filter contacts by name, company, sector, or email"
                        value={manualSearch}
                        onChange={(event) => setManualSearch(event.target.value)}
                      />
                      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                        {manualFilteredContacts.map((client) => {
                          const checked = selectedClientIds.includes(client.id);
                          return (
                            <label
                              key={client.id}
                              className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  setSelectedClientIds((current) =>
                                    event.target.checked ? [...current, client.id] : current.filter((value) => value !== client.id),
                                  )
                                }
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-100">{clientLabel(client)}</p>
                                <p className="truncate text-xs text-slate-400">{client.email}</p>
                                {client.companySector ? <p className="mt-1 text-xs text-slate-500">{client.companySector}</p> : null}
                              </div>
                            </label>
                          );
                        })}
                        {manualFilteredContacts.length === 0 ? (
                          <p className="text-sm text-slate-500">No contacts match the current filter.</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">Current audience</p>
                        <p className="mt-1 text-sm text-slate-400">{audienceSelection.length} recipients selected</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={downloadAudienceCsv}
                        disabled={audienceSelection.length === 0}
                      >
                        Export CSV
                      </button>
                    </div>

                    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                      {audienceSelection.map((client) => (
                        <div key={client.id} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm">
                          <p className="truncate text-slate-100">{clientLabel(client)}</p>
                          <p className="truncate text-xs text-slate-400">{client.email}</p>
                        </div>
                      ))}
                      {audienceSelection.length === 0 ? (
                        <p className="text-sm text-slate-500">No recipients in the current audience.</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="card p-5">
                  <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Newsletter</p>
                  <h2 className="mt-1 text-xl font-semibold">Campaign composer</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Use plain text with CRM placeholders such as <span className="font-mono">{'{{firstName}}'}</span>,{' '}
                    <span className="font-mono">{'{{company}}'}</span>, <span className="font-mono">{'{{companySector}}'}</span>,{' '}
                    and <span className="font-mono">{'{{email}}'}</span>.
                  </p>

                  <div className="mt-5 grid gap-4">
                    <label className="text-sm text-slate-300">
                      Subject
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={draft.subject}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            subject: event.target.value,
                          }))
                        }
                        placeholder="Quarterly update for {{company}}"
                      />
                    </label>

                    <label className="text-sm text-slate-300">
                      Preheader
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={draft.preheader}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            preheader: event.target.value,
                          }))
                        }
                        placeholder="Short preview shown in inboxes"
                      />
                    </label>

                    <label className="text-sm text-slate-300">
                      Body
                      <textarea
                        className="mt-2 min-h-[240px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm"
                        value={draft.body}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            body: event.target.value,
                          }))
                        }
                        placeholder={`Hello {{firstName}},\n\nWe are sharing this month’s update for {{company}}.\n\nBest regards,\n{{company}} team`}
                      />
                    </label>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      className="btn-secondary text-sm"
                      type="button"
                      onClick={sendTest}
                      disabled={!directSendEnabled || !draft.subject.trim() || !draft.body.trim() || sendingMode !== null}
                    >
                      {sendingMode === 'test' ? 'Sending test…' : `Send test${user?.email ? ` to ${user.email}` : ''}`}
                    </button>
                    <button
                      className="btn-primary text-sm"
                      type="button"
                      onClick={sendCampaign}
                      disabled={
                        !directSendEnabled ||
                        audienceSelection.length === 0 ||
                        !draft.subject.trim() ||
                        !draft.body.trim() ||
                        sendingMode !== null
                      }
                    >
                      {sendingMode === 'campaign'
                        ? 'Sending newsletter…'
                        : `Send newsletter (${audienceSelection.length})`}
                    </button>
                    {!directSendEnabled ? (
                      <p className="text-xs text-amber-200">
                        Save an SMTP or Mailcow connector to send directly from the CRM. Mailchimp/Brevo can still
                        use the exported audience.
                      </p>
                    ) : null}
                  </div>

                  {sendInfo ? <p className="mt-3 text-sm text-emerald-200">{sendInfo}</p> : null}
                  {sendError ? <p className="mt-3 text-sm text-red-200">{sendError}</p> : null}
                </div>

                <div className="card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Preview</p>
                      <h2 className="mt-1 text-xl font-semibold">Live rendering</h2>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                      {previewRecipient ? (previewRecipient.fullName || previewRecipient.email || 'Preview contact') : 'No preview contact'}
                    </div>
                  </div>

                  <div className="mt-5 rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(21,29,50,0.96),rgba(11,16,33,0.96))] p-6 shadow-[0_24px_80px_rgba(2,8,23,0.38)]">
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Subject</p>
                      <p className="mt-1 text-lg font-semibold text-slate-100">{previewSubject || 'No subject yet'}</p>
                      {previewPreheader ? <p className="mt-2 text-sm text-slate-400">{previewPreheader}</p> : null}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                        {previewBody || 'Newsletter body preview will appear here.'}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </Guard>
  );
}
