'use client';

import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';

export default function IaPulsePage() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">o7 IA Pulse</p>
          <h1 className="text-3xl font-semibold">Assistant</h1>
        </div>

        <div className="card p-6 text-slate-300">
          Foundations only for now. Next: connect O7 Chat AI and add actions (draft emails, summarize calls, generate
          proposals, extract invoice fields).
        </div>
      </AppShell>
    </Guard>
  );
}

