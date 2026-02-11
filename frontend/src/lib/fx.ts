export type FxRatesSnapshot = {
  provider?: string;
  base: 'USD';
  date: string;
  rates: Record<string, number>;
  fetchedAt?: number;
};

/**
 * Convert an amount in `currency` to USD using a USD-based rate snapshot.
 * `rates` contains how much of each currency equals 1 USD (ex: USD->MXN).
 * So: amountInUsd = amountInCurrency / rate[currency].
 */
export function toUsd(amount: number, currency: string, snapshot: FxRatesSnapshot): number | null {
  const cur = (currency || 'USD').toUpperCase();
  if (cur === 'USD') return amount;
  const rate = snapshot.rates[cur];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return amount / rate;
}

export function convertCurrency(amount: number, from: string, to: string, snapshot: FxRatesSnapshot): number | null {
  const source = (from || 'USD').toUpperCase();
  const target = (to || 'USD').toUpperCase();
  if (source === target) return amount;

  const amountInUsd = toUsd(amount, source, snapshot);
  if (amountInUsd === null) return null;
  if (target === 'USD') return amountInUsd;

  const targetRate = snapshot.rates[target];
  if (!Number.isFinite(targetRate) || targetRate <= 0) return null;
  return amountInUsd * targetRate;
}

export function formatCurrencyTotal(amount: number, currency: string): string {
  const cur = (currency || 'USD').toUpperCase();
  const rounded = Math.round(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(rounded);
  } catch {
    return `${cur} ${rounded.toLocaleString()}`;
  }
}

export function formatUsdTotal(amount: number): string {
  const rounded = Math.round(amount);
  return `USD ${rounded.toLocaleString()}`;
}
