'use client';

import { useEffect, useState } from 'react';
import { useApi, useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';

type Stage = { id: string; name: string; position: number; status: string };
type Deal = { id: string; title: string; pipelineId: string; stageId: string };

export function WorkflowTransferDialog({ deal, pipelines, onClose, onTransferred }: {
  deal: Deal;
  pipelines: { id: string; name: string }[];
  onClose: () => void;
  onTransferred: (deal: Deal) => void;
}) {
  const { token } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pipelineId) return;
    let active = true;
    setLoading(true);
    setError(null);
    api<Stage[]>(`/stages?pipelineId=${encodeURIComponent(pipelineId)}`)
      .then((data) => {
        if (!active) return;
        const open = data.filter((stage) => stage.status === 'OPEN').sort((a, b) => a.position - b.position);
        setStages(open);
        setStageId(open[0]?.id || '');
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load stages'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, pipelineId]);

  const transfer = async () => {
    if (saving || loading || !pipelineId || !stages.some((stage) => stage.id === stageId)) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Deal>(`/deals/${deal.id}`, {
        method: 'PATCH', body: JSON.stringify({ pipelineId, stageId }),
      });
      onTransferred(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to move deal');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 py-8 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="workflow-transfer-title" className="card w-full max-w-lg border border-white/15 p-6">
        <h2 id="workflow-transfer-title" className="text-xl font-semibold">ADD · WFL</h2>
        <p className="mt-2 text-sm text-slate-300">{deal.title}</p>
        <label className="mt-5 block text-sm text-slate-300">
          WFL · {t('crm.pipeline')}
          <select autoFocus className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2" value={pipelineId} disabled={saving} onChange={(event) => {
            setPipelineId(event.target.value); setStageId(''); setStages([]); setError(null);
          }}>
            <option value="">— WFL —</option>
            {pipelines.filter((pipeline) => pipeline.id !== deal.pipelineId).map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
        </label>
        <label className="mt-4 block text-sm text-slate-300">
          {t('crm.stage')}
          <select className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2" value={stageId} disabled={saving || loading || stages.length === 0} onChange={(event) => setStageId(event.target.value)}>
            <option value="">{loading ? t('common.loading') : t('crm.selectStage')}</option>
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
        </label>
        {pipelineId && !loading && !error && stages.length === 0 ? <p className="mt-2 text-sm text-slate-400">{t('crm.noStagesShort')}</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-red-200">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" disabled={saving} onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={saving || loading || !stageId} onClick={() => void transfer()}>{saving ? t('common.loading') : 'ADD'}</button>
        </div>
      </div>
    </div>
  );
}
