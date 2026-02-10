'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useBranding } from '../../../contexts/BrandingContext';
import { useI18n } from '../../../contexts/I18nContext';
import { LANGUAGE_OPTIONS } from '../../../i18n/types';

export default function AccountAdjustmentsPage() {
  const { language, setLanguage, t } = useI18n();
  const { branding, updateBranding, loading: brandingLoading, error: brandingError } = useBranding();

  const DEFAULT_ACCENT = '#7c3aed';
  const DEFAULT_ACCENT_2 = '#22d3ee';

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoDirty, setLogoDirty] = useState(false);
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT);
  const [accentColor2, setAccentColor2] = useState<string>(DEFAULT_ACCENT_2);
  const [skinError, setSkinError] = useState<string | null>(null);
  const [skinInfo, setSkinInfo] = useState<string | null>(null);
  const accentSaveTimerRef = useRef<number | null>(null);
  const accent2SaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!logoDirty) setLogoDataUrl(branding.logoDataUrl);
    setAccentColor(branding.accentColor || DEFAULT_ACCENT);
    setAccentColor2(branding.accentColor2 || DEFAULT_ACCENT_2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding.logoDataUrl, branding.accentColor, branding.accentColor2, logoDirty]);

  const logoHint = useMemo(() => t('account.skin.logoHint'), [t]);

  const handleLogoChange = async (file: File | null) => {
    setSkinError(null);
    setSkinInfo(null);
    if (!file) return;

    const maxBytes = 250 * 1024;
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
    setLogoDirty(true);
    setLogoDataUrl(dataUrl);
  };

  const saveAccentColor = async (next: string) => {
    setSkinError(null);
    setSkinInfo(null);
    setAccentColor(next);
    try {
      await updateBranding({ accentColor: next });
      setSkinInfo(t('common.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save';
      setSkinError(message);
    }
  };

  const saveAccentColor2 = async (next: string) => {
    setSkinError(null);
    setSkinInfo(null);
    setAccentColor2(next);
    try {
      await updateBranding({ accentColor2: next });
      setSkinInfo(t('common.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save';
      setSkinError(message);
    }
  };

  const scheduleSaveAccentColor = (next: string) => {
    setAccentColor(next);
    if (accentSaveTimerRef.current) window.clearTimeout(accentSaveTimerRef.current);
    accentSaveTimerRef.current = window.setTimeout(() => {
      accentSaveTimerRef.current = null;
      // Debounced save so the palette feels "instant" without spamming the API.
      void saveAccentColor(next);
    }, 180);
  };

  const scheduleSaveAccentColor2 = (next: string) => {
    setAccentColor2(next);
    if (accent2SaveTimerRef.current) window.clearTimeout(accent2SaveTimerRef.current);
    accent2SaveTimerRef.current = window.setTimeout(() => {
      accent2SaveTimerRef.current = null;
      void saveAccentColor2(next);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (accentSaveTimerRef.current) window.clearTimeout(accentSaveTimerRef.current);
      if (accent2SaveTimerRef.current) window.clearTimeout(accent2SaveTimerRef.current);
    };
  }, []);

  const saveSkin = async (e: FormEvent) => {
    e.preventDefault();
    setSkinError(null);
    setSkinInfo(null);
    try {
      await updateBranding({
        logoDataUrl,
        accentColor: accentColor || null,
        accentColor2: accentColor2 || null,
      });
      setLogoDirty(false);
      setSkinInfo(t('common.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save';
      setSkinError(message);
    }
  };

  const resetSkin = () => {
    setLogoDirty(true);
    setLogoDataUrl(null);
    setAccentColor(DEFAULT_ACCENT);
    setAccentColor2(DEFAULT_ACCENT_2);
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

            <form className="mt-4 space-y-4" onSubmit={saveSkin}>
              <div className="grid gap-4 md:grid-cols-2">
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
                        setLogoDirty(true);
                        setLogoDataUrl(null);
                      }}
                      disabled={!logoDataUrl}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-slate-300">{t('account.skin.accent')}</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="color"
                        value={accentColor}
                        onInput={(e) => scheduleSaveAccentColor((e.target as HTMLInputElement).value)}
                        onChange={(e) => scheduleSaveAccentColor(e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                        aria-label={t('account.skin.accent')}
                      />
                      <input
                        className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== branding.accentColor) void saveAccentColor(v);
                        }}
                        placeholder={DEFAULT_ACCENT}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-300">{t('account.skin.accent2')}</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="color"
                        value={accentColor2}
                        onInput={(e) => scheduleSaveAccentColor2((e.target as HTMLInputElement).value)}
                        onChange={(e) => scheduleSaveAccentColor2(e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                        aria-label={t('account.skin.accent2')}
                      />
                      <input
                        className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                        value={accentColor2}
                        onChange={(e) => setAccentColor2(e.target.value)}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== branding.accentColor2) void saveAccentColor2(v);
                        }}
                        placeholder={DEFAULT_ACCENT_2}
                      />
                    </div>
                  </div>
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
