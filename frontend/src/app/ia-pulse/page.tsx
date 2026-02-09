'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useIA } from '@/hooks/useIA';
import { IAResultSection } from '@/components/IAResultSection';

export default function IaPulsePage() {
  const [text, setText] = useState('');
  const [leadName, setLeadName] = useState('');

  const {
    analyzeLead,
    summarize,
    generateEmail,
    improveProposal,
    reset,
    sentiment,
    summary,
    draftEmail,
    improvedProposal,
    loadingSentiment,
    loadingSummary,
    loadingEmail,
    loadingImprove,
    errorSentiment,
    errorSummary,
    errorEmail,
    errorImprove,
  } = useIA();

  const canUseText = useMemo(() => text.trim().length > 0, [text]);
  const canGenerateEmail = useMemo(
    () => canUseText && leadName.trim().length > 0,
    [canUseText, leadName],
  );

  const clearAll = () => {
    setText('');
    setLeadName('');
    reset();
  };

  return (
    <Guard>
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <p className="text-sm uppercase tracking-[0.15em] text-slate-400">o7 IA Pulse</p>
            <h1 className="text-3xl font-semibold">Assistant commercial intelligent</h1>
            <p className="mt-2 text-sm text-slate-400">
              Collez un texte (notes, lead, email, proposition) puis lancez une action IA. Les traitements tournent
              côté backend.
            </p>
          </div>

          <div className="card p-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-300">Texte</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Collez ici le texte du lead / notes / email / proposition"
                  rows={5}
                  className="mt-1 w-full resize-y rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                />
                <p className="mt-1 text-xs text-slate-400">{text.trim().length} characters</p>
              </div>

              <div>
                <label className="text-sm text-slate-300">Nom du lead</label>
                <input
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Nom du lead (pour l'email)"
                  className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary disabled:opacity-50"
                  disabled={!canUseText || loadingSentiment}
                  onClick={() => analyzeLead(text.trim())}
                >
                  {loadingSentiment ? 'Chargement...' : 'Analyser lead'}
                </button>
                <button
                  type="button"
                  className="btn-secondary disabled:opacity-50"
                  disabled={!canUseText || loadingSummary}
                  onClick={() => summarize(text.trim())}
                >
                  {loadingSummary ? 'Chargement...' : 'Résumé'}
                </button>
                <button
                  type="button"
                  className="btn-secondary disabled:opacity-50"
                  disabled={!canGenerateEmail || loadingEmail}
                  onClick={() => generateEmail(leadName.trim(), text.trim())}
                >
                  {loadingEmail ? 'Chargement...' : 'Générer Email'}
                </button>
                <button
                  type="button"
                  className="btn-secondary disabled:opacity-50"
                  disabled={!canUseText || loadingImprove}
                  onClick={() => improveProposal(text.trim())}
                >
                  {loadingImprove ? 'Chargement...' : 'Améliorer devis'}
                </button>
                <div className="flex-1" />
                <button type="button" className="btn-secondary" onClick={clearAll}>
                  Effacer tout
                </button>
              </div>

              {!canUseText ? <p className="text-xs text-slate-400">Ajoutez du texte pour activer les actions IA.</p> : null}
              {canUseText && !leadName.trim() ? (
                <p className="text-xs text-slate-400">Le champ “Nom du lead” est requis uniquement pour “Générer Email”.</p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <IAResultSection
              title="Analyse de sentiment"
              subtitle="Sentiment + niveau de confiance"
              loading={loadingSentiment}
              error={errorSentiment}
              copyText={sentiment ? JSON.stringify(sentiment, null, 2) : ''}
            >
              {sentiment ? (
                <div className="space-y-2 text-sm text-slate-200">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-400">Sentiment</span>
                    <span className="font-semibold">{sentiment.sentiment}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-400">Confidence</span>
                    <span className="font-semibold">{Math.round(sentiment.confidence * 100)}%</span>
                  </div>
                  <pre className="mt-3 overflow-auto rounded-lg bg-black/20 p-3 text-xs ring-1 ring-white/10">
                    {JSON.stringify(sentiment, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Aucun résultat pour le moment.</p>
              )}
            </IAResultSection>

            <IAResultSection
              title="Résumé"
              subtitle="Résumé automatique du texte"
              loading={loadingSummary}
              error={errorSummary}
              copyText={summary?.summary || ''}
            >
              {summary?.summary ? (
                <p className="whitespace-pre-wrap text-sm text-slate-200">{summary.summary}</p>
              ) : (
                <p className="text-sm text-slate-400">Aucun résumé pour le moment.</p>
              )}
            </IAResultSection>

            <IAResultSection
              title="Email généré"
              subtitle="Objet + corps d'email de suivi"
              loading={loadingEmail}
              error={errorEmail}
              copyText={
                draftEmail ? `Subject: ${draftEmail.subject}\n\n${draftEmail.body}` : ''
              }
            >
              {draftEmail ? (
                <div className="space-y-3 text-sm text-slate-200">
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Objet</p>
                    <p className="mt-1 font-semibold">{draftEmail.subject || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Body</p>
                    <p className="mt-1 whitespace-pre-wrap">{draftEmail.body || '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Aucun email généré pour le moment.</p>
              )}
            </IAResultSection>

            <IAResultSection
              title="Proposition améliorée"
              subtitle="Reformulation plus claire et convaincante"
              loading={loadingImprove}
              error={errorImprove}
              copyText={improvedProposal?.improvedProposal || ''}
            >
              {improvedProposal?.improvedProposal ? (
                <p className="whitespace-pre-wrap text-sm text-slate-200">{improvedProposal.improvedProposal}</p>
              ) : (
                <p className="text-sm text-slate-400">Aucun texte amélioré pour le moment.</p>
              )}
            </IAResultSection>
          </div>
        </div>
      </AppShell>
    </Guard>
  );
}
