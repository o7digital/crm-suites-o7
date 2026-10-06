'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { chartPoints, compactPoints, DEFAULT_CHARTS, normalizeCharts, type ChartConfig, type ChartRow, type ChartPoint } from '@/lib/reporting-charts';

const labels = {
  en: { title: 'Your reporting charts', hint: 'Customize up to 6 charts. Preferences are saved for your account in this workspace on this browser.', add: 'Add chart', reset: 'Reset charts', remove: 'Remove chart', metric: 'Measure', group: 'Breakdown', kind: 'Chart type', currency: 'Currency', deals: 'Deals', revenue: 'Won revenue', tasks: 'Tasks', hours: 'Hours worked', status: 'Status', client: 'Client', period: 'Period', reason: 'Loss reason', pie: 'Pie', bar: 'Bars', line: 'Line', empty: 'No data for this chart in the selected period.', other: 'Other', unspecified: 'Not recorded', won: 'Won', lost: 'Lost', open: 'Open', pending: 'Pending', progress: 'In progress', done: 'Done', scope: 'Closed deals: closing date. Open deals: creation date. Tasks: due date or creation date.', unavailable: 'Preferences could not be saved on this browser.', total: 'Total' },
  fr: { title: 'Vos graphiques de reporting', hint: 'Personnalisez jusqu’à 6 graphiques. Réglages conservés pour votre compte dans cet espace sur ce navigateur.', add: 'Ajouter un graphique', reset: 'Réinitialiser', remove: 'Supprimer le graphique', metric: 'Indicateur', group: 'Répartition', kind: 'Type de graphique', currency: 'Devise', deals: 'Opportunités', revenue: 'Chiffre d’affaires gagné', tasks: 'Tâches', hours: 'Heures travaillées', status: 'Statut', client: 'Client', period: 'Période', reason: 'Motif de perte', pie: 'Camembert', bar: 'Barres', line: 'Courbe', empty: 'Aucune donnée pour ce graphique sur la période choisie.', other: 'Autres', unspecified: 'Non renseigné', won: 'Gagnées', lost: 'Perdues', open: 'Ouvertes', pending: 'En attente', progress: 'En cours', done: 'Terminées', scope: 'Ventes clôturées : date de clôture. Ouvertes : date de création. Tâches : date prévue ou de création.', unavailable: 'Impossible de conserver les réglages sur ce navigateur.', total: 'Total' },
  es: { title: 'Tus gráficos de reporting', hint: 'Personaliza hasta 6 gráficos. Preferencias guardadas para tu cuenta en este espacio y navegador.', add: 'Añadir gráfico', reset: 'Restablecer', remove: 'Eliminar gráfico', metric: 'Indicador', group: 'Desglose', kind: 'Tipo de gráfico', currency: 'Moneda', deals: 'Oportunidades', revenue: 'Ingresos ganados', tasks: 'Tareas', hours: 'Horas trabajadas', status: 'Estado', client: 'Cliente', period: 'Período', reason: 'Motivo de pérdida', pie: 'Circular', bar: 'Barras', line: 'Línea', empty: 'Sin datos para este gráfico en el período seleccionado.', other: 'Otros', unspecified: 'Sin registrar', won: 'Ganadas', lost: 'Perdidas', open: 'Abiertas', pending: 'Pendientes', progress: 'En curso', done: 'Completadas', scope: 'Ventas cerradas: fecha de cierre. Abiertas: fecha de creación. Tareas: fecha prevista o de creación.', unavailable: 'No se pudieron guardar las preferencias en este navegador.', total: 'Total' },
};
const COLORS = ['#c7f442', '#22d3ee', '#a78bfa', '#fb923c', '#f472b6', '#60a5fa', '#34d399', '#facc15', '#e879f9', '#94a3b8'];

