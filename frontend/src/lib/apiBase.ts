function normalizeApiBase(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const trimmed = value.replace(/\/+$/, '');
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

const fromRoot = normalizeApiBase(process.env.NEXT_PUBLIC_API_ROOT);
const fromLegacy = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

export const API_BASE_URL = fromRoot || fromLegacy || 'http://localhost:4000/api';

export function apiBaseForDisplay(): string {
  return API_BASE_URL;
}
