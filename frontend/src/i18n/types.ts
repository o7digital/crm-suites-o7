export type LanguageCode = 'en' | 'fr' | 'es' | 'it' | 'de' | 'pt' | 'nl' | 'ru' | 'no' | 'ja' | 'zh' | 'ar';

export const LANGUAGE_STORAGE_KEY = 'o7_language';

export const LANGUAGE_OPTIONS: Array<{ value: LanguageCode; label: string }> = [
  { value: 'fr', label: 'Francais' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espanol' },
  { value: 'it', label: 'Italiano' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Portugues' },
  { value: 'nl', label: 'Nederlands / Vlaams' },
  { value: 'ru', label: 'Russkii / Русский' },
  { value: 'no', label: 'Norsk' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    value === 'en' ||
    value === 'fr' ||
    value === 'es' ||
    value === 'it' ||
    value === 'de' ||
    value === 'pt' ||
    value === 'nl' ||
    value === 'ru' ||
    value === 'no' ||
    value === 'ja' ||
    value === 'zh' ||
    value === 'ar'
  );
}
