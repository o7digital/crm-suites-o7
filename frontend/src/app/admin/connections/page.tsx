"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';
type Status = { provider: string; state: string; message: string; missing: string[]; capabilities: string[] };
const names: Record<string, string> = { mailchimp: 'Mailchimp', cloudbeds: 'Cloudbeds', ga4: 'Google Analytics / GA4', olivia: 'Olivia V3.5' };
const states: Record<string, string> = { unavailable: 'Non activé', not_configured: 'À configurer', configured_unverified: 'Configuration à vérifier', connected: 'Connecté', error: 'Erreur' };
export default function ConnectionsPage() {
  const { token } = useAuth(); const api = useApi(token);
  const [data, setData] = useState<Status[]>([]); const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    if (token) api<{ integrations: Status[] }>('/integrations/status', { signal: abort.signal }).then(result => { if (!abort.signal.aborted) setData(result.integrations); }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [api, token]);
  return <Guard><AppShell><div className="space-y-6"><h1 className="text-2xl font-semibold">Connexions du CRM</h1><p className="text-slate-400">Configuration propre à votre espace de travail. Les services non activés ne récupèrent aucune donnée.</p>
    {error && <p role="alert" className="card p-4 text-red-300">Connexion au backend impossible ou accès administrateur requis : {error}</p>}
    {!error && !data.length && <p>Chargement de la configuration…</p>}
    <div className="grid gap-4 md:grid-cols-2">{data.map(item => <section key={item.provider} className="card space-y-3 p-5"><h2 className="text-lg font-semibold">{names[item.provider]}</h2><p className="text-sm text-amber-300">{states[item.state] || item.state}</p><p className="text-sm text-slate-300">{item.message}</p>{item.missing.length > 0 && <p className="text-xs text-slate-400">À renseigner lors de la connexion : {item.missing.join(', ')}</p>}{item.provider === 'mailchimp' && <Link className="btn-secondary inline-block" href="/admin/mail">Ouvrir le studio Mail</Link>}</section>)}</div>
  </div></AppShell></Guard>;
}
