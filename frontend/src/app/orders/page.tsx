'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { getClientDisplayName } from '../../lib/clients';
import { detectCsvDelimiter, normalizeCsvHeader, parseCsv } from '../../lib/csv';

type DashboardPayload = {
  leads: {
    open: number;
    total: number;
  };
};

type Client = {
  id: string;
  firstName?: string | null;
  name?: string | null;
};

type Pipeline = {
  id: string;
  name: string;
  isDefault?: boolean;
};

type Stage = {
  id: string;
  name: string;
  status: 'OPEN' | 'WON' | 'LOST';
  pipelineId: string;
  position: number;
};

type Invoice = {
  id: string;
  amount: number | string;
  currency: string;
  status: string;
  createdAt: string;
  issuedDate?: string | null;
  dueDate?: string | null;
  client?: Client | null;
};

type Deal = {
  id: string;
  title: string;
  value: number | string;
  currency: string;
  expectedCloseDate?: string | null;
  createdAt?: string;
  stage?: { id: string; name: string; status: 'OPEN' | 'WON' | 'LOST' } | null;
  client?: Client | null;
};

type DealCreatePayload = {
  title: string;
  value: number;
  currency: string;
  pipelineId: string;
  stageId?: string;
  clientId?: string;
  expectedCloseDate?: string;
};

type DealImportItem = {
  row: number;
  payload: DealCreatePayload;
  preview: {
    clientLabel: string;
    pipelineLabel: string;
    stageLabel: string;
    amountLabel: string;
  };
  warnings: string[];
};