export function ChartVisual({ points, kind, format, title }: { points: ChartPoint[]; kind: ChartConfig['kind']; format: (n: number) => string; title: string }) {
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const max = Math.max(...points.map(p => p.value), 1);
  let offset = 0;
  return <div className="mt-5">
    {kind === 'pie' ? <svg viewBox="0 0 240 240" role="img" aria-label={title} className="mx-auto h-52 w-52">
      {points.filter(p => p.value > 0).map(p => {
        const index = points.indexOf(p);
        const fraction = p.value / total;
        const start = offset;
        offset += fraction * 360;
        return <circle key={p.key} cx="120" cy="120" r="80" fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="44" pathLength="100" strokeDasharray={`${fraction * 100} ${100 - fraction * 100}`} transform={`rotate(${start - 90} 120 120)`}><title>{p.label}: {format(p.value)} ({(fraction * 100).toFixed(1)}%)</title></circle>;
      })}
      <text x="120" y="126" textAnchor="middle" fill="currentColor" fontSize="18">{format(total)}</text>
    </svg> : kind === 'bar' ? <div className="space-y-3" role="img" aria-label={title}>{points.map((p, i) => <div key={p.key}>
      <div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{p.label}</span><span>{format(p.value)}</span></div>
      <div className="h-3 rounded-full bg-white/5"><div className="h-full rounded-full" style={{ width: `${p.value / max * 100}%`, backgroundColor: COLORS[i % COLORS.length], printColorAdjust: 'exact' }} /></div>
    </div>)}</div> : <svg viewBox="0 0 520 220" role="img" aria-label={title} className="h-52 w-full">
      {[0, 0.5, 1].map(t => <g key={t}><line x1="60" x2="490" y1={180 - t * 150} y2={180 - t * 150} stroke="currentColor" opacity=".15"/><text x="52" y={184 - t * 150} textAnchor="end" fill="currentColor" fontSize="11">{format(max * t)}</text></g>)}
      <polyline fill="none" stroke={COLORS[0]} strokeWidth="3" points={points.map((p, i) => `${60 + i * 430 / Math.max(points.length - 1, 1)},${180 - p.value / max * 150}`).join(' ')} />
      {points.map((p, i) => <g key={p.key}><circle cx={60 + i * 430 / Math.max(points.length - 1, 1)} cy={180 - p.value / max * 150} r="5" fill={COLORS[0]}><title>{p.label}: {format(p.value)}</title></circle>{(points.length <= 6 || i === 0 || i === points.length - 1) && <text x={60 + i * 430 / Math.max(points.length - 1, 1)} y="207" textAnchor="middle" fill="currentColor" fontSize="11">{p.label.length > 14 ? p.label.slice(0, 12) + '…' : p.label}</text>}</g>)}
    </svg>}
    <ul className="mt-5 space-y-2 text-sm" aria-label={title}>{points.map((p, i) => <li key={p.key} className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length], printColorAdjust: 'exact'}}/><span className="truncate" title={p.label}>{p.label}</span></span>
      <span className="shrink-0 tabular-nums">{format(p.value)}{kind === 'pie' && <span className="ml-2 text-slate-400">{(p.value / total * 100).toFixed(1)}%</span>}</span>
    </li>)}</ul>
  </div>;
}

