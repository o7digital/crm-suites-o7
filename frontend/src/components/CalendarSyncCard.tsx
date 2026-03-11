'use client';

import { apiBaseForDisplay } from '@/lib/apiBase';
import { useEffect, useMemo, useState } from 'react';
import { useApi, useAuth } from '../contexts/AuthContext';

type CalendarFeedResponse = {
  feedToken: string;
  currentUserEmail: string;
  scheduledTaskCount: number;
};

export function CalendarSyncCard() {
  const { token, user } = useAuth();
  const api = useApi(token);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedData, setFeedData] = useState<CalendarFeedResponse | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api<CalendarFeedResponse>('/tasks/calendar-feed');
        if (!active) return;
        setFeedData(result);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load calendar feed');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [api, token]);

  const feedUrl = useMemo(() => {
    if (!feedData?.feedToken) return '';
    return `${apiBaseForDisplay()}/calendar/tasks.ics?token=${encodeURIComponent(feedData.feedToken)}`;
  }, [feedData?.feedToken]);

  const ownerEmail = feedData?.currentUserEmail || user?.email || '';

  const handleCopy = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Unable to copy the calendar URL');
    }
  };

  return (
    <div className="card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Calendar sync</p>
          <p className="mt-1 text-lg font-semibold">Subscribe CRM tasks in Google Calendar</p>
          <p className="mt-2 text-sm text-slate-300">
            This feed follows your CRM account{ownerEmail ? ` (${ownerEmail})` : ''}, but it can be added from any
            Google, Outlook, or Apple calendar account.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            In Google Calendar: Add calendar - From URL - paste the link below.
          </p>
          {feedData ? (
            <p className="mt-1 text-xs text-cyan-200">{feedData.scheduledTaskCount} task(s) with due date are exposed.</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={handleCopy} disabled={!feedUrl || loading}>
            {copied ? 'Copied' : 'Copy URL'}
          </button>
          {feedUrl ? (
            <a href={feedUrl} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
              Open feed
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Feed URL</div>
        <div className="mt-2 break-all font-mono text-xs text-slate-200">{loading ? 'Loading...' : feedUrl || 'Unavailable'}</div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}
    </div>
  );
}
