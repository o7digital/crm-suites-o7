'use client';

import Link from 'next/link';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';

const tiles = [
  { href: '/admin/users', title: 'Users', description: 'Manage workspace members and permissions.' },
  { href: '/admin/parameters', title: 'Parameters', description: 'Customers fields and product catalog.' },
  { href: '/admin/ocr-scan', title: 'OCR - Scan', description: 'Upload and process invoices with OCR extraction.' },
  { href: '/admin/subscriptions', title: 'Subscriptions', description: 'Billing and subscription foundations.' },
  { href: '/admin/mail', title: 'Mail integration', description: 'Connect O7 Workspace (Mailcow) or SMTP.' },
  { href: '/admin/benchmarking', title: 'Benchmarking', description: 'Evaluate mailing tools and workflows.' },
  { href: '/admin/reporting', title: 'Reporting', description: 'Sales charts and KPI dashboards.' },
  { href: '/admin/goals', title: 'Objectives', description: 'Targets, quotas, and goal tracking.' },
  { href: '/admin/contracts', title: 'Contracts', description: 'Templates and variable fields (Pipedrive-style).' },
] as const;

export default function AdminHomePage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Workspace</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <Link key={tile.href} href={tile.href} className="card group p-5 hover:bg-white/5 transition">
              <p className="text-lg font-semibold">{tile.title}</p>
              <p className="mt-2 text-sm text-slate-400">{tile.description}</p>
              <p className="mt-4 text-xs text-slate-500 group-hover:text-slate-300">Open →</p>
            </Link>
          ))}
        </div>
      </AppShell>
    </Guard>
  );
}
