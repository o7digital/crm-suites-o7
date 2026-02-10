export type LanguageCode = 'en' | 'fr' | 'es';

export const LANGUAGE_STORAGE_KEY = 'o7_language';

export const LANGUAGE_OPTIONS: Array<{ value: LanguageCode; label: string }> = [
  { value: 'fr', label: 'Francais' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espanol' },
];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return value === 'en' || value === 'fr' || value === 'es';
}

