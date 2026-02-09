'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
import { CLIENT_FUNCTION_OPTIONS, getClientDisplayName } from '@/lib/clients';

type Client = {
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

function toOptionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export default function ClientPage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params?.clientId;
  const router = useRouter();

  const { token } = useAuth();
  const api = useApi(token);

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<{
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

  const displayName = useMemo(() => {
    return client ? getClientDisplayName(client) : 'Client';
  }, [client]);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await api<Client>(`/clients/${clientId}`);
      setClient(data);
      setForm({
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
      setError(message);
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [api, clientId]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const handleSave = useCallback(async () => {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const nextName = form.name.trim();
      if (!nextName) throw new Error('Name is required');

      const updated = await api<Client>(`/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: toOptionalTrimmed(form.firstName),
          name: nextName,
          function: toOptionalTrimmed(form.clientFunction),
          companySector: toOptionalTrimmed(form.companySector),
          email: toOptionalTrimmed(form.email),
          company: toOptionalTrimmed(form.company),
          phone: toOptionalTrimmed(form.phone),
          website: toOptionalTrimmed(form.website),
          taxId: toOptionalTrimmed(form.taxId),
          address: toOptionalTrimmed(form.address),
          notes: toOptionalTrimmed(form.notes),
        }),
      });
      setClient(updated);
      setSuccess('Saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save client';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [api, clientId, form]);

  const handleDelete = useCallback(async () => {
    if (!clientId) return;
    const ok = confirm('Delete this client? This will also delete related tasks and invoices.');
    if (!ok) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api(`/clients/${clientId}`, { method: 'DELETE' });
      router.push('/clients');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete client';
      setError(message);
      setSaving(false);
    }
  }, [api, clientId, router]);

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Accounts</p>
          <h1 className="text-3xl font-semibold">{displayName}</h1>
          <div className="mt-3 flex gap-2">
            <Link href="/clients" className="btn-secondary text-sm">
              Back
            </Link>
            <button className="btn-secondary text-sm" onClick={load} disabled={loading}>
              Refresh
            </button>
            <button
              className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </button>
          </div>
        </div>

        {loading && <p className="text-slate-300">Loading client…</p>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}
        {success && <div className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-200">{success}</div>}

        {!loading && client && (
          <div className="space-y-6">
            <div className="card p-5">
              <p className="text-sm text-slate-400">Client details</p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  First name
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.firstName}
                    onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    autoComplete="given-name"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Name
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    autoComplete="family-name"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Function
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.clientFunction}
                    onChange={(e) => setForm((prev) => ({ ...prev, clientFunction: e.target.value }))}
                  >
                    <option value="">Select function</option>
                    {CLIENT_FUNCTION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Company sector
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.companySector}
                    onChange={(e) => setForm((prev) => ({ ...prev, companySector: e.target.value }))}
                    placeholder="e.g. Technology, Finance, Healthcare"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Email
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    type="email"
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Company
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.company}
                    onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
                    autoComplete="organization"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Phone
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    autoComplete="tel"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Website
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.website}
                    onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                    placeholder="https://example.com"
                    autoComplete="url"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  RFC / Tax ID
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.taxId}
                    onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))}
                  />
                </label>
                <div />
                <label className="block text-sm text-slate-300 md:col-span-2">
                  Address
                  <textarea
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.address}
                    onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                    rows={3}
                    placeholder="Street, number, city, state, ZIP, country"
                  />
                </label>
                <label className="block text-sm text-slate-300 md:col-span-2">
                  Notes
                  <textarea
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="card p-5">
              <p className="text-sm text-slate-400">Metadata</p>
              <div className="mt-2 text-sm text-slate-300">
                <p>Created: {new Date(client.createdAt).toLocaleString()}</p>
                <p>Updated: {new Date(client.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </Guard>
  );
}

