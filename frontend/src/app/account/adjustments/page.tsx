'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useBranding } from '../../../contexts/BrandingContext';
import { useI18n } from '../../../contexts/I18nContext';
import { LANGUAGE_OPTIONS } from '../../../i18n/types';

type ThemeDraft = {
  backgroundColor: string;
  surfaceColor: string;
  cardColor: string;
  foregroundColor: string;
  mutedColor: string;
  accentColor: string;
  accentColor2: string;
};

type ThemeColorKey = keyof ThemeDraft;

const DEFAULT_THEME: ThemeDraft = {
  backgroundColor: '#0b1021',
  surfaceColor: '#0f1629',
  cardColor: '#151d32',
  foregroundColor: '#e9edf5',
  mutedColor: '#9fb3c8',
  accentColor: '#7c3aed',
  accentColor2: '#22d3ee',
};

const COLOR_FIELDS: Array<{ key: ThemeColorKey; labelKey: string }> = [
  { key: 'backgroundColor', labelKey: 'account.skin.background' },
  { key: 'surfaceColor', labelKey: 'account.skin.surface' },
  { key: 'cardColor', labelKey: 'account.skin.card' },
  { key: 'foregroundColor', labelKey: 'account.skin.foreground' },
  { key: 'mutedColor', labelKey: 'account.skin.muted' },
  { key: 'accentColor', labelKey: 'account.skin.accent' },
  { key: 'accentColor2', labelKey: 'account.skin.accent2' },
];

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value.trim());
}

