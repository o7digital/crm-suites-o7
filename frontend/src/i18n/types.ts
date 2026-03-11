export type LanguageCode = 'en' | 'fr' | 'es' | 'it' | 'de' | 'pt' | 'nl';

export const LANGUAGE_STORAGE_KEY = 'o7_language';

export const LANGUAGE_OPTIONS: Array<{ value: LanguageCode; label: string }> = [
  { value: 'fr', label: 'Francais' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espanol' },
  { value: 'it', label: 'Italiano' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Portugues' },
  { value: 'nl', label: 'Vlaams / Flamand' },
];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return value === 'en' || value === 'fr' || value === 'es' || value === 'it' || value === 'de' || value === 'pt' || value === 'nl';
}
