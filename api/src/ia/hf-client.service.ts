import { Injectable, Logger } from '@nestjs/common';

// HF deprecated `api-inference.huggingface.co` in late 2025.
// The replacement for the legacy task-style API is:
// https://router.huggingface.co/hf-inference/models/<model>
const DEFAULT_HF_BASE_URL = 'https://router.huggingface.co/hf-inference/models';

function normalizeBaseUrl(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

function resolveBaseUrl(raw?: string): string {
  const normalized = normalizeBaseUrl(raw);
  if (!normalized) return DEFAULT_HF_BASE_URL;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, '');

    // HF deprecated this host; auto-remap to avoid breaking existing env vars.
    if (host === 'api-inference.huggingface.co') {
      return DEFAULT_HF_BASE_URL;
    }

    // If router host is configured without the task path, append the expected path.
    if (host === 'router.huggingface.co') {
      if (!path || path === '/') return DEFAULT_HF_BASE_URL;
      if (path === '/models' || path === '/hf-inference') return DEFAULT_HF_BASE_URL;
      if (path.startsWith('/hf-inference/models')) return `${url.origin}${path}`;
      return `${url.origin}/hf-inference/models`;
    }
  } catch {
    // Not a valid URL: keep previous behavior and let request errors explain.
  }

  return normalized;
}

@Injectable()
export class HfClientService {
  private readonly logger = new Logger(HfClientService.name);

  private apiKeySource(): 'HF_API_KEY' | 'HF_TOKEN' | null {
    if ((process.env.HF_API_KEY || '').trim()) return 'HF_API_KEY';
    if ((process.env.HF_TOKEN || '').trim()) return 'HF_TOKEN';
    return null;
  }

  private apiKey(): string {
    // HF docs now commonly refer to the token as `HF_TOKEN`; keep `HF_API_KEY`
    // for backward-compat and avoid breaking existing deployments.
    const key = (process.env.HF_API_KEY || process.env.HF_TOKEN || '').trim();
    if (!key) {
      throw new Error('Missing HF_API_KEY (or HF_TOKEN) in environment variables');
    }
    return key;
  }

  private baseUrl(): string {
    // Allows overriding for testing or future provider changes.
    const raw =
      process.env.HF_BASE_URL ||
      process.env.HF_INFERENCE_BASE_URL ||
      process.env.HF_API_URL ||
      process.env.HF_INFERENCE_URL;
    return resolveBaseUrl(raw);
  }

  private timeoutMs(): number {
    const raw = process.env.HF_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;
    // Default: 20s for responsive UX; override with HF_TIMEOUT_MS if needed.
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 20_000;
  }

  diagnostics(): {
    baseUrl: string;
    timeoutMs: number;
    keySource: 'HF_API_KEY' | 'HF_TOKEN' | null;
    hasKey: boolean;
  } {
    const keySource = this.apiKeySource();
    return {
      baseUrl: this.baseUrl(),
      timeoutMs: this.timeoutMs(),
      keySource,
      hasKey: Boolean(keySource),
    };
  }

  async callHuggingFace(model: string, payload: unknown): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    const baseUrl = this.baseUrl();
    const startedAt = Date.now();
    this.logger.log(
      `HF request start model="${model}" baseUrl="${baseUrl}" timeoutMs=${this.timeoutMs()} keySource=${this.apiKeySource() ?? 'none'}`,
    );

    try {
      const res = await fetch(`${baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey()}`,
          'Content-Type': 'application/json',
          // Helps debugging and avoids some bot protections.
          'user-agent': 'o7-pulsecrm/1.0 (hf inference)',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const raw = await res.text().catch(() => '');

      if (!res.ok) {
        this.logger.warn(
          `HF request failed model="${model}" status=${res.status} durationMs=${Date.now() - startedAt} body="${raw
            .slice(0, 300)
            .replace(/\s+/g, ' ')}"`,
        );
        throw new Error(`HF Error: ${res.status} | ${raw.slice(0, 600)}`);
      }

      this.logger.log(`HF request success model="${model}" status=${res.status} durationMs=${Date.now() - startedAt}`);

      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error(`HF request timeout model="${model}" durationMs=${Date.now() - startedAt}`);
        throw new Error('HF request timed out');
      }
      this.logger.error(
        `HF request error model="${model}" durationMs=${Date.now() - startedAt} message="${err instanceof Error ? err.message : String(err)}"`,
      );
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
