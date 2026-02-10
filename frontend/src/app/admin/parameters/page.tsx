'use client';

import Link from 'next/link';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';

const tiles = [
  {
    href: '/admin/parameters/customers',
    title: 'Customers',
    description: 'New fields (address, website, tax id, etc.).',
  },
  {
    href: '/admin/parameters/crm',
    title: 'CRM',
    description: 'Workspace setup: B2B/B2C mode + industry.',
  },
  {
    href: '/admin/parameters/products',
    title: 'Products',
    description: 'List of products that can be selected in CRM deals.',
  },
] as const;

export default function AdminParametersPage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Parameters</h1>
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
