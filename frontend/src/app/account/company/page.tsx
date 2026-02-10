'use client';

import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useI18n } from '../../../contexts/I18nContext';

export default function AccountCompanyPage() {
  const { t } = useI18n();

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('account.myAccount')}</p>
          <h1 className="text-3xl font-semibold">{t('account.companyDetail')}</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Foundations only for now. Next: store company profile on the tenant (name, address, tax IDs, billing emails).
        </div>
      </AppShell>
    </Guard>
  );
}
