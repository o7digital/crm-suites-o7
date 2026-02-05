'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const { login, token } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) router.replace('/');
  }, [token, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to login';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">PulseCRM</p>
        <h1 className="mt-2 text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm text-slate-400">Sign in to your workspace</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm text-slate-300">Email</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-300">Password</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</div>}
          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          New tenant?{' '}
          <Link href="/register" className="text-cyan-300 underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
