'use client';

import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';

export default function ExportPage() {
  const { token } = useAuth();
  const api = useApi(token);
  const { t } = useI18n();

  const download = async (type: 'clients' | 'invoices') => {
    const csv = await api(`/export/${type}`);
    const blob = new Blob([csv as string], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${type}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">{t('export.section')}</p>
          <h1 className="text-3xl font-semibold">{t('nav.export')}</h1>
          <p className="text-sm text-slate-400">{t('export.subtitle')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-lg font-semibold">{t('export.clients.title')}</h3>
            <p className="text-sm text-slate-400">{t('export.clients.description')}</p>
            <button className="btn-primary mt-4" onClick={() => download('clients')}>
              {t('export.clients.button')}
            </button>
          </div>
          <div className="card p-5">
            <h3 className="text-lg font-semibold">{t('export.invoices.title')}</h3>
            <p className="text-sm text-slate-400">{t('export.invoices.description')}</p>
            <button className="btn-primary mt-4" onClick={() => download('invoices')}>
              {t('export.invoices.button')}
            </button>
          </div>
        </div>
      </AppShell>
    </Guard>
  );
}
