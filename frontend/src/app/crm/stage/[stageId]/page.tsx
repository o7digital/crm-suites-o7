'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { Guard } from '../../../../components/Guard';
import { useApi, useAuth } from '../../../../contexts/AuthContext';

type Stage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  status: 'OPEN' | 'WON' | 'LOST';
  pipelineId: string;
  pipeline?: { id: string; name: string; isDefault: boolean };
};

type Deal = {
  id: string;
  title: string;
  value: number;
  currency: string;
  expectedCloseDate?: string | null;
  stageId: string;
  pipelineId: string;
  createdAt: string;
};

export default function CrmStagePage() {
  const params = useParams<{ stageId: string }>();
  const stageId = params?.stageId;
  const { token } = useAuth();
  const api = useApi(token);

  const [stage, setStage] = useState<Stage | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!stageId) return;
    setError(null);
    setLoading(true);
    try {
      const stageData = await api<Stage>(`/stages/${stageId}`);
      setStage(stageData);
      const pipelineDeals = await api<Deal[]>(`/deals?pipelineId=${stageData.pipelineId}`);
      setDeals(pipelineDeals.filter((d) => d.stageId === stageId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load stage';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api, stageId]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const sortedDeals = useMemo(() => {
    return [...deals].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [deals]);

  const totalLabel = useMemo(() => {
    const totals = sortedDeals.reduce<Record<string, number>>((acc, deal) => {
      const cur = (deal.currency || 'USD').toUpperCase();
      const val = Number(deal.value);
      if (!Number.isFinite(val)) return acc;
      acc[cur] = (acc[cur] || 0) + val;
      return acc;
    }, {});
    const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return '—';
    return entries.map(([cur, val]) => `${cur} ${val.toLocaleString()}`).join(' | ');
  }, [sortedDeals]);

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">CRM</p>
          <h1 className="text-3xl font-semibold">{stage?.name || 'Stage'}</h1>
          {stage ? (
            <p className="mt-2 text-sm text-slate-400">
              Pipeline:{' '}
              <span className="text-slate-200">{stage.pipeline?.name || stage.pipelineId}</span> · Status:{' '}
              <span className="text-slate-200">{stage.status}</span> · Probability:{' '}
              <span className="text-slate-200">{Math.round((stage.probability ?? 0) * 100)}%</span>
            </p>
          ) : null}
          {stage ? (
            <div className="mt-3 flex gap-2">
              <Link href={`/crm?pipelineId=${stage.pipelineId}`} className="btn-secondary text-sm">
                Back to board
              </Link>
            </div>
          ) : null}
        </div>

        {loading && <p className="text-slate-300">Loading deals…</p>}
        {error && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div>}

        {!loading && !error && (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">Deals</p>
                <p className="text-xs text-slate-500">
                  {sortedDeals.length} items · Total {totalLabel}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {sortedDeals.map((deal) => (
                  <div key={deal.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold">{deal.title}</p>
                      <p className="text-xs text-slate-400">
                        {(deal.currency || 'USD').toUpperCase()} {Number(deal.value).toLocaleString()}
                      </p>
                    </div>
                    {deal.expectedCloseDate ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Closing: {new Date(deal.expectedCloseDate).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                ))}
                {sortedDeals.length === 0 ? <p className="text-sm text-slate-400">No deals in this stage.</p> : null}
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </Guard>
  );
}