export default function AccountAdjustmentsPage() {
  const { language, setLanguage, t } = useI18n();
  const { branding, updateBranding, loading: brandingLoading, error: brandingError } = useBranding();

  const [logoOverride, setLogoOverride] = useState<string | null | undefined>(undefined);
  const [themeOverrides, setThemeOverrides] = useState<Partial<ThemeDraft>>({});
  const [skinError, setSkinError] = useState<string | null>(null);
  const [skinInfo, setSkinInfo] = useState<string | null>(null);

  const brandingTheme = useMemo<ThemeDraft>(
    () => ({
      backgroundColor: branding.backgroundColor || DEFAULT_THEME.backgroundColor,
      surfaceColor: branding.surfaceColor || DEFAULT_THEME.surfaceColor,
      cardColor: branding.cardColor || DEFAULT_THEME.cardColor,
      foregroundColor: branding.foregroundColor || DEFAULT_THEME.foregroundColor,
      mutedColor: branding.mutedColor || DEFAULT_THEME.mutedColor,
      accentColor: branding.accentColor || DEFAULT_THEME.accentColor,
      accentColor2: branding.accentColor2 || DEFAULT_THEME.accentColor2,
    }),
    [
      branding.accentColor,
      branding.accentColor2,
      branding.backgroundColor,
      branding.cardColor,
      branding.foregroundColor,
      branding.mutedColor,
      branding.surfaceColor,
    ],
  );

  const themeDraft = useMemo<ThemeDraft>(
    () => ({
      ...brandingTheme,
      ...themeOverrides,
    }),
    [brandingTheme, themeOverrides],
  );

  const logoDataUrl = logoOverride === undefined ? branding.logoDataUrl : logoOverride;

  const logoHint = useMemo(() => t('account.skin.logoHint'), [t]);

  const previewStyle = useMemo<CSSProperties>(
    () => ({
      background: `radial-gradient(120% 120% at 10% 20%, color-mix(in srgb, ${themeDraft.accentColor2} 16%, transparent), transparent), radial-gradient(90% 90% at 80% 10%, color-mix(in srgb, ${themeDraft.accentColor} 20%, transparent), transparent), ${themeDraft.backgroundColor}`,
      color: themeDraft.foregroundColor,
      borderColor: `color-mix(in srgb, ${themeDraft.foregroundColor} 10%, transparent)`,
    }),
    [themeDraft],
  );

  const previewCardStyle = useMemo<CSSProperties>(
    () => ({
      background: `linear-gradient(145deg, color-mix(in srgb, ${themeDraft.cardColor} 95%, transparent), color-mix(in srgb, ${themeDraft.surfaceColor} 96%, transparent))`,
      border: `1px solid color-mix(in srgb, ${themeDraft.foregroundColor} 8%, transparent)`,
      color: themeDraft.foregroundColor,
    }),
    [themeDraft],
  );

  const previewSecondaryButtonStyle = useMemo<CSSProperties>(
    () => ({
      background: `color-mix(in srgb, ${themeDraft.surfaceColor} 82%, white 6%)`,
      color: themeDraft.foregroundColor,
      border: `1px solid color-mix(in srgb, ${themeDraft.foregroundColor} 10%, transparent)`,
    }),
    [themeDraft],
  );

  const previewPrimaryButtonStyle = useMemo<CSSProperties>(
    () => ({
      background: `linear-gradient(120deg, ${themeDraft.accentColor}, ${themeDraft.accentColor2})`,
      color: '#fff',
    }),
    [themeDraft],
  );

  const handleLogoChange = async (file: File | null) => {
    setSkinError(null);
    setSkinInfo(null);
    if (!file) return;

    const maxBytes = 800 * 1024;
    if (file.size > maxBytes) {
      setSkinError(t('account.skin.logoTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setSkinError(t('account.skin.logoInvalid'));
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
    setLogoOverride(dataUrl);
  };

  const updateThemeField = (key: ThemeColorKey, value: string) => {
    setThemeOverrides((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const saveSkin = async (e: FormEvent) => {
    e.preventDefault();
    setSkinError(null);
    setSkinInfo(null);

    const invalidField = COLOR_FIELDS.find((field) => !isHexColor(themeDraft[field.key]));
    if (invalidField) {
      setSkinError(`${t(invalidField.labelKey)}: ${t('account.skin.invalidHex')}`);
      return;
    }

    try {
      await updateBranding({
        logoDataUrl,
        backgroundColor: themeDraft.backgroundColor,
        surfaceColor: themeDraft.surfaceColor,
        cardColor: themeDraft.cardColor,
        foregroundColor: themeDraft.foregroundColor,
        mutedColor: themeDraft.mutedColor,
        accentColor: themeDraft.accentColor,
        accentColor2: themeDraft.accentColor2,
      });
      setLogoOverride(undefined);
      setThemeOverrides({});
      setSkinInfo(t('common.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save';
      setSkinError(message);
    }
  };

  const resetSkin = () => {
    setLogoOverride(null);
    setThemeOverrides({ ...DEFAULT_THEME });
    setSkinInfo(null);
    setSkinError(null);
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('account.myAccount')}</p>
          <h1 className="text-3xl font-semibold">{t('account.adjustments')}</h1>
        </div>

        <div className="space-y-4">
          <div className="card p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">{t('account.language')}</p>
                <p className="mt-1 text-sm text-slate-400">{t('account.languageHint')}</p>
              </div>
              <select
                className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">{t('account.skin.title')}</p>
                <p className="mt-1 text-sm text-slate-400">{t('account.skin.subtitle')}</p>
              </div>
            </div>

            <form className="mt-4 space-y-5" onSubmit={saveSkin}>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="space-y-5">
                  <div>
                    <label className="text-sm text-slate-300">{t('account.skin.logo')}</label>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                        {logoDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logoDataUrl} alt="Logo preview" className="h-full w-full object-contain p-1" />
                        ) : (
                          <div className="text-xs text-slate-500">—</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          className="block w-full text-sm text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-100 hover:file:bg-white/15"
                          onChange={(e) => void handleLogoChange(e.target.files?.[0] || null)}
                        />
                        <p className="mt-1 text-xs text-slate-500">{logoHint}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() => {
                          setLogoOverride(null);
                        }}
                        disabled={!logoDataUrl}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-100">{t('account.skin.preview')}</p>
                    <div className="mt-3 overflow-hidden rounded-[24px] border p-4" style={previewStyle}>
                      <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={previewCardStyle}>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                            style={{ background: `linear-gradient(135deg, ${themeDraft.accentColor2}, ${themeDraft.accentColor})` }}
                          >
                            o7
                          </div>
                          <div>
                            <p className="font-semibold">{t('nav.dashboard')}</p>
                            <p style={{ color: themeDraft.mutedColor }}>{t('account.skin.previewHint')}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="rounded-xl px-3 py-2 text-sm" style={previewSecondaryButtonStyle}>
                            {t('common.cancel')}
                          </button>
                          <button type="button" className="rounded-xl px-3 py-2 text-sm font-semibold" style={previewPrimaryButtonStyle}>
                            {t('common.save')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {COLOR_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label className="text-sm text-slate-300">{t(field.labelKey)}</label>
                      <div className="mt-2 flex items-center gap-3">
                        <input
                          type="color"
                          value={isHexColor(themeDraft[field.key]) ? themeDraft[field.key] : DEFAULT_THEME[field.key]}
                          onChange={(e) => updateThemeField(field.key, e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                          aria-label={t(field.labelKey)}
                        />
                        <input
                          className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                          value={themeDraft[field.key]}
                          onChange={(e) => updateThemeField(field.key, e.target.value)}
                          placeholder={DEFAULT_THEME[field.key]}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {(skinInfo || skinError || brandingError) && (
                <div className="space-y-2">
                  {skinInfo ? <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{skinInfo}</div> : null}
                  {skinError ? <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{skinError}</div> : null}
                  {brandingError ? <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{brandingError}</div> : null}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" className="btn-secondary text-sm" onClick={resetSkin}>
                  {t('account.skin.reset')}
                </button>
                <button type="submit" className="btn-primary text-sm" disabled={brandingLoading}>
                  {brandingLoading ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </AppShell>
    </Guard>
  );
}
