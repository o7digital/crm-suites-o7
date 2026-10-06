export type ChartMetric = 'deals' | 'revenue' | 'tasks' | 'hours';
export type ChartGroup = 'status' | 'client' | 'period' | 'reason';
export type ChartKind = 'pie' | 'bar' | 'line';
export type ChartConfig = { id: string; metric: ChartMetric; group: ChartGroup; kind: ChartKind; currency: string };
export type ChartRow = { clientId: string; clientName: string; date: string; status: string; reason?: string; currency?: string; value: number };
export type ChartPoint = { key: string; label: string; value: number };
export const DEFAULT_CHARTS: ChartConfig[] = [
  { id: 'outcomes', metric: 'deals', group: 'status', kind: 'pie', currency: 'USD' },
  { id: 'revenue', metric: 'revenue', group: 'client', kind: 'bar', currency: 'USD' },
  { id: 'activity', metric: 'hours', group: 'period', kind: 'line', currency: 'USD' },
];
export function normalizeCharts(raw: unknown): ChartConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_CHARTS.map(c => ({ ...c }));
  const ids = new Set<string>();
  return raw.slice(0, 6).flatMap(c => {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || ids.has(c.id)
      || !['deals', 'revenue', 'tasks', 'hours'].includes(c.metric)
      || !['status', 'client', 'period', 'reason'].includes(c.group)
      || !['pie', 'bar', 'line'].includes(c.kind)) return [];
    ids.add(c.id);
    return [{ id: c.id, metric: c.metric, group: c.group === 'reason' && c.metric !== 'deals' ? 'status' : c.group,
      kind: c.kind, currency: typeof c.currency === 'string' && /^[A-Z]{3}$/.test(c.currency) ? c.currency : 'USD' } as ChartConfig];
  });
}
export function chartPoints(rows: ChartRow[], config: ChartConfig, granularity: 'month' | 'year'): ChartPoint[] {
  const totals = new Map<string, ChartPoint>();
  for (const row of rows) {
    if (config.metric === 'revenue' && (row.status !== 'WON' || row.currency !== config.currency)) continue;
    if (config.group === 'reason' && row.status !== 'LOST') continue;
    const key = config.group === 'client' ? row.clientId : config.group === 'period' ? row.date.slice(0, granularity === 'year' ? 4 : 7)
      : config.group === 'reason' ? row.reason || '__unspecified__' : row.status;
    const label = config.group === 'client' ? row.clientName : key;
    const value = config.metric === 'deals' || config.metric === 'tasks' ? 1 : row.value;
    if (!Number.isFinite(value) || value < 0) continue;
    const point = totals.get(key) || { key, label, value: 0 };
    point.value += value;
    totals.set(key, point);
  }
  const points = [...totals.values()];
  if (config.group === 'period') return points.sort((a, b) => a.key.localeCompare(b.key));
  return points.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
export function compactPoints(points: ChartPoint[], otherLabel: string): ChartPoint[] {
  if (points.length <= 10) return points;
  return [...points.slice(0, 9), { key: '__other__', label: otherLabel, value: points.slice(9).reduce((sum, p) => sum + p.value, 0) }];
}
