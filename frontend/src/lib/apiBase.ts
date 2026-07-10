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
  return configuredExternalApiBase || fallbackLocalApiBase;
}

export function apiBaseForDisplay(): string {
  return configuredExternalApiBase || fallbackLocalApiBase;
}
