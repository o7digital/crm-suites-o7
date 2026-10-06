'use client';

import Link from 'next/link';
import { ChartVisual } from './ReportingCharts';
import { useI18n } from '../contexts/I18nContext';
import { compactPoints, type ChartPoint } from '../lib/reporting-charts';

const labels = {
  en: {title:'Your workspace at a glance', deals:'Opportunities by status', tasks:'Tasks by status', pipelines:'Open opportunities by pipeline', open:'Open', won:'Won', lost:'Lost', pending:'Pending', progress:'In progress', done:'Completed', empty:'No data yet. Charts will appear as your workspace becomes active.', other:'Other', reporting:'Customize charts in Reporting', hint:'Current workspace · all available activity'},
  fr: {title:'Votre espace en un coup d’œil', deals:'Opportunités par statut', tasks:'Tâches par statut', pipelines:'Opportunités ouvertes par pipeline', open:'Ouvertes', won:'Gagnées', lost:'Perdues', pending:'En attente', progress:'En cours', done:'Terminées', empty:'Aucune donnée pour le moment. Les graphiques se rempliront avec l’activité de votre espace.', other:'Autres', reporting:'Personnaliser les graphiques dans Reporting', hint:'Espace actuel · toute l’activité disponible'},
  es: {title:'Tu espacio de un vistazo', deals:'Oportunidades por estado', tasks:'Tareas por estado', pipelines:'Oportunidades abiertas por pipeline', open:'Abiertas', won:'Ganadas', lost:'Perdidas', pending:'Pendientes', progress:'En curso', done:'Completadas', empty:'Sin datos todavía. Los gráficos se completarán con la actividad de tu espacio.', other:'Otros', reporting:'Personalizar gráficos en Reporting', hint:'Espacio actual · toda la actividad disponible'},
};

type Props = {
  stats: { open: { count: number }; won: { count: number }; lost: { count: number } };
  tasks: Record<string, number>;
  pipelines: { pipelineId: string; name: string; open: number }[];
};
export function DashboardCharts({ stats, tasks, pipelines }: Props) {
  const { language } = useI18n();
  const l = labels[language as keyof typeof labels] || labels.en;
  const format = (value: number) => new Intl.NumberFormat(language, {maximumFractionDigits:0}).format(value);
  const point = (key: string, label: string, value: number): ChartPoint => ({ key, label, value: Number.isFinite(value) ? Math.max(0,value) : 0 });
  const statusLabels: Record<string,string> = { PENDING:l.pending, IN_PROGRESS:l.progress, DONE:l.done };
  const cards = [
    { title:l.deals, kind:'pie' as const, points:[point('open',l.open,stats.open.count),point('won',l.won,stats.won.count),point('lost',l.lost,stats.lost.count)] },
    { title:l.tasks, kind:'pie' as const, points:Object.entries(tasks).map(([status,count]) => point(status,statusLabels[status] || status,count)) },
    { title:l.pipelines, kind:'bar' as const, points:compactPoints(pipelines.map(p => point(p.pipelineId,p.name,p.open)).sort((a,b)=>b.value-a.value),l.other) },
  ];
  return <section aria-label={l.title} className="mt-6">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">{l.title}</h2><p className="mt-1 text-xs text-slate-400">{l.hint}</p></div><Link href="/admin/reporting" className="text-sm text-cyan-300 hover:underline">{l.reporting}</Link></div>
    <div className="grid gap-4 lg:grid-cols-3">{cards.map(card => <article key={card.title} className="card p-5" aria-label={card.title}>
      <h3 className="font-semibold">{card.title}</h3>
      {card.points.some(p=>p.value>0) ? <ChartVisual title={card.title} kind={card.kind} points={card.points} format={format}/> : <p className="flex min-h-64 items-center justify-center text-center text-sm text-slate-400">{l.empty}</p>}
    </article>)}</div>
  </section>;
}
