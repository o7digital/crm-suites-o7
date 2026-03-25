function normalizeApiBase(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const trimmed = value.replace(/\/+$/, '');
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

const fromRoot = normalizeApiBase(process.env.NEXT_PUBLIC_API_ROOT);
const fromLegacy = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);
const configuredExternalApiBase = fromRoot || fromLegacy;
const fallbackLocalApiBase = 'http://localhost:4000/api';

export function apiBaseForRequests(): string {
  // In the browser, prefer the Next.js `/api` rewrite so requests stay same-origin.
  // This avoids brittle CORS/origin issues across Vercel, Railway, previews, and custom domains.
  if (typeof window !== 'undefined' && configuredExternalApiBase) {
    return '/api';
  }
  return configuredExternalApiBase || fallbackLocalApiBase;
}

export function apiBaseForDisplay(): string {
  if (typeof window !== 'undefined' && configuredExternalApiBase) {
    return `${window.location.origin}/api`;
  }
  return configuredExternalApiBase || fallbackLocalApiBase;
}
