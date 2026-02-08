'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';

type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  createdAt: string;
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

export default function ClientsPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(() => {
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

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Accounts</p>
            <h1 className="text-3xl font-semibold">Clients</h1>
          </div>
        </div>

        <ClientForm onSubmit={handleCreate} />

        {loading && <div className="mt-6 text-slate-300">Loading clients...</div>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}

        <div className="mt-6 space-y-3">
          {clients.map((client) => (
            <div key={client.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">{client.name}</p>
                <p className="text-sm text-slate-400">
                  {client.email || '—'} · {client.company || 'No company'}
                  {client.taxId ? ` · Tax ID: ${client.taxId}` : ''}
                </p>
                {client.website ? <p className="text-xs text-slate-500">{client.website}</p> : null}
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                  onClick={() => handleDelete(client.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {clients.length === 0 && !loading && (
            <p className="text-sm text-slate-400">No clients yet. Add your first customer above.</p>
          )}
        </div>
      </AppShell>
    </Guard>
  );
}

function ClientForm({ onSubmit }: { onSubmit: (payload: Partial<Client>) => Promise<void> }) {
  const [name, setName] = useState('');
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
        name: name.trim(),
        email: optional(email),
        company: optional(company),
        phone: optional(phone),
        website: optional(website),
        address: optional(address),
        taxId: optional(taxId),
        notes: optional(notes),
      });
      setName('');
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
        <label className="text-sm text-slate-300">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">Email</label>
        <input
          value={email}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.includes('<') || raw.includes('>')) {
              const parsed = parseContactLine(raw);
              if (parsed.email) setEmail(parsed.email);
              else setEmail(raw);
              if (parsed.name && !name.trim()) setName(parsed.name);
              return;
            }
            setEmail(raw);
          }}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          type="email"
        />
        <p className="mt-1 text-xs text-slate-500">
          Tip: you can paste{' '}
          <span className="font-mono">
            Name {'<'}email@domain{'>'}
          </span>{' '}
          and it will auto-extract.
        </p>
      </div>
      <div>
        <label className="text-sm text-slate-300">Company</label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">Website</label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          placeholder="https://example.com"
        />
      </div>
      <div>
        <label className="text-sm text-slate-300">RFC / Tax ID</label>
        <input
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">Address</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          placeholder="Street, number, city, state, ZIP, country"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">Notes</label>
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
          {saving ? 'Saving…' : 'Add client'}
        </button>
      </div>
    </form>
  );
}
