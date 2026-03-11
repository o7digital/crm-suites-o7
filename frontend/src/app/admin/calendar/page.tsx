'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useApi, useAuth } from '../../../contexts/AuthContext';

type GoogleCalendarStatus = {
  configReady: boolean;
  connected: boolean;
  crmUserEmail: string;
  googleEmail: string;
  calendarId: string;
  calendarSummary: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  callbackUrlHint: string;
};

export default function AdminCalendarPage() {
  return (
    <Suspense fallback={<AdminCalendarPageFallback />}>
      <AdminCalendarPageContent />
    </Suspense>
  );
}

function AdminCalendarPageContent() {
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const api = useApi(token);
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callbackStatus = searchParams.get('googleCalendar');
  const callbackMessage = searchParams.get('message');

  const loadStatus = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<GoogleCalendarStatus>('/admin/google-calendar/status');
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Google Calendar integration status');
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const callbackBanner = useMemo(() => {
    if (!callbackStatus) return null;
    if (callbackStatus === 'connected') {
      return {
        tone: 'success' as const,
        text: 'Google Calendar connected. Automatic CRM task sync is active.',
      };
    }
    if (callbackStatus === 'error') {
      return {
        tone: 'error' as const,
        text: callbackMessage ? humanizeCallbackMessage(callbackMessage) : 'Google Calendar connection failed.',
      };
    }
    return null;
  }, [callbackMessage, callbackStatus]);

  const handleConnect = async () => {
    setBusyAction('connect');
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/admin/calendar`;
      const result = await api<{ url: string }>('/admin/google-calendar/connect-url', {
        method: 'POST',
        body: JSON.stringify({ redirectTo }),
      });
      window.location.assign(result.url);
    } catch (err) {
      setBusyAction(null);
      setError(err instanceof Error ? err.message : 'Unable to start Google OAuth');
    }
  };

  const handleSyncNow = async () => {
    setBusyAction('sync');
    setError(null);
    try {
      const refreshed = await api<GoogleCalendarStatus>('/admin/google-calendar/sync-now', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStatus(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run Google Calendar sync');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async () => {
    setBusyAction('disconnect');
    setError(null);
    try {
      await api('/admin/google-calendar/disconnect', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disconnect Google Calendar');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Google Calendar Sync</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Connect one Google Calendar account for the current admin user. After that, CRM tasks with a due date are
            pushed automatically on create, update, and delete.
          </p>
        </div>

        {callbackBanner ? (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              callbackBanner.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-red-500/30 bg-red-500/10 text-red-100'
            }`}
          >
            {callbackBanner.text}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="card p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Connection</p>
                <p className="mt-1 text-xl font-semibold">Google OAuth and live sync</p>
                <p className="mt-2 text-sm text-slate-300">
                  Your CRM login email and the Google Calendar account can be different. The sync uses the connected
                  Google account, not the CRM email.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConnect}
                  disabled={busyAction !== null || !status?.configReady}
                >
                  {busyAction === 'connect' ? 'Redirecting...' : status?.connected ? 'Reconnect Google' : 'Connect Google'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSyncNow}
                  disabled={busyAction !== null || !status?.connected}
                >
                  {busyAction === 'sync' ? 'Syncing...' : 'Sync now'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                  onClick={handleDisconnect}
                  disabled={busyAction !== null || !status?.connected}
                >
                  {busyAction === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoItem label="CRM admin account" value={status?.crmUserEmail || 'Loading...'} />
              <InfoItem label="Google account" value={status?.connected ? status.googleEmail : 'Not connected'} />
              <InfoItem label="Target calendar" value={status?.connected ? status.calendarSummary : 'Primary calendar'} />
              <InfoItem
                label="Last sync"
                value={status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'No sync yet'}
              />
            </div>

            {status?.lastSyncError ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Last sync error: {status.lastSyncError}
              </div>
            ) : null}

            {!status?.configReady ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                Missing API environment variables: <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="card p-6">
              <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Behavior</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>Every CRM task with a due date is created as an all-day Google Calendar event.</li>
                <li>Task updates refresh the matching Google event automatically.</li>
                <li>Task deletion removes the Google event automatically.</li>
                <li>Client email is kept in the event description only. No Google invite is sent automatically.</li>
              </ul>
            </div>

            <div className="card p-6">
              <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Google Setup</p>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <p>Add this redirect URI in your Google Cloud OAuth client:</p>
                <p className="break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-slate-200">
                  {status?.callbackUrlHint || 'http://localhost:4000/api/admin/google-calendar/callback'}
                </p>
                <p>Use a Web application OAuth client in Google Cloud.</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? <div className="mt-6 text-sm text-slate-400">Loading Google Calendar status...</div> : null}
      </AppShell>
    </Guard>
  );
}

function AdminCalendarPageFallback() {
  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">Google Calendar Sync</h1>
        </div>
        <div className="text-sm text-slate-400">Loading Google Calendar status...</div>
      </AppShell>
    </Guard>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-100">{value}</p>
    </div>
  );
}

function humanizeCallbackMessage(value: string) {
  return value.includes(' ') ? value : value.replaceAll('_', ' ');
}
