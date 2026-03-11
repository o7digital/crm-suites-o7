'use client';

import { buildGoogleCalendarTaskUrl, downloadTaskIcs } from '@/lib/calendar';

type TaskCalendarProps = {
  task: {
    id: string;
    title: string;
    status: string;
    dueDate?: string | null;
    timeSpentHours?: number | string | null;
    client?: {
      firstName?: string | null;
      name?: string | null;
      email?: string | null;
    } | null;
  };
  ownerEmail?: string | null;
};

export function TaskCalendarActions({ task, ownerEmail }: TaskCalendarProps) {
  const googleCalendarUrl = buildGoogleCalendarTaskUrl(task, { ownerEmail });
  if (!googleCalendarUrl) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={googleCalendarUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-cyan-400/30 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/10"
      >
        Google Calendar
      </a>
      <button
        type="button"
        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/5"
        onClick={() => downloadTaskIcs(task, { ownerEmail })}
      >
        ICS
      </button>
    </div>
  );
}
