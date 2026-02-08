'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { Guard } from '../../../../components/Guard';
import { useApi, useAuth } from '../../../../contexts/AuthContext';

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price?: string | number | null;
  currency: string;
  isActive: boolean;
  createdAt: string;
};

const CURRENCIES = ['USD', 'EUR', 'MXN', 'CAD'] as const;
type Currency = (typeof CURRENCIES)[number];

function formatPrice(price: unknown, currency: string) {
  const n = typeof price === 'number' ? price : typeof price === 'string' ? Number(price) : NaN;
  if (!Number.isFinite(n)) return '—';
  return `${currency.toUpperCase()} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function AdminParametersProductsPage() {
  const { token } = useAuth();
  const api = useApi(token);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<{
    name: string;
    description: string;
    price: string;
    currency: Currency;
    isActive: boolean;
  }>({
    name: '',
    description: '',
    price: '',
    currency: 'USD',
    isActive: true,
  });

  const [editing, setEditing] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    price: string;
    currency: Currency;
    isActive: boolean;
  }>({
    name: '',
    description: '',
    price: '',
    currency: 'USD',
    isActive: true,
  });

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    api<Product[]>('/products')
      .then(setProducts)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.createdAt === b.createdAt) return a.name.localeCompare(b.name);
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [products]);

  const createProduct = async () => {
    if (!createForm.name.trim()) return;
    setError(null);
    setBusyId('create');
    try {
      const payload: Record<string, unknown> = {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        currency: createForm.currency,
        isActive: createForm.isActive,
      };
      if (createForm.price.trim()) payload.price = Number(createForm.price);

      const created = await api<Product>('/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setProducts((prev) => [created, ...prev]);
      setCreateForm({ name: '', description: '', price: '', currency: 'USD', isActive: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create product';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (product: Product) => {
    setError(null);
    setBusyId(product.id);
    try {
      const updated = await api<Product>(`/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update product';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  const removeProduct = async (product: Product) => {
    const ok = typeof window === 'undefined' ? true : window.confirm(`Delete product "${product.name}"?`);
    if (!ok) return;
    setError(null);
    setBusyId(product.id);
    try {
      await api(`/products/${product.id}`, { method: 'DELETE' });
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete product';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setEditForm({
      name: product.name || '',
      description: product.description || '',
      price: product.price === null || product.price === undefined ? '' : String(product.price),
      currency: (CURRENCIES.includes(product.currency as Currency) ? (product.currency as Currency) : 'USD'),
      isActive: product.isActive,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.name.trim()) return;
    setError(null);
    setBusyId(editing.id);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        currency: editForm.currency,
        isActive: editForm.isActive,
      };
      if (editForm.price.trim()) payload.price = Number(editForm.price);
      else payload.price = null;

      const updated = await api<Product>(`/products/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setEditing(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update product';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin · Parameters</p>
          <h1 className="text-3xl font-semibold">Products</h1>
          <div className="mt-3 flex gap-2">
            <Link href="/admin/parameters" className="btn-secondary text-sm">
              Back
            </Link>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div> : null}

        <div className="card p-5">
          <p className="text-sm text-slate-400">Add a product</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Name
              <input
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Price (optional)
              <input
                type="number"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={createForm.price}
                onChange={(e) => setCreateForm((p) => ({ ...p, price: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Currency
              <select
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={createForm.currency}
                onChange={(e) => setCreateForm((p) => ({ ...p, currency: e.target.value as Currency }))}
              >
                {CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              Status
              <select
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={createForm.isActive ? 'active' : 'inactive'}
                onChange={(e) => setCreateForm((p) => ({ ...p, isActive: e.target.value === 'active' }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="block text-sm text-slate-300 md:col-span-2">
              Description (optional)
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn-primary" onClick={createProduct} disabled={busyId === 'create'}>
              {busyId === 'create' ? 'Saving…' : 'Create product'}
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-400">Product catalog</p>
            <button className="btn-secondary text-sm" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>

          {loading ? <p className="text-slate-300">Loading products…</p> : null}

          {!loading && (
            <div className="space-y-3">
              {sorted.map((p) => (
                <div key={p.id} className="card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{p.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            p.isActive ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-500/15 text-slate-300'
                          }`}
                        >
                          {p.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatPrice(p.price, p.currency)} · Created {new Date(p.createdAt).toLocaleDateString()}
                      </p>
                      {p.description ? <p className="mt-2 text-sm text-slate-300">{p.description}</p> : null}
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <button className="btn-secondary text-sm" onClick={() => openEdit(p)} disabled={busyId === p.id}>
                        Edit
                      </button>
                      <button
                        className="btn-secondary text-sm"
                        onClick={() => toggleActive(p)}
                        disabled={busyId === p.id}
                      >
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                        onClick={() => removeProduct(p)}
                        disabled={busyId === p.id}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {sorted.length === 0 ? (
                <div className="card p-6 text-slate-400">No products yet. Add one above.</div>
              ) : null}
            </div>
          )}
        </div>

        {editing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="card w-full max-w-lg p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Edit product</h2>
                <button className="text-slate-400" onClick={() => setEditing(null)}>
                  ✕
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Name
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Price (optional)
                  <input
                    type="number"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={editForm.price}
                    onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Currency
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={editForm.currency}
                    onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value as Currency }))}
                  >
                    {CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Status
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={editForm.isActive ? 'active' : 'inactive'}
                    onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.value === 'active' }))}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-300 md:col-span-2">
                  Description (optional)
                  <textarea
                    className="mt-2 min-h-[90px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={editForm.description}
                    onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button className="btn-secondary" onClick={() => setEditing(null)} disabled={busyId === editing.id}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={saveEdit} disabled={busyId === editing.id}>
                  {busyId === editing.id ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </Guard>
  );
}
