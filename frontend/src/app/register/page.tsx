'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';

export default function RegisterPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center px-4 text-slate-300">{t('common.loading')}</div>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}

function RegisterPageContent() {
  const { register } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const inviteTenantId = (searchParams.get('tenantId') || '').trim();
  const inviteTenantName = (searchParams.get('tenantName') || '').trim();
  const inviteName = (searchParams.get('name') || '').trim();
  const inviteEmail = (searchParams.get('email') || '').trim();
  const isInvite = Boolean(inviteTenantId);

  const [tenantName, setTenantName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isInvite) return;
    setTenantName(inviteTenantName || tenantName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteTenantId, inviteTenantName, isInvite]);

  useEffect(() => {
    if (!isInvite) return;
    if (inviteName) setName((prev) => prev || inviteName);
    if (inviteEmail) setEmail((prev) => prev || inviteEmail);
  }, [inviteEmail, inviteName, isInvite]);

  const tenantNameDisabled = useMemo(() => isInvite && Boolean(inviteTenantName), [inviteTenantName, isInvite]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const result = await register({ tenantId: inviteTenantId || undefined, tenantName, name, email, password });
      if (result === 'confirm') {
        setInfo(t('register.checkEmail'));
        return;
      }
      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to register';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">o7 PulseCRM</p>
        <h1 className="mt-2 text-2xl font-semibold">{t('register.title')}</h1>
        <p className="text-sm text-slate-400">{t('register.subtitle')}</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm text-slate-300">{t('register.tenantName')}</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              required
              disabled={tenantNameDisabled}
            />
            {isInvite ? (
              <p className="mt-1 text-xs text-slate-500">
                {t('register.joiningWorkspace')}
              </p>
            ) : null}
          </div>
          <div>
            <label className="text-sm text-slate-300">{t('register.yourName')}</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-300">{t('field.email')}</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-300">{t('field.password')}</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {info && <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{info}</div>}
          {error && <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</div>}
          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? t('register.creating') : t('auth.createAccount')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {t('register.haveAccount')}{' '}
          <Link href="/login" className="text-cyan-300 underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
