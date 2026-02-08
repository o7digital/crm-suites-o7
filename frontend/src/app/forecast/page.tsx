'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat('en-US');

type Pipeline = {
  id: string;
  name: string;
  isDefault?: boolean;
};

type ForecastPayload = {
  pipeline: Pipeline | null;
  total: number;
  weightedTotal: number;
  byStage: Array<{
    stageId: string;
    stageName: string;
    status: string;
    probability: number;
    total: number;
    weightedTotal: number;
    count: number;
  }>;
};

export default function ForecastPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Pipeline[]>('/pipelines')
      .then((data) => {
        setPipelines(data);
        const defaultPipeline = data.find((p) => p.isDefault) || data[0];
        setPipelineId(defaultPipeline?.id || '');
      })
      .catch((err) => setError(err.message));
  }, [api, token]);

  useEffect(() => {
    if (!token || !pipelineId) return;
    setLoading(true);
    let active = true;
    let inFlight = false;
    let timer: number | null = null;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api<ForecastPayload>(`/forecast?pipelineId=${pipelineId}`);
        if (!active) return;
        setForecast(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load forecast');
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };

    load();
    timer = window.setInterval(load, 15_000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [api, pipelineId, token]);

  return (
    <Guard>
      <AppShell>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Forecast</p>
            <h1 className="text-3xl font-semibold">Pipeline outlook</h1>
          </div>
          <select
            className="btn-secondary text-sm"
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
          >
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </div>

        {loading && <p className="text-slate-300">Loading forecast...</p>}
        {error && <p className="text-red-300">Error: {error}</p>}

        {forecast && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="card p-5">
                <p className="text-sm text-slate-400">Pipeline total</p>
                <p className="mt-2 text-3xl font-semibold">{USD.format(forecast.total)}</p>
              </div>
              <div className="card p-5">
                <p className="text-sm text-slate-400">Weighted total</p>
                <p className="mt-2 text-3xl font-semibold">{USD.format(forecast.weightedTotal)}</p>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">By stage</p>
                <p className="text-xs text-slate-500">{INT.format(forecast.byStage.length)} stages</p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-2 text-left">Stage</th>
                      <th className="pb-2 text-left">Status</th>
                      <th className="pb-2 text-right">Deals</th>
                      <th className="pb-2 text-right">Probability</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-right">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.byStage.map((row) => (
                      <tr key={row.stageId} className="border-t border-white/5">
                        <td className="py-2 text-left font-medium">
                          <Link
                            href={`/crm?pipelineId=${encodeURIComponent(pipelineId)}&stageId=${encodeURIComponent(
                              row.stageId,
                            )}`}
                            className="hover:underline"
                          >
                            {row.stageName}
                          </Link>
                        </td>
                        <td className="py-2 text-left text-slate-400">{row.status}</td>
                        <td className="py-2 text-right">{INT.format(row.count)}</td>
                        <td className="py-2 text-right">{Math.round(row.probability * 100)}%</td>
                        <td className="py-2 text-right">{USD.format(row.total)}</td>
                        <td className="py-2 text-right">{USD.format(row.weightedTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </Guard>
  );
}
