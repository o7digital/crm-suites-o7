'use client';

import { ReactNode, useMemo, useState } from 'react';

async function copyToClipboard(text: string) {
  if (!text) return;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for older browsers.
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', 'true');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

export function IAResultSection({
  title,
  subtitle,
  loading,
  error,
  copyText,
  children,
}: {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  copyText?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const canCopy = useMemo(() => Boolean(copyText && copyText.trim().length > 0), [copyText]);

  const handleCopy = async () => {
    if (!canCopy || !copyText) return;
    try {
      await copyToClipboard(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore copy errors
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {loading ? <span className="text-xs text-slate-400">Chargement...</span> : null}
          {canCopy ? (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
            >
              {copied ? 'Copie OK' : 'Copier'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
