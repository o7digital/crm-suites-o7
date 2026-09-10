'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';

type IntegrationStatus = {
  isO7Tenant: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  externalAi: 'ENABLED' | 'DISABLED';
  mode: 'READ_ONLY';
  scopes: string[];
  canRotate: boolean;
  keyId?: string | null;
  lastApiAccess?: string | null;
  lastStatusHttp?: number | null;
  rotatedAt?: string | null;
  customerTenants: Array<{
    tenantId: string;
    name: string;
    externalAi: 'DISABLED';
  }>;
};

type RotatedKey = {
  keyId: string;
  apiKey: string;
  rotatedAt: string;
  warning: string;
};

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export default function AdminIntegrationsPage() {
  const { token, loading: authLoading } = useAuth();
  const api = useApi(token);
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [rotatedKey, setRotatedKey] = useState<RotatedKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api<IntegrationStatus>('/admin/integrations/chatgpt'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load integration status');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (authLoading || !token) return;
    void load();
  }, [authLoading, load, token]);

  const rotate = async () => {
    if (!window.confirm('Rotate the ChatGPT API key? The previous key will stop working immediately.')) return;
    setRotating(true);
    setCopied(false);
    try {
      const result = await api<RotatedKey>('/admin/integrations/chatgpt/rotate-key', {
        method: 'POST',
      });
      setRotatedKey(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rotate API key');
    } finally {
      setRotating(false);
    }
  };

  const copyKey = async () => {
    if (!rotatedKey) return;
    await navigator.clipboard.writeText(rotatedKey.apiKey);
    setCopied(true);
  };

  return (
    <Guard>
      <AppShell>
        <div className="space-y-6">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Integrations</p>
            <h1 className="mt-2 text-3xl font-semibold">AI Access</h1>
            <p className="mt-2 text-sm text-slate-400">
              Private external access. Tenant isolation is enforced by the API server.
            </p>
          </header>

          {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div> : null}
          {loading ? <div className="card p-5 text-slate-300">Loading integration status…</div> : null}

          {!loading && status && !status.isO7Tenant ? (
            <section className="card p-6">
              <h2 className="text-xl font-semibold">External AI</h2>
              <div className="mt-4 inline-flex rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-300">
                Disabled
              </div>
              <p className="mt-3 text-sm text-slate-400">
                No external AI access is enabled for this customer workspace.
              </p>
            </section>
          ) : null}

          {!loading && status?.isO7Tenant ? (
            <>
              <section className="card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">ChatGPT — O7 Digital</h2>
                    <p className="mt-1 text-sm text-slate-400">Dedicated server-side tenant · Read only</p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-sm ${
                      status.status === 'ACTIVE'
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                        : 'border-slate-600 text-slate-300'
                    }`}
                  >
                    {status.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
                  <div><dt className="text-slate-400">Mode</dt><dd className="mt-1 font-medium">Read Only</dd></div>
                  <div><dt className="text-slate-400">Key ID</dt><dd className="mt-1 font-mono">{status.keyId || 'Not configured'}</dd></div>
                  <div><dt className="text-slate-400">Last API access</dt><dd className="mt-1">{dateTime(status.lastApiAccess)}</dd></div>
                  <div><dt className="text-slate-400">Last HTTP status</dt><dd className="mt-1">{status.lastStatusHttp || '—'}</dd></div>
                </dl>

                <div className="mt-6">
                  <div className="text-sm text-slate-400">Allowed scopes</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {status.scopes.map((scope) => (
                      <code key={scope} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-violet-200">{scope}</code>
                    ))}
                  </div>
                </div>

                <button type="button" className="btn-primary mt-6" disabled={!status.canRotate || rotating} onClick={rotate}>
                  {rotating ? 'Rotating…' : 'Rotate API Key'}
                </button>
              </section>

              {rotatedKey ? (
                <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-6">
                  <h2 className="text-lg font-semibold text-amber-100">Copy the new key now</h2>
                  <p className="mt-2 text-sm text-amber-100/80">It is displayed only once. The previous key is already invalid.</p>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/30 p-3 text-sm text-amber-50">{rotatedKey.apiKey}</code>
                    <button type="button" className="btn-secondary" onClick={copyKey}>{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                </section>
              ) : null}

              <section className="card p-6">
                <h2 className="text-xl font-semibold">Customer tenants</h2>
                <p className="mt-1 text-sm text-slate-400">No customer integration is activated in phase 1.</p>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-400"><tr><th className="pb-3">Tenant</th><th className="pb-3">External AI</th></tr></thead>
                    <tbody className="divide-y divide-white/10">
                      {status.customerTenants.map((tenant) => (
                        <tr key={tenant.tenantId}><td className="py-3">{tenant.name}</td><td className="py-3 text-slate-400">Disabled</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {status.customerTenants.length === 0 ? <p className="py-3 text-sm text-slate-400">No customer tenants.</p> : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </AppShell>
    </Guard>
  );
}
