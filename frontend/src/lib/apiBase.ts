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

function isBrowserLocalhost() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export function apiBaseForRequests(): string {
  if (configuredExternalApiBase) return configuredExternalApiBase;
  if (isBrowserLocalhost()) return fallbackLocalApiBase;
  return '/api';
}

export function apiBaseForServerRequests(): string {
  return configuredExternalApiBase || fallbackLocalApiBase;
}

export function apiBaseForDisplay(): string {
  if (configuredExternalApiBase) return configuredExternalApiBase;
  if (isBrowserLocalhost()) return fallbackLocalApiBase;
  return '/api';
}
