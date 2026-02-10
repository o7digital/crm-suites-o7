'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { getClientDisplayName } from '@/lib/clients';
import { useI18n } from '../../contexts/I18nContext';

type Invoice = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  client?: { id: string; firstName?: string | null; name: string };
  extractedRaw?: { notes?: string };
};

type Client = { id: string; firstName?: string | null; name: string };

export default function InvoicesPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api<Client[]>('/clients'), api<Invoice[]>('/invoices')])
      .then(([clientsData, invoicesData]) => {
        setClients(clientsData);
        setInvoices(invoicesData);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const handleUpload = async (form: FormData) => {
    await api('/invoices/upload', { method: 'POST', body: form });
    load();
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('invoices.section')}</p>
            <h1 className="text-3xl font-semibold">{t('nav.invoices')}</h1>
          </div>
        </div>

        <UploadForm clients={clients} onUpload={handleUpload} />

        {loading && <div className="mt-6 text-slate-300">{t('invoices.loading')}</div>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}

        <div className="mt-6 space-y-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="card p-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="text-lg font-semibold">
                    {inv.currency} {Number(inv.amount).toFixed(2)}
                  </p>
                  <p className="text-sm text-slate-400">
                    {inv.client ? getClientDisplayName(inv.client) : t('invoices.unassigned')} ·{' '}
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="self-start rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">
                  {inv.status}
                </span>
              </div>
              {inv.extractedRaw?.notes && (
                <p className="mt-2 text-xs text-slate-400">
                  {t('invoices.aiNotes')}: {inv.extractedRaw.notes}
                </p>
              )}
            </div>
          ))}
          {invoices.length === 0 && !loading && <p className="text-sm text-slate-400">{t('invoices.empty')}</p>}
        </div>
      </AppShell>
    </Guard>
  );
}

function UploadForm({ clients, onUpload }: { clients: Client[]; onUpload: (form: FormData) => Promise<void> }) {
  const { t } = useI18n();
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) return;
    const form = new FormData();
    form.append('file', fileRef.current.files[0]);
    if (clientId) form.append('clientId', clientId);
    if (amount) form.append('amount', amount);
    if (currency) form.append('currency', currency);
    setSaving(true);
    await onUpload(form);
    setSaving(false);
    setClientId('');
    setAmount('');
    setCurrency('USD');
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-3 p-4 md:grid-cols-4">
      <div>
        <label className="text-sm text-slate-300">{t('invoices.clientOptional')}</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">{t('invoices.unassigned')}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {getClientDisplayName(c)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('invoices.amountOptional')}</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          placeholder="123.00"
          step="0.01"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">{t('field.currency')}</label>
        <input
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-4">
        <label className="text-sm text-slate-300">{t('invoices.uploadFile')}</label>
        <div className="mt-1 flex items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-3 text-sm text-slate-300">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
            required
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            {t('invoices.chooseFile')}
          </button>
          <span className="text-slate-400">{fileName || t('invoices.noFileChosen')}</span>
        </div>
      </div>
      <div className="md:col-span-4 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t('invoices.uploading') : t('invoices.uploadInvoice')}
        </button>
      </div>
    </form>
  );
}
