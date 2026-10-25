'use client';

import { useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { getClientDisplayName } from '@/lib/clients';
import { monthlySales } from '@/lib/monthly-sales';
import { salesClosedDate, type SalesDeal } from '@/lib/sales-reporting';

const labels = {
  fr: { title: 'Ventes par mois', hint: 'Ventes gagnées selon leur date de clôture. Les montants sont filtrés par devise, sans conversion.', currency: 'Devise des ventes', revenue: 'Chiffre d’affaires', count: 'Ventes réalisées', average: 'Panier moyen', month: 'Mois', sale: 'Ce qui a été vendu', client: 'Contact', date: 'Date de clôture', amount: 'Montant', empty: 'Aucune vente dans cette devise sur la période.', noSales: 'Aucune vente ce mois-ci', total: 'Total', noClient: 'Sans contact' },
  en: { title: 'Monthly sales', hint: 'Won deals by closing date. Amounts are filtered by currency, without conversion.', currency: 'Sales currency', revenue: 'Revenue', count: 'Sales completed', average: 'Average sale', month: 'Month', sale: 'What was sold', client: 'Contact', date: 'Closing date', amount: 'Amount', empty: 'No sales in this currency during this period.', noSales: 'No sales this month', total: 'Total', noClient: 'No contact' },
  es: { title: 'Ventas por mes', hint: 'Ventas ganadas por fecha de cierre. Importes filtrados por moneda, sin conversión.', currency: 'Moneda de ventas', revenue: 'Ingresos', count: 'Ventas realizadas', average: 'Venta promedio', month: 'Mes', sale: 'Qué se vendió', client: 'Contacto', date: 'Fecha de cierre', amount: 'Importe', empty: 'Sin ventas en esta moneda durante el período.', noSales: 'Sin ventas este mes', total: 'Total', noClient: 'Sin contacto' },
};

export function MonthlySalesReport({ deals, startDate, endDate }: { deals: SalesDeal[]; startDate: string; endDate: string }) {
  const { language } = useI18n();
  const l = labels[language as keyof typeof labels] || labels.en;
  const currencies = [...new Set(deals.map(d => d.currency).filter((c): c is string => Boolean(c)))].sort();
  const [selected, setSelected] = useState('');
  const currency = currencies.includes(selected) ? selected : currencies[0] || 'USD';
  const months = monthlySales(deals, startDate, endDate, currency);
  const total = months.reduce((sum, m) => sum + m.total, 0);
  const count = months.reduce((sum, m) => sum + m.deals.length, 0);
  const max = Math.max(1, ...months.map(m => m.total));
  const money = (value: number) => `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  const monthLabel = (key: string) => new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
  return <section className="card space-y-6 p-5" aria-label={l.title}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-semibold">{l.title}</h2><p className="mt-1 text-sm text-slate-400">{l.hint}</p><p className="mt-1 text-xs text-slate-400">{startDate} → {endDate} · {currency}</p></div>
      <label className="no-print text-sm">{l.currency}<select className="ml-3 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10" value={currency} onChange={e => setSelected(e.target.value)}>{[...new Set([currency, ...currencies])].map(c => <option key={c} value={c}>{c}</option>)}</select></label>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{[[l.revenue, money(total)], [l.count, count], [l.average, money(count ? total / count : 0)]].map(([label, value]) => <div key={label} className="rounded-lg bg-white/5 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    {!count && <p role="status" className="text-sm text-slate-400">{l.empty}</p>}
    <div className="overflow-x-auto" role="img" aria-label={`${l.revenue} · ${l.month} · ${currency}`}>
      <div className="flex h-64 items-end gap-3 border-b border-white/20 pb-2" style={{ minWidth: Math.max(360, months.length * 90) }}>
        {months.map(m => <div key={m.key} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center text-xs">
          <span className="mb-2 tabular-nums">{money(m.total)}</span>
          <div className="mx-auto w-full max-w-16 rounded-t bg-cyan-400" style={{ height: `${m.total / max * 70}%`, minHeight: m.total ? 3 : 0, printColorAdjust: 'exact' }} title={`${monthLabel(m.key)}: ${money(m.total)} · ${m.deals.length} ${l.count}`} />
          <span className="mt-2 text-slate-400">{monthLabel(m.key)}</span>
        </div>)}
      </div>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr>{[l.month, l.count, l.revenue].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{months.map(m => <tr key={m.key} className="border-t border-white/10"><th scope="row" className="p-3 font-medium">{monthLabel(m.key)}</th><td className="p-3">{m.deals.length}</td><td className="p-3 tabular-nums">{money(m.total)}</td></tr>)}</tbody><tfoot><tr className="border-t border-white/20 font-semibold"><th className="p-3">{l.total}</th><td className="p-3">{count}</td><td className="p-3">{money(total)}</td></tr></tfoot></table></div>
    {months.map(m => <div key={m.key} style={{ breakInside: 'avoid' }}><h3 className="mb-3 font-semibold">{monthLabel(m.key)} · {money(m.total)}</h3>{m.deals.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr>{[l.sale, l.client, l.date, l.amount].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{m.deals.map(deal => <tr key={deal.id} className="border-t border-white/10"><th scope="row" className="p-3 font-medium">{deal.title}</th><td className="p-3">{deal.client ? getClientDisplayName(deal.client) : l.noClient}</td><td className="whitespace-nowrap p-3">{salesClosedDate(deal)}</td><td className="whitespace-nowrap p-3 tabular-nums">{money(Math.max(0, Number(deal.value) || 0))}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-400">{l.noSales}</p>}</div>)}
  </section>;
}
