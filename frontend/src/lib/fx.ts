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

export function formatUsdTotal(amount: number): string {
  const rounded = Math.round(amount);
  return `USD ${rounded.toLocaleString()}`;
}

