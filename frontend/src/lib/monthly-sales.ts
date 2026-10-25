import { salesClosedDate, salesDealStatus, type SalesDeal } from './sales-reporting';

export function monthlySales(deals: SalesDeal[], start: string, end: string, currency: string) {
  const months: { key: string; total: number; deals: SalesDeal[] }[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return months;
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const last = end.slice(0, 7);
  while (Number.isFinite(cursor.getTime()) && cursor.toISOString().slice(0, 7) <= last) {
    months.push({ key: cursor.toISOString().slice(0, 7), total: 0, deals: [] });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const byMonth = new Map(months.map(month => [month.key, month]));
  for (const deal of deals) {
    const date = salesClosedDate(deal);
    if (salesDealStatus(deal) !== 'WON' || deal.currency !== currency || date < start || date > end) continue;
    const month = byMonth.get(date.slice(0, 7));
    if (!month) continue;
    month.deals.push(deal);
    const amount = Number(deal.value);
    month.total += Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  for (const month of months) month.deals.sort((a, b) => salesClosedDate(a).localeCompare(salesClosedDate(b)) || a.title.localeCompare(b.title));
  return months;
}