const MONEY = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export default function OrdersPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t, language } = useI18n();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importItems, setImportItems] = useState<DealImportItem[]>([]);
  const [importSkipped, setImportSkipped] = useState<{ row: number; reason: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; failed: number; errors: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const defaultPipeline = useMemo(() => {
    return pipelines.find((p) => p.isDefault) || pipelines[0] || null;
  }, [pipelines]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, invoicesData, dealsData, clientsData, pipelinesData, stagesData] = await Promise.all([
        api<DashboardPayload>('/dashboard'),
        api<Invoice[]>('/invoices'),
        api<Deal[]>('/deals'),
        api<Client[]>('/clients'),
        api<Pipeline[]>('/pipelines'),
        api<Stage[]>('/stages'),
      ]);
      setDashboard(dashboardData);
      setInvoices(invoicesData);
      setDeals(dealsData);
      setClients(clientsData);
      setPipelines(pipelinesData);
      setStages(stagesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load orders data');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!token) return;
    void loadData();
  }, [loadData, token]);

  const pendingPayments = useMemo(() => {
    const paidPattern = /(paid|settled|payed|paye|pagado|pagada|pagado)/i;
    return invoices.filter((invoice) => !paidPattern.test(invoice.status || '')).length;
  }, [invoices]);

  const invoiceExposure = useMemo(() => {
    const totals = invoices.reduce<Record<string, number>>((acc, invoice) => {
      const currency = String(invoice.currency || 'USD').toUpperCase();
      const amount = Number(invoice.amount || 0);
      if (!Number.isFinite(amount)) return acc;
      acc[currency] = (acc[currency] || 0) + amount;
      return acc;
    }, {});

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([currency, total]) => `${currency} ${MONEY.format(total)}`)
      .join(' · ');
  }, [invoices]);

  const listedDeals = useMemo(
    () =>
      [...deals].sort((a, b) => {
        const aDate = a.createdAt ? +new Date(a.createdAt) : 0;
        const bDate = b.createdAt ? +new Date(b.createdAt) : 0;
        return bDate - aDate;
      }),
    [deals],
  );

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString(language);
  };

  const downloadExcelCsv = () => {
    if (listedDeals.length === 0) return;

    const headers = [
      t('orders.table.id'),
      t('orders.table.title'),
      t('orders.table.client'),
      t('orders.table.amount'),
      t('orders.table.currency'),
      t('orders.table.status'),
      t('orders.table.stage'),
      t('orders.table.closingDate'),
      t('orders.table.createdAt'),
    ];

    const escapeCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = listedDeals.map((deal) => [
      deal.id,
      deal.title || '',
      deal.client ? getClientDisplayName(deal.client) : t('invoices.unassigned'),
      Number(deal.value || 0).toFixed(2),
      String(deal.currency || 'USD').toUpperCase(),
      deal.stage?.status ? t(`stageStatus.${deal.stage.status}`) : '',
      deal.stage?.name || '',
      formatDate(deal.expectedCloseDate),
      formatDate(deal.createdAt),
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orders-${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetImportState = useCallback(() => {
    setImportFileName('');
    setImportParseError(null);
    setImportItems([]);
    setImportSkipped([]);
    setImporting(false);
    setImportProgress(null);
    setImportResult(null);
    if (importInputRef.current) importInputRef.current.value = '';
  }, []);

  const handleChooseImportFile = useCallback(() => {
    setImportParseError(null);
    setImportResult(null);
    importInputRef.current?.click();
  }, []);

  const handleImportFileSelected = useCallback(
    async (file: File) => {
      setImportParseError(null);
      setImportResult(null);
      setImportProgress(null);
      setImportFileName(file.name);
      try {
        const text = await file.text();
        const parsed = parseOrdersCsv(text, {
          language,
          defaultPipeline,
          pipelines,
          stages,
          clients,
        });
        setImportItems(parsed.items);
        setImportSkipped(parsed.skipped);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to parse CSV';
        setImportItems([]);
        setImportSkipped([]);
        setImportParseError(message);
      }
    },
    [clients, defaultPipeline, language, pipelines, stages],
  );

  const handleImport = useCallback(async () => {
    if (importItems.length === 0) return;
    setImporting(true);
    setImportProgress({ done: 0, total: importItems.length });
    setImportResult(null);
    setError(null);

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < importItems.length; i++) {
      const item = importItems[i];
      try {
        await api('/deals', {
          method: 'POST',
          body: JSON.stringify(item.payload),
        });
        created += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Unable to create order';
        errors.push(`Row ${item.row}: ${message}`);
      } finally {
        setImportProgress({ done: i + 1, total: importItems.length });
      }
    }

    setImportResult({ created, failed, errors });
    setImporting(false);
    await loadData();
  }, [api, importItems, loadData]);

  return (
    <Guard>
      <AppShell>
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('orders.section')}</p>
          <h1 className="text-3xl font-semibold">{t('nav.orders')}</h1>
          <p className="text-sm text-slate-400">{t('orders.subtitle')}</p>
        </div>

        {loading ? <p className="text-slate-300">{t('common.loading')}</p> : null}
        {error ? (
          <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {t('common.error')}: {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard title={t('orders.openDeals')} value={String(dashboard?.leads.open ?? 0)} />
          <MetricCard title={t('orders.totalDeals')} value={String(dashboard?.leads.total ?? 0)} />
          <MetricCard title={t('orders.pendingPayments')} value={String(pendingPayments)} />
          <MetricCard title={t('orders.totalInvoices')} value={String(invoices.length)} />
          <MetricCard title={t('orders.currencyExposure')} value={invoiceExposure || '—'} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ActionCard
            title={t('orders.card.orders.title')}
            description={t('orders.card.orders.description')}
            action={t('orders.card.orders.action')}
            href="/crm"
          />
          <ActionCard
            title={t('orders.card.payments.title')}
            description={t('orders.card.payments.description')}
            action={t('orders.card.payments.action')}
            href="/admin/ocr-scan"
          />
          <ActionCard
            title={t('orders.card.invoices.title')}
            description={t('orders.card.invoices.description')}
            action={t('orders.card.invoices.action')}
            href="/export"
          />
        </div>

        <div className="card mt-6 p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('orders.invoicesTitle')}</h2>
              <p className="text-xs text-slate-400">{t('orders.listCount', { count: listedDeals.length })}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="btn-secondary text-sm"
                type="button"
                onClick={() => {
                  setImportOpen(true);
                  resetImportState();
                }}
              >
                {t('orders.importCsv')}
              </button>
              <button className="btn-primary text-sm" onClick={downloadExcelCsv} disabled={listedDeals.length === 0}>
                {t('orders.exportExcel')}
              </button>
              <Link href="/crm" className="text-xs text-cyan-300 underline">
                {t('common.viewAll')}
              </Link>
            </div>
          </div>
          {listedDeals.length === 0 ? (
            <p className="text-sm text-slate-400">{t('orders.noOrders')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2 text-left">{t('orders.table.id')}</th>
                    <th className="pb-2 text-left">{t('orders.table.title')}</th>
                    <th className="pb-2 text-left">{t('orders.table.client')}</th>
                    <th className="pb-2 text-right">{t('orders.table.amount')}</th>
                    <th className="pb-2 text-left">{t('orders.table.status')}</th>
                    <th className="pb-2 text-left">{t('orders.table.stage')}</th>
                    <th className="pb-2 text-left">{t('orders.table.closingDate')}</th>
                    <th className="pb-2 text-left">{t('orders.table.createdAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {listedDeals.map((deal) => (
                    <tr key={deal.id} className="border-t border-white/5">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-300">{deal.id.slice(0, 8)}</td>
                      <td className="py-2 pr-3 text-left text-slate-200">{deal.title || '—'}</td>
                      <td className="py-2 pr-3 text-left text-slate-200">
                        {deal.client ? getClientDisplayName(deal.client) : t('invoices.unassigned')}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {String(deal.currency || 'USD').toUpperCase()} {MONEY.format(Number(deal.value || 0))}
                      </td>
                      <td className="py-2 pr-3 text-left">
                        <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-xs text-emerald-200">
                          {deal.stage?.status ? t(`stageStatus.${deal.stage.status}`) : '—'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-left text-slate-300">{deal.stage?.name || '—'}</td>
                      <td className="py-2 pr-3 text-left text-slate-300">{formatDate(deal.expectedCloseDate)}</td>
                      <td className="py-2 text-left text-slate-300">{formatDate(deal.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {importOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="card w-full max-w-xl p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{t('orders.importModal.title')}</h2>
                <button
                  className="text-slate-400"
                  type="button"
                  onClick={() => {
                    if (importing) return;
                    setImportOpen(false);
                  }}
                  title={importing ? t('orders.importModal.inProgress') : t('common.close')}
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
                    void handleImportFileSelected(file);
                  }}
                />

                <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4">
                  <p className="text-sm text-slate-300">{t('orders.importModal.chooseFile')}</p>
                  <p className="mt-1 text-xs text-slate-500">{t('orders.importModal.headersHint')}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-300">{importFileName || t('orders.importModal.noFileChosen')}</p>
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      onClick={handleChooseImportFile}
                      disabled={importing}
                    >
                      {t('orders.importModal.selectFile')}
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
                        {t('orders.importModal.readyToImport')}{' '}
                        <span className="font-semibold text-slate-100">{importItems.length}</span> {t('orders.importModal.orders')}
                      </p>
                      <p className="text-xs text-slate-500">
                        {importSkipped.length
                          ? t('orders.importModal.skipped', { count: importSkipped.length })
                          : t('orders.importModal.noSkipped')}
                      </p>
                    </div>

                    <div className="mt-3 space-y-2">
                      {importItems.slice(0, 5).map((it, idx) => (
                        <div
                          key={`${it.row}-${idx}`}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate font-semibold">{it.payload.title}</p>
                            <p className="text-[11px] text-slate-500">
                              {t('common.row')} {it.row}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {it.preview.amountLabel} · {it.preview.clientLabel} · {it.preview.pipelineLabel} · {it.preview.stageLabel}
                          </p>
                          {it.warnings.length ? (
                            <p className="mt-1 text-xs text-amber-200">{it.warnings.join(' · ')}</p>
                          ) : null}
                        </div>
                      ))}
                      {importItems.length > 5 ? (
                        <p className="text-xs text-slate-500">{t('orders.importModal.showingFirst', { count: 5 })}</p>
                      ) : null}
                    </div>

                    {importProgress ? (
                      <p className="mt-3 text-xs text-slate-400">
                        {t('orders.importModal.importing', {
                          done: importProgress.done,
                          total: importProgress.total,
                        })}
                      </p>
                    ) : null}

                    {importResult ? (
                      <div className="mt-3 space-y-2">
                        <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                          {t('orders.importModal.imported', {
                            created: importResult.created,
                            failed: importResult.failed,
                          })}
                        </div>
                        {importResult.errors.length ? (
                          <details className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                            <summary className="cursor-pointer text-slate-200">{t('orders.importModal.seeErrors')}</summary>
                            <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
                              {importResult.errors.slice(0, 50).map((entry, index) => (
                                <li key={index}>{entry}</li>
                              ))}
                            </ul>
                            {importResult.errors.length > 50 ? (
                              <p className="mt-2 text-xs text-slate-500">{t('orders.importModal.showingFirstErrors')}</p>
                            ) : null}
                          </details>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {importSkipped.length ? (
                  <details className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                    <summary className="cursor-pointer text-slate-200">{t('orders.importModal.skippedRows')}</summary>
                    <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
                      {importSkipped.slice(0, 50).map((entry, index) => (
                        <li key={index}>
                          {t('common.row')} {entry.row}: {entry.reason}
                        </li>
                      ))}
                    </ul>
                    {importSkipped.length > 50 ? (
                      <p className="mt-2 text-xs text-slate-500">{t('orders.importModal.showingFirstSkipped')}</p>
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
                    onClick={() => void handleImport()}
                    disabled={importing || importItems.length === 0}
                  >
                    {importing ? t('orders.importModal.importingButton') : t('orders.importModal.importButton')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </Guard>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  action,
  href,
}: {
  title: string;
  description: string;
  action: string;
  href: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      <Link href={href} className="btn-secondary mt-4 inline-flex text-sm">
        {action}
      </Link>
    </div>
  );
}

function normalizeLookup(value: string): string {
  return normalizeCsvHeader(value || '');
}

function parseAmountValue(raw: string): number | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  const onlyNumeric = trimmed.replace(/[^\d,.\-]/g, '');
  if (!onlyNumeric || onlyNumeric === '-') return null;

  const hasComma = onlyNumeric.includes(',');
  const hasDot = onlyNumeric.includes('.');

  let normalized = onlyNumeric;
  if (hasComma && hasDot) {
    const commaIndex = onlyNumeric.lastIndexOf(',');
    const dotIndex = onlyNumeric.lastIndexOf('.');
    const decimalChar = commaIndex > dotIndex ? ',' : '.';
    if (decimalChar === ',') {
      normalized = onlyNumeric.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = onlyNumeric.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (/,\d{1,2}$/.test(onlyNumeric)) normalized = onlyNumeric.replace(',', '.');
    else normalized = onlyNumeric.replace(/,/g, '');
  } else if (hasDot) {
    const dotCount = (onlyNumeric.match(/\./g) || []).length;
    if (dotCount > 1) normalized = onlyNumeric.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function extractCurrencyCode(rawCurrency: string, rawAmount: string): string {
  const direct = String(rawCurrency || '')
    .toUpperCase()
    .match(/[A-Z]{3}/)?.[0];
  if (direct) return direct;

  const fromAmount = String(rawAmount || '')
    .toUpperCase()
    .match(/\b[A-Z]{3}\b/)?.[0];
  if (fromAmount) return fromAmount;
  return 'USD';
}

function parseLooseDateToIso(raw: string, language: string): string | null {
  const value = (raw || '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const dmyOrMdy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyOrMdy) {
    const a = Number(dmyOrMdy[1]);
    const b = Number(dmyOrMdy[2]);
    const y = Number(dmyOrMdy[3]);

    let day = 0;
    let month = 0;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      day = b;
      month = a;
    } else if (language.startsWith('fr') || language.startsWith('es')) {
      day = a;
      month = b;
    } else {
      day = b;
      month = a;
    }

    const parsed = new Date(Date.UTC(y, month - 1, day));
    if (
      parsed.getUTCFullYear() === y &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }

  const ymd = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const parsed = new Date(Date.UTC(y, month - 1, day));
    if (
      parsed.getUTCFullYear() === y &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())).toISOString().slice(0, 10);
}

function parseOrdersCsv(
  csvText: string,
  opts: {
    language: string;
    pipelines: Pipeline[];
    stages: Stage[];
    clients: Client[];
    defaultPipeline: Pipeline | null;
  },
): { items: DealImportItem[]; skipped: { row: number; reason: string }[] } {
  const delimiter = detectCsvDelimiter(csvText);
  const rows = parseCsv(csvText, delimiter).filter((row) => row.some((cell) => String(cell || '').trim().length > 0));
  if (rows.length === 0) throw new Error('CSV is empty');

  const headers = rows[0].map((h) => normalizeLookup(String(h || '')));
  const fieldByHeader: Record<string, 'title' | 'amount' | 'currency' | 'client' | 'clientId' | 'pipeline' | 'pipelineId' | 'stage' | 'stageId' | 'expectedCloseDate'> = {
    order: 'title',
    pedido: 'title',
    commande: 'title',
    title: 'title',
    deal: 'title',

    amount: 'amount',
    monto: 'amount',
    montant: 'amount',
    value: 'amount',
    valeur: 'amount',

    currency: 'currency',
    moneda: 'currency',
    devise: 'currency',

    client: 'client',
    cliente: 'client',

    clientid: 'clientId',

    pipeline: 'pipeline',
    funnel: 'pipeline',
    pipelineid: 'pipelineId',

    stage: 'stage',
    etapa: 'stage',
    etape: 'stage',
    statusstage: 'stage',
    stageid: 'stageId',

    closingdate: 'expectedCloseDate',
    closuredate: 'expectedCloseDate',
    expectedclosedate: 'expectedCloseDate',
    fechacierre: 'expectedCloseDate',
    cloture: 'expectedCloseDate',
    cierre: 'expectedCloseDate',
  };

  const pipelineById = new Map(opts.pipelines.map((p) => [p.id, p]));
  const pipelineByName = new Map(opts.pipelines.map((p) => [normalizeLookup(p.name), p]));
  const defaultPipeline = opts.defaultPipeline || opts.pipelines[0] || null;

  const stagesByPipeline = new Map<string, Stage[]>();
  for (const stage of opts.stages) {
    const list = stagesByPipeline.get(stage.pipelineId) || [];
    list.push(stage);
    stagesByPipeline.set(stage.pipelineId, list);
  }
  for (const [, list] of stagesByPipeline.entries()) {
    list.sort((a, b) => a.position - b.position);
  }

  const clientsById = new Map(opts.clients.map((c) => [c.id, c]));
  const clientsByName = new Map<string, Client>();
  for (const client of opts.clients) {
    const displayName = getClientDisplayName(client);
    const key = normalizeLookup(displayName);
    if (key && !clientsByName.has(key)) clientsByName.set(key, client);
    const fallbackName = normalizeLookup(client.name || '');
    if (fallbackName && !clientsByName.has(fallbackName)) clientsByName.set(fallbackName, client);
  }

  const skipped: { row: number; reason: string }[] = [];
  const items: DealImportItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    const mapped: Partial<Record<keyof typeof fieldByHeader, string>> & {
      title?: string;
      amount?: string;
      currency?: string;
      client?: string;
      clientId?: string;
      pipeline?: string;
      pipelineId?: string;
      stage?: string;
      stageId?: string;
      expectedCloseDate?: string;
    } = {};

    for (let c = 0; c < headers.length; c++) {
      const normalizedHeader = headers[c];
      const field = fieldByHeader[normalizedHeader];
      if (!field) continue;
      const value = String(row[c] || '').trim();
      if (!value) continue;
      mapped[field] = value;
    }

    const title = (mapped.title || '').trim();
    if (!title) {
      skipped.push({ row: rowNumber, reason: 'Missing order title' });
      continue;
    }

    const amount = parseAmountValue(mapped.amount || '');
    if (amount === null) {
      skipped.push({ row: rowNumber, reason: 'Missing or invalid amount' });
      continue;
    }

    let pipeline: Pipeline | null = null;
    if (mapped.pipelineId) {
      pipeline = pipelineById.get(mapped.pipelineId) || null;
    }
    if (!pipeline && mapped.pipeline) {
      pipeline = pipelineByName.get(normalizeLookup(mapped.pipeline)) || null;
    }
    if (!pipeline) pipeline = defaultPipeline;
    if (!pipeline) {
      skipped.push({ row: rowNumber, reason: 'No pipeline available' });
      continue;
    }

    const stageList = stagesByPipeline.get(pipeline.id) || [];
    const stageById = new Map(stageList.map((stage) => [stage.id, stage]));
    const stageByName = new Map(stageList.map((stage) => [normalizeLookup(stage.name), stage]));
    let stage: Stage | null = null;
    const warnings: string[] = [];

    if (mapped.stageId) {
      stage = stageById.get(mapped.stageId) || null;
      if (!stage) warnings.push('Stage ID not found in this pipeline');
    }
    if (!stage && mapped.stage) {
      stage = stageByName.get(normalizeLookup(mapped.stage)) || null;
      if (!stage) warnings.push('Stage not found in this pipeline (default stage will be used)');
    }

    let client: Client | null = null;
    if (mapped.clientId) {
      client = clientsById.get(mapped.clientId) || null;
      if (!client) warnings.push('Client ID not found (order imported without client)');
    } else if (mapped.client) {
      client = clientsByName.get(normalizeLookup(mapped.client)) || null;
      if (!client) warnings.push('Client not found (order imported without client)');
    }

    const dateRaw = mapped.expectedCloseDate || '';
    const expectedCloseDate = parseLooseDateToIso(dateRaw, opts.language);
    if (dateRaw && !expectedCloseDate) warnings.push('Invalid closing date ignored');

    const currency = extractCurrencyCode(mapped.currency || '', mapped.amount || '');
    const payload: DealCreatePayload = {
      title,
      value: amount,
      currency,
      pipelineId: pipeline.id,
      ...(stage ? { stageId: stage.id } : {}),
      ...(client ? { clientId: client.id } : {}),
      ...(expectedCloseDate ? { expectedCloseDate } : {}),
    };

    items.push({
      row: rowNumber,
      payload,
      preview: {
        clientLabel: client ? getClientDisplayName(client) : 'No client',
        pipelineLabel: pipeline.name,
        stageLabel: stage?.name || 'Default stage',
        amountLabel: `${currency} ${MONEY.format(amount)}`,
      },
      warnings,
    });
  }

  if (items.length === 0) {
    throw new Error('No importable rows found. Include at least Order and Amount columns.');
  }

  return { items, skipped };
}
