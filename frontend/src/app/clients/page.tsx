'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';

type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  createdAt: string;
};

export default function ClientsPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = () => {
    api('/clients')
      .then(setClients)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    fetchClients();
  }, [token]);

  const handleCreate = async (payload: Partial<Client>) => {
    setError(null);
    await api('/clients', { method: 'POST', body: JSON.stringify(payload) });
    fetchClients();
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
                </p>
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

function ClientForm({ onSubmit }: { onSubmit: (payload: any) => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({ name, email, company, phone, notes });
    setSaving(false);
    setName('');
    setEmail('');
    setCompany('');
    setPhone('');
    setNotes('');
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
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
          type="email"
        />
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
      <div className="md:col-span-2">
        <label className="text-sm text-slate-300">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
        />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add client'}
        </button>
      </div>
    </form>
  );
}
