'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { CLIENT_FUNCTION_OPTIONS, getClientDisplayName } from '@/lib/clients';
import { detectCsvDelimiter, normalizeCsvHeader, parseCsv } from '@/lib/csv';

type Client = {
  id: string;
  firstName?: string | null;
  name: string;
  function?: string | null;
  companySector?: string | null;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  createdAt: string;
};

type ClientDetails = {
  id: string;
  firstName?: string | null;
  name: string;
  function?: string | null;
  companySector?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  address?: string | null;
  taxId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientCreatePayload = {
  firstName?: string;
  name: string;
  function?: string;
  companySector?: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  address?: string;
  taxId?: string;
  notes?: string;
};

type ClientImportItem = { row: number; payload: ClientCreatePayload };

function toOptionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

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

export default function ClientsPage() {
  const { t } = useI18n();

  return (
    <Guard>
      <AppShell>
        <Suspense fallback={<div className="mt-6 text-slate-300">{t('clients.loading')}</div>}>
          <ClientsPageContent />
        </Suspense>
      </AppShell>
    </Guard>
  );
}

function ClientsPageContent() {
  const { token } = useAuth();
  const api = useApi(token);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const detailsClientId = searchParams.get('clientId');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [detailsClient, setDetailsClient] = useState<ClientDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSuccess, setDetailsSuccess] = useState<string | null>(null);
  const [detailsForm, setDetailsForm] = useState<{
    firstName: string;
    name: string;
    clientFunction: string;
    companySector: string;
    email: string;
    company: string;
    phone: string;
    website: string;
    taxId: string;
    address: string;
    notes: string;
  }>({
    firstName: '',
    name: '',
    clientFunction: '',
    companySector: '',
    email: '',
    company: '',
    phone: '',
    website: '',
    taxId: '',
    address: '',
    notes: '',
  });

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importItems, setImportItems] = useState<ClientImportItem[]>([]);
  const [importSkipped, setImportSkipped] = useState<{ row: number; reason: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; failed: number; errors: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const exportFilename = useMemo(() => {
    const d = new Date();
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `clients-${y}-${m}-${day}.csv`;
  }, []);

  const fetchClients = useCallback(() => {
    setActionMessage(null);
    api<Client[]>('/clients')
      .then(setClients)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!token) return;
    fetchClients();
  }, [token, fetchClients]);

  const handleCreate = async (payload: Partial<Client>) => {
    setError(null);
    try {
      await api('/clients', { method: 'POST', body: JSON.stringify(payload) });
      fetchClients();
    } catch (err) {
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    await api(`/clients/${id}`, { method: 'DELETE' });
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    setError(null);
    setActionMessage(null);
    try {
      const csv = await api<string>('/export/clients');
      downloadCsv(csv, exportFilename);
      setActionMessage(t('clients.exported', { filename: exportFilename }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to export clients';
      setError(message);
    }
  };

  const detailsDisplayName = useMemo(() => {
    return detailsClient ? getClientDisplayName(detailsClient) : t('clients.details.section');
  }, [detailsClient, t]);

  const closeDetails = useCallback(() => {
    if (detailsSaving) return;
    router.push('/clients');
  }, [detailsSaving, router]);

  const loadClientDetails = useCallback(
    async (clientId: string) => {
      setDetailsLoading(true);
      setDetailsError(null);
      setDetailsSuccess(null);
      try {
        const data = await api<ClientDetails>(`/clients/${clientId}`);
        setDetailsClient(data);
        setDetailsForm({
          firstName: data.firstName ?? '',
          name: data.name ?? '',
          clientFunction: data.function ?? '',
          companySector: data.companySector ?? '',
          email: data.email ?? '',
          company: data.company ?? '',
          phone: data.phone ?? '',
          website: data.website ?? '',
          taxId: data.taxId ?? '',
          address: data.address ?? '',
          notes: data.notes ?? '',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load client';
        setDetailsError(message);
        setDetailsClient(null);
      } finally {
        setDetailsLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!token) return;
    if (!detailsClientId) {
      setDetailsClient(null);
      setDetailsError(null);
      setDetailsSuccess(null);
      return;
    }
    loadClientDetails(detailsClientId);
  }, [detailsClientId, loadClientDetails, token]);

  const handleSaveDetails = useCallback(async () => {
    if (!detailsClientId) return;
    setDetailsSaving(true);
    setDetailsError(null);
    setDetailsSuccess(null);
    try {
      const nextName = detailsForm.name.trim();
      if (!nextName) throw new Error(t('clients.nameRequired'));

      const updated = await api<ClientDetails>(`/clients/${detailsClientId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: toOptionalTrimmed(detailsForm.firstName),
          name: nextName,
          function: toOptionalTrimmed(detailsForm.clientFunction),
          companySector: toOptionalTrimmed(detailsForm.companySector),
          email: toOptionalTrimmed(detailsForm.email),
          company: toOptionalTrimmed(detailsForm.company),
          phone: toOptionalTrimmed(detailsForm.phone),
          website: toOptionalTrimmed(detailsForm.website),
          taxId: toOptionalTrimmed(detailsForm.taxId),
          address: toOptionalTrimmed(detailsForm.address),
          notes: toOptionalTrimmed(detailsForm.notes),
        }),
      });
      setDetailsClient(updated);
      setDetailsSuccess(t('common.saved'));
      fetchClients();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save client';
      setDetailsError(message);
    } finally {
      setDetailsSaving(false);
    }
  }, [api, detailsClientId, detailsForm, fetchClients, t]);

  const handleDeleteDetails = useCallback(async () => {
    if (!detailsClientId) return;
    const ok = confirm(t('clients.confirmDelete'));
    if (!ok) return;
    setDetailsSaving(true);
    setDetailsError(null);
    setDetailsSuccess(null);
    try {
      await api(`/clients/${detailsClientId}`, { method: 'DELETE' });
      setClients((prev) => prev.filter((c) => c.id !== detailsClientId));
      closeDetails();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete client';
      setDetailsError(message);
    } finally {
      setDetailsSaving(false);
    }
  }, [api, closeDetails, detailsClientId, t]);

  const resetImportState = () => {
    setImportFileName('');
    setImportParseError(null);
    setImportItems([]);
    setImportSkipped([]);
    setImporting(false);
    setImportProgress(null);
    setImportResult(null);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const parseClientsCsv = (csvText: string): { items: ClientImportItem[]; skipped: { row: number; reason: string }[] } => {
    const delimiter = detectCsvDelimiter(csvText);
    const rows = parseCsv(csvText, delimiter).filter((r) => r.some((cell) => (cell ?? '').trim().length > 0));
    if (rows.length === 0) throw new Error('CSV is empty');

    const headersRaw = rows[0].map((h) => (h ?? '').trim());
    const headers = headersRaw.map(normalizeCsvHeader);

    const headerToField: Record<string, keyof ClientCreatePayload> = {
      firstname: 'firstName',
      prenom: 'firstName',
      givenname: 'firstName',

      name: 'name',
      lastname: 'name',
      surname: 'name',
      familyname: 'name',
      nom: 'name',
      fullname: 'name',
      nomcomplet: 'name',

      function: 'function',
      role: 'function',
      title: 'function',
      position: 'function',
      fonction: 'function',

      companysector: 'companySector',
      sector: 'companySector',
      industry: 'companySector',
      secteur: 'companySector',
      secteurdactivite: 'companySector',
      secteuractivite: 'companySector',
      companyindustry: 'companySector',

      email: 'email',
      mail: 'email',
      courriel: 'email',

      phone: 'phone',
      tel: 'phone',
      telephone: 'phone',
      mobile: 'phone',

      company: 'company',
      entreprise: 'company',
      societe: 'company',
      organization: 'company',
      organisation: 'company',

      website: 'website',
      web: 'website',
      url: 'website',
      site: 'website',

      address: 'address',
      adresse: 'address',

      taxid: 'taxId',
      rfc: 'taxId',
      vat: 'taxId',
      tva: 'taxId',
      siret: 'taxId',
      nif: 'taxId',

      notes: 'notes',
      note: 'notes',
      comment: 'notes',
      comments: 'notes',
      commentaire: 'notes',
    };

    const items: ClientImportItem[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const payload: Partial<ClientCreatePayload> = {};

      for (let c = 0; c < headers.length; c++) {
        const h = headers[c];
        const fieldKey = headerToField[h];
        if (!fieldKey) continue;
        const value = (row[c] ?? '').trim();
        if (!value) continue;
        (payload as Record<string, string>)[fieldKey] = value;
      }

      if (!payload.name && payload.firstName) {
        payload.name = payload.firstName;
        delete payload.firstName;
      }

      if (!payload.name || !payload.name.trim()) {
        skipped.push({ row: i + 1, reason: 'Missing Name' });
        continue;
      }

      items.push({ row: i + 1, payload: payload as ClientCreatePayload });
    }

    if (items.length === 0) {
      throw new Error('No importable rows found. Make sure you have a header row and a Name column.');
    }

    return { items, skipped };
  };

  const handleChooseImportFile = () => {
    setImportParseError(null);
    setImportResult(null);
    importInputRef.current?.click();
  };

  const handleImportFileSelected = async (file: File) => {
    setImportParseError(null);
    setImportResult(null);
    setImportProgress(null);
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseClientsCsv(text);
      setImportItems(parsed.items);
      setImportSkipped(parsed.skipped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to parse CSV';
      setImportItems([]);
      setImportSkipped([]);
      setImportParseError(message);
    }
  };

  const handleImport = async () => {
    if (importItems.length === 0) return;
    setError(null);
    setImporting(true);
    setImportResult(null);
    setImportProgress({ done: 0, total: importItems.length });

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < importItems.length; i++) {
      const item = importItems[i];
      try {
        await api('/clients', { method: 'POST', body: JSON.stringify(item.payload) });
        created += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Unable to create client';
        errors.push(`Row ${item.row}: ${message}`);
      } finally {
        setImportProgress({ done: i + 1, total: importItems.length });
      }
    }

    setImportResult({ created, failed, errors });
    setImporting(false);
    fetchClients();
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('clients.section')}</p>
          <h1 className="text-3xl font-semibold">{t('nav.clients')}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-sm" onClick={handleExportCsv}>
            {t('clients.exportCsv')}
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={() => {
              setImportOpen(true);
              resetImportState();
            }}
          >
            {t('clients.importCsv')}
          </button>
        </div>
      </div>

      <ClientForm onSubmit={handleCreate} />

      {loading && <div className="mt-6 text-slate-300">{t('clients.loading')}</div>}
      {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}
      {actionMessage && (
        <div className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-200">{actionMessage}</div>
      )}

      <div className="mt-6 space-y-3">
        {clients.map((client) => (
          <div
            key={client.id}
            className="card flex cursor-pointer flex-col gap-2 p-4 transition hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between"
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/clients?clientId=${encodeURIComponent(client.id)}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(`/clients?clientId=${encodeURIComponent(client.id)}`);
              }
            }}
          >
            <div>
              <p className="text-lg font-semibold">{getClientDisplayName(client)}</p>
              <p className="text-sm text-slate-400">
                {client.email || '—'} · {client.company || t('clients.noCompany')}
                {client.companySector ? ` · ${client.companySector}` : ''}
                {client.function ? ` · ${client.function}` : ''}
                {client.taxId ? ` · ${t('clients.taxId')}: ${client.taxId}` : ''}
              </p>
              {client.website ? <p className="text-xs text-slate-500">{client.website}</p> : null}
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(client.id);
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
        {clients.length === 0 && !loading && (
          <p className="text-sm text-slate-400">{t('clients.empty')}</p>
        )}
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card w-full max-w-xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t('clients.importModal.title')}</h2>
              <button
                className="text-slate-400"
                onClick={() => {
                  if (importing) return;
                  setImportOpen(false);
                }}
                title={importing ? t('clients.importModal.inProgress') : t('common.close')}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  handleImportFileSelected(file);
                }}
              />

              <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4">
                <p className="text-sm text-slate-300">{t('clients.importModal.chooseFile')}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('clients.importModal.headersHint')}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-300">{importFileName || t('clients.importModal.noFileChosen')}</p>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={handleChooseImportFile}
                    disabled={importing}
                  >
                    {t('clients.importModal.selectFile')}
                  </button>
                </div>
              </div>

              {importParseError ? (
                <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{importParseError}</div>
              ) : null}

              {importItems.length > 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-300">
                      {t('clients.importModal.readyToImport')}{' '}
                      <span className="font-semibold text-slate-100">{importItems.length}</span> {t('clients.importModal.clients')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {importSkipped.length
                        ? t('clients.importModal.skipped', { count: importSkipped.length })
                        : t('clients.importModal.noSkipped')}
                    </p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {importItems.slice(0, 5).map((it, idx) => {
                      const p = it.payload;
                      return (
                        <div
                          key={`${it.row}-${idx}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-semibold">
                              {getClientDisplayName({ firstName: p.firstName, name: p.name })}
                            </p>
                            <p className="text-xs text-slate-400">
                              {p.email || '—'}
                              {p.company ? ` · ${p.company}` : ''}
                              {p.companySector ? ` · ${p.companySector}` : ''}
                              {p.function ? ` · ${p.function}` : ''}
                            </p>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {t('common.row')} {it.row}
                          </p>
                        </div>
                      );
                    })}
                    {importItems.length > 5 ? (
                      <p className="text-xs text-slate-500">{t('clients.importModal.showingFirst', { count: 5 })}</p>
                    ) : null}
                  </div>

                  {importProgress ? (
                    <p className="mt-3 text-xs text-slate-400">
                      {t('clients.importModal.importing', {
                        done: importProgress.done,
                        total: importProgress.total,
                      })}
                    </p>
                  ) : null}

                  {importResult ? (
                    <div className="mt-3 space-y-2">
                      <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                        {t('clients.importModal.imported', {
                          created: importResult.created,
                          failed: importResult.failed,
                        })}
                      </div>
                      {importResult.errors.length ? (
                        <details className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                          <summary className="cursor-pointer text-slate-200">{t('clients.importModal.seeErrors')}</summary>
                          <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
                            {importResult.errors.slice(0, 50).map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                          {importResult.errors.length > 50 ? (
                            <p className="mt-2 text-xs text-slate-500">{t('clients.importModal.showingFirstErrors')}</p>
                          ) : null}
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {importSkipped.length ? (
                <details className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                  <summary className="cursor-pointer text-slate-200">{t('clients.importModal.skippedRows')}</summary>
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
                    {importSkipped.slice(0, 50).map((s, i) => (
                      <li key={i}>
                        {t('common.row')} {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                  {importSkipped.length > 50 ? (
                    <p className="mt-2 text-xs text-slate-500">{t('clients.importModal.showingFirstSkipped')}</p>
                  ) : null}
                </details>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (importing) return;
                    setImportOpen(false);
                  }}
                  disabled={importing}
                >
                  {t('common.close')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleImport}
                  disabled={importing || importItems.length === 0}
                >
                  {importing ? t('clients.importModal.importingButton') : t('clients.importModal.importButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailsClientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card w-full max-w-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('clients.details.section')}</p>
                <h2 className="text-xl font-semibold">{detailsDisplayName}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => loadClientDetails(detailsClientId)}
                  disabled={detailsLoading || detailsSaving}
                >
                  {t('common.refresh')}
                </button>
                <button
                  className="text-slate-400"
                  onClick={closeDetails}
                  title={detailsSaving ? t('clients.details.savingInProgress') : t('common.close')}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {detailsLoading && <p className="text-slate-300">{t('clients.details.loading')}</p>}
              {detailsError && (
                <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{detailsError}</div>
              )}
              {detailsSuccess && (
                <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{detailsSuccess}</div>
              )}

              {!detailsLoading && detailsClient && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block text-sm text-slate-300">
                      {t('field.firstName')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.firstName}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, firstName: e.target.value }))}
                        autoComplete="given-name"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.name')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.name}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, name: e.target.value }))}
                        required
                        autoComplete="family-name"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.function')}
                      <select
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.clientFunction}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, clientFunction: e.target.value }))}
                      >
                        <option value="">{t('clients.selectFunction')}</option>
                        {CLIENT_FUNCTION_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.companySector')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.companySector}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, companySector: e.target.value }))}
                        placeholder={t('clients.companySectorPlaceholder')}
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.email')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.email}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, email: e.target.value }))}
                        type="email"
                        autoComplete="email"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.company')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.company}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, company: e.target.value }))}
                        autoComplete="organization"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.phone')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.phone}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, phone: e.target.value }))}
                        autoComplete="tel"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.website')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.website}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, website: e.target.value }))}
                        placeholder="https://example.com"
                        autoComplete="url"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      {t('field.taxId')}
                      <input
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.taxId}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, taxId: e.target.value }))}
                      />
                    </label>
                    <div />
                    <label className="block text-sm text-slate-300 md:col-span-2">
                      {t('field.address')}
                      <textarea
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.address}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, address: e.target.value }))}
                        rows={3}
                        placeholder={t('clients.addressPlaceholder')}
                      />
                    </label>
                    <label className="block text-sm text-slate-300 md:col-span-2">
                      {t('field.notes')}
                      <textarea
                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={detailsForm.notes}
                        onChange={(e) => setDetailsForm((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={4}
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">
                      <p>
                        {t('common.created')}: {new Date(detailsClient.createdAt).toLocaleString()}
                      </p>
                      <p>
                        {t('common.updated')}: {new Date(detailsClient.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                        onClick={handleDeleteDetails}
                        disabled={detailsSaving}
                      >
                        {t('common.delete')}
                      </button>
                      <button className="btn-primary" onClick={handleSaveDetails} disabled={detailsSaving}>
                        {detailsSaving ? t('common.saving') : t('common.save')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button type="button" className="btn-secondary" onClick={closeDetails} disabled={detailsSaving}>
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ClientForm({ onSubmit }: { onSubmit: (payload: Partial<Client>) => Promise<void> }) {
  const { t } = useI18n();
  const [firstName, setFirstName] = useState('');
  const [name, setName] = useState('');
  const [clientFunction, setClientFunction] = useState('');
  const [companySector, setCompanySector] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const optional = (value: string) => {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
      };

      await onSubmit({
        firstName: optional(firstName),
        name: name.trim(),
        function: optional(clientFunction),
        companySector: optional(companySector),
        email: optional(email),
        company: optional(company),
        phone: optional(phone),
        website: optional(website),
        address: optional(address),
        taxId: optional(taxId),
        notes: optional(notes),
      });
      setFirstName('');
      setName('');
      setClientFunction('');
      setCompanySector('');
      setEmail('');
      setCompany('');
      setPhone('');
      setWebsite('');
      setAddress('');
      setTaxId('');
      setNotes('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save client';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-3 p-4 md:grid-cols-2">
      <div>
        <label className="text-sm text-slate-300">{t('field.firstName')}</label>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          autoComplete="given-name"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.name')}</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          autoComplete="family-name"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.function')}</label>
        <select
          value={clientFunction}
          onChange={(e) => setClientFunction(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">{t('clients.selectFunction')}</option>
          {CLIENT_FUNCTION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.companySector')}</label>
        <input
          value={companySector}
          onChange={(e) => setCompanySector(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          placeholder={t('clients.companySectorPlaceholder')}
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.email')}</label>
        <input
          value={email}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.includes('<') || raw.includes('>')) {
              const parsed = parseContactLine(raw);
              if (parsed.email) setEmail(parsed.email);
              else setEmail(raw);
              if (parsed.name && !firstName.trim() && !name.trim()) {
                const parts = parsed.name.split(/\s+/).filter(Boolean);
                if (parts.length >= 2) {
                  setFirstName(parts[0]);
                  setName(parts.slice(1).join(' '));
                } else {
                  setName(parsed.name);
                }
              } else if (parsed.name && !name.trim()) {
                setName(parsed.name);
              }
              return;
            }
            setEmail(raw);
          }}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          type="email"
          autoComplete="email"
        />
        <p className="mt-1 text-xs text-slate-500">
          {t('clients.emailTip')}{' '}
          <span className="font-mono">
            Name {'<'}email@domain{'>'}
          </span>{' '}
          {t('clients.emailTipEnd')}
        </p>
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.company')}</label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          autoComplete="organization"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.phone')}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          autoComplete="tel"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.website')}</label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          placeholder="https://example.com"
          autoComplete="url"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.taxId')}</label>
        <input
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">{t('field.address')}</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          placeholder={t('clients.addressPlaceholder')}
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">{t('field.notes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      {formError ? (
        <div className="md:col-span-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{formError}</div>
      ) : null}
      <div className="md:col-span-2 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t('common.saving') : t('clients.add')}
        </button>
      </div>
    </form>
  );
}
