import { Injectable } from '@nestjs/common';

const HF_BASE_URL = 'https://api-inference.huggingface.co/models';

@Injectable()
export class HfClientService {
  private apiKey(): string {
    const key = process.env.HF_API_KEY;
    if (!key) {
      throw new Error('Missing HF_API_KEY in environment variables');
    }
    return key;
  }

  private timeoutMs(): number {
    const raw = process.env.HF_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;
    // Default: 90s. Can be slow when models need to load and `wait_for_model` is true.
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 90_000;
  }

  async callHuggingFace(model: string, payload: unknown): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const res = await fetch(`${HF_BASE_URL}/${model}`, {
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
        throw new Error(`HF Error: ${res.status} | ${raw.slice(0, 600)}`);
      }

      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('HF request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
