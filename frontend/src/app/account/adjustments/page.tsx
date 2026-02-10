'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useI18n } from '../../../contexts/I18nContext';
import { LANGUAGE_OPTIONS } from '../../../i18n/types';

export default function AccountAdjustmentsPage() {
  const { language, setLanguage, t } = useI18n();

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
        </div>
      </AppShell>
    </Guard>
  );
}
