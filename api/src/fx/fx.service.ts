import { Injectable } from '@nestjs/common';

type FxRatesSnapshot = {
  provider: 'frankfurter';
  base: 'USD';
  date: string;
  rates: Record<string, number>;
  fetchedAt: number;
};

@Injectable()
export class FxService {
  private cache: FxRatesSnapshot | null = null;
  private inFlight: Promise<FxRatesSnapshot> | null = null;

  private ttlMs(): number {
    const raw = process.env.FX_RATES_TTL_MS;
    const parsed = raw ? Number(raw) : NaN;
    // Default: 12h.
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 12 * 60 * 60 * 1000;
  }

  private async fetchFrankfurterUsd(): Promise<FxRatesSnapshot> {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD', {
      headers: {
        // Helps debugging and avoids some bot protections.
        'user-agent': 'o7-pulsecrm/1.0 (fx rates)',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`FX rates fetch failed (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`);
    }

    const data = (await res.json()) as {
      base?: string;
      date?: string;
      rates?: Record<string, number>;
    };

    const rates = data.rates ?? {};
    // Add USD for easier conversions.
    rates.USD = 1;

    return {
      provider: 'frankfurter',
      base: 'USD',
      date: typeof data.date === 'string' ? data.date : new Date().toISOString().slice(0, 10),
      rates,
      fetchedAt: Date.now(),
    };
  }

  async getUsdRates(): Promise<FxRatesSnapshot> {
    const now = Date.now();
    const ttl = this.ttlMs();
    if (this.cache && now - this.cache.fetchedAt < ttl) return this.cache;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchFrankfurterUsd()
      .then((snapshot) => {
        this.cache = snapshot;
        return snapshot;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /**
   * Convert an amount in `currency` to USD using a USD-based rate snapshot.
   * `rates` contains how much of each currency equals 1 USD (ex: USD->MXN).
   * So: amountInUsd = amountInCurrency / rate[currency].
   */
  toUsd(amount: number, currency: string, snapshot: FxRatesSnapshot): number | null {
    const cur = (currency || 'USD').toUpperCase();
    if (cur === 'USD') return amount;
    const rate = snapshot.rates[cur];
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return amount / rate;
  }
}

