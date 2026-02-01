'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';

type Invoice = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  client?: { id: string; name: string };
  extractedRaw?: any;
};

type Client = { id: string; name: string };

export default function InvoicesPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([api('/clients'), api('/invoices')])
      .then(([clientsData, invoicesData]) => {
        setClients(clientsData);
        setInvoices(invoicesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    load();
  }, [token]);

  const handleUpload = async (form: FormData) => {
    await api('/invoices/upload', { method: 'POST', body: form });
    load();
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Revenue</p>
            <h1 className="text-3xl font-semibold">Invoices</h1>
          </div>
        </div>

        <UploadForm clients={clients} onUpload={handleUpload} />

        {loading && <div className="mt-6 text-slate-300">Loading invoices…</div>}
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
                    {inv.client?.name || 'Unassigned'} · {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="self-start rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">
                  {inv.status}
                </span>
              </div>
              {inv.extractedRaw?.notes && (
                <p className="mt-2 text-xs text-slate-400">AI notes: {inv.extractedRaw.notes}</p>
              )}
            </div>
          ))}
          {invoices.length === 0 && !loading && <p className="text-sm text-slate-400">No invoices yet.</p>}
        </div>
      </AppShell>
    </Guard>
  );
}

function UploadForm({ clients, onUpload }: { clients: Client[]; onUpload: (form: FormData) => Promise<void> }) {
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [fileName, setFileName] = useState('No file chosen');
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
    setFileName('No file chosen');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="card grid gap-3 p-4 md:grid-cols-4">
      <div>
        <label className="text-sm text-slate-300">Client (optional)</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">Unassigned</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-300">Amount (optional)</label>
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
        <label className="text-sm text-slate-300">Currency</label>
        <input
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-4">
        <label className="text-sm text-slate-300">Upload file</label>
        <div className="mt-1 flex items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-3 text-sm text-slate-300">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name || 'No file chosen')}
            required
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            Choose file
          </button>
          <span className="text-slate-400">{fileName}</span>
        </div>
      </div>
      <div className="md:col-span-4 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Uploading…' : 'Upload invoice'}
        </button>
      </div>
    </form>
  );
}
