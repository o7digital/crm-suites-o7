'use client';

import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '../../contexts/AuthContext';

export default function ExportPage() {
  const { token } = useAuth();
  const api = useApi(token);

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
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Data</p>
          <h1 className="text-3xl font-semibold">Export</h1>
          <p className="text-sm text-slate-400">One-click CSV exports for demos or migrations.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-lg font-semibold">Clients CSV</h3>
            <p className="text-sm text-slate-400">Download all client records scoped to your tenant.</p>
            <button className="btn-primary mt-4" onClick={() => download('clients')}>
              Export clients
            </button>
          </div>
          <div className="card p-5">
            <h3 className="text-lg font-semibold">Invoices CSV</h3>
            <p className="text-sm text-slate-400">Revenue snapshot including extracted data fields.</p>
            <button className="btn-primary mt-4" onClick={() => download('invoices')}>
              Export invoices
            </button>
          </div>
        </div>
      </AppShell>
    </Guard>
  );
}