export function ReportingCharts({ sales, tasks, granularity, startDate, endDate }: { sales: ChartRow[]; tasks: ChartRow[]; granularity: 'month' | 'year'; startDate: string; endDate: string }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const l = labels[language as keyof typeof labels] || labels.en;
  const key = user ? `o7-reporting-charts-v1:${user.tenantId}:${user.id}` : null;
  const [saved, setSaved] = useState<{ key: string | null; charts: ChartConfig[] }>({key: null, charts: DEFAULT_CHARTS});
  const [storageError, setStorageError] = useState(false);
  const charts = saved.key === key ? saved.charts : DEFAULT_CHARTS;
  useEffect(() => {
    if (!key) return;
    try { const raw = localStorage.getItem(key); setSaved({key, charts: raw ? normalizeCharts(JSON.parse(raw)) : DEFAULT_CHARTS}); setStorageError(false); }
    catch { setSaved({key, charts: DEFAULT_CHARTS}); setStorageError(true); }
  }, [key]);
  const save = (next: ChartConfig[]) => {
    setSaved({key, charts: next});
    if (key) try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); } catch { setStorageError(true); }
  };
  const currencies = useMemo(() => [...new Set(sales.map(s => s.currency).filter((c): c is string => Boolean(c)))].sort(), [sales]);
  const patch = (id: string, update: Partial<ChartConfig>) => save(charts.map(c => c.id === id ? {...c, ...update} : c));
  const statusLabels: Record<string, string> = {WON:l.won, LOST:l.lost, OPEN:l.open, PENDING:l.pending, IN_PROGRESS:l.progress, DONE:l.done, __unspecified__:l.unspecified};
  return <section className="space-y-4" aria-label={l.title}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{l.title}</h2><p className="mt-1 text-sm text-slate-400">{l.hint}</p><p className="mt-1 text-xs text-slate-400">{startDate} → {endDate} · {l.scope}</p></div>
      <div className="no-print flex gap-2"><button className="btn-secondary text-sm" onClick={() => save(DEFAULT_CHARTS.map(c => ({...c, currency: currencies[0] || 'USD'})))}>{l.reset}</button><button disabled={charts.length >= 6} className="btn-primary text-sm disabled:opacity-40" onClick={() => save([...charts, {id: crypto.randomUUID(), metric:'deals', group:'status', kind:'pie', currency:currencies[0] || 'USD'}])}>{l.add}</button></div>
    </div>
    {storageError && <p className="text-sm text-amber-300" role="status">{l.unavailable}</p>}
    <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {charts.map((config, index) => {
        const source = ['tasks','hours'].includes(config.metric) ? tasks : sales;
        const currency = config.currency;
        const points = chartPoints(source, {...config, currency}, granularity).map(p => ({...p, label: config.group === 'status' || config.group === 'reason' && p.key === '__unspecified__' ? statusLabels[p.key] || p.label : p.label}));
        const display = config.group === 'period' ? points : compactPoints(points, l.other);
        const total = display.reduce((sum, p) => sum + p.value, 0);
        const format = (n: number) => new Intl.NumberFormat(language, {maximumFractionDigits: config.metric === 'deals' || config.metric === 'tasks' ? 0 : 2}).format(n) + (config.metric === 'revenue' ? ` ${currency}` : config.metric === 'hours' ? ' h' : '');
        const title = `${l[config.metric]} · ${l[config.group]}`;
        return <article key={config.id} className="card p-5" style={{breakInside:'avoid'}} aria-label={`${index + 1}. ${title}`}>
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3><button className="no-print rounded px-2 py-1 text-slate-400 hover:text-red-300" aria-label={`${l.remove} ${index + 1}`} onClick={() => save(charts.filter(c => c.id !== config.id))}>×</button></div>
          <p className="mt-2 text-2xl font-semibold">{format(total)} <span className="text-xs font-normal text-slate-400">{l.total}</span></p>
          <div className="no-print mt-4 grid grid-cols-2 gap-3 text-xs">
            <label>{l.metric}<select aria-label={`${l.metric} ${index + 1}`} className="mt-1 w-full rounded-lg bg-white/5 px-2 py-2 text-sm ring-1 ring-white/10" value={config.metric} onChange={e => { const metric = e.target.value as ChartConfig['metric']; patch(config.id, {metric, group: config.group === 'reason' ? 'status' : config.group}); }}>{(['deals','revenue','tasks','hours'] as const).map(v => <option key={v} value={v}>{l[v]}</option>)}</select></label>
            <label>{l.group}<select aria-label={`${l.group} ${index + 1}`} className="mt-1 w-full rounded-lg bg-white/5 px-2 py-2 text-sm ring-1 ring-white/10" value={config.group} onChange={e => patch(config.id,{group:e.target.value as ChartConfig['group']})}>{(['status','client','period', ...(config.metric === 'deals' ? ['reason'] as const : [])] as const).map(v => <option key={v} value={v}>{l[v]}</option>)}</select></label>
            <label>{l.kind}<select aria-label={`${l.kind} ${index + 1}`} className="mt-1 w-full rounded-lg bg-white/5 px-2 py-2 text-sm ring-1 ring-white/10" value={config.kind} onChange={e => patch(config.id,{kind:e.target.value as ChartConfig['kind']})}>{(['pie','bar','line'] as const).map(v => <option key={v} value={v}>{l[v]}</option>)}</select></label>
            {config.metric === 'revenue' && <label>{l.currency}<select aria-label={`${l.currency} ${index + 1}`} className="mt-1 w-full rounded-lg bg-white/5 px-2 py-2 text-sm ring-1 ring-white/10" value={currency} onChange={e => patch(config.id,{currency:e.target.value})}>{[...new Set([currency, ...currencies])].map(v => <option key={v} value={v}>{v}</option>)}</select></label>}
          </div>
          {total > 0 ? <ChartVisual points={display} kind={config.kind} format={format} title={title}/> : <p className="flex min-h-52 items-center justify-center text-center text-sm text-slate-400">{l.empty}</p>}
        </article>;
      })}
    </div>
  </section>;
}
