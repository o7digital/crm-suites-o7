import { getClientDisplayName } from './clients';

export type CalendarClient = {
  firstName?: string | null;
  name?: string | null;
  email?: string | null;
};

export type CalendarTask = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  timeSpentHours?: number | string | null;
  client?: CalendarClient | null;
};

type CalendarTaskOptions = {
  ownerEmail?: string | null;
  workspaceName?: string | null;
};

export function buildGoogleCalendarTaskUrl(task: CalendarTask, options: CalendarTaskOptions = {}): string | null {
  const dueIso = getTaskIsoDueDate(task);
  if (!dueIso) return null;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.title || 'CRM task',
    dates: `${toGoogleDate(dueIso)}/${toGoogleDate(addDaysIso(dueIso, 1))}`,
    details: buildTaskDetails(task, options),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadTaskIcs(task: CalendarTask, options: CalendarTaskOptions = {}) {
  if (typeof window === 'undefined') return;
  const dueIso = getTaskIsoDueDate(task);
  if (!dueIso) return;

  const blob = new Blob([buildTaskIcs(task, options)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(task.title || 'crm-task')}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildTaskIcs(task: CalendarTask, options: CalendarTaskOptions) {
  const dueIso = getTaskIsoDueDate(task);
  if (!dueIso) return '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//o7 PulseCRM//Task Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.workspaceName || 'o7 PulseCRM Tasks')}`,
    'BEGIN:VEVENT',
    `UID:${task.id}@o7pulsecrm.local`,
    `DTSTAMP:${formatUtcDateTime(new Date())}`,
    `SUMMARY:${escapeIcsText(task.title || 'CRM task')}`,
    `DTSTART;VALUE=DATE:${toGoogleDate(dueIso)}`,
    `DTEND;VALUE=DATE:${toGoogleDate(addDaysIso(dueIso, 1))}`,
    `DESCRIPTION:${escapeIcsText(buildTaskDetails(task, options))}`,
    ...(normalizeEmail(options.ownerEmail) ? [`ORGANIZER:mailto:${normalizeEmail(options.ownerEmail)}`] : []),
    ...(normalizeEmail(task.client?.email)
      ? [`ATTENDEE;CN=${escapeIcsParam(getClientDisplayName(task.client || {}))}:mailto:${normalizeEmail(task.client?.email)}`]
      : []),
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

function buildTaskDetails(task: CalendarTask, options: CalendarTaskOptions) {
  const lines = [
    'CRM task from o7 PulseCRM',
    `Status: ${task.status}`,
    task.client ? `Client: ${getClientDisplayName(task.client)}` : '',
    task.client?.email ? `Client email: ${task.client.email}` : '',
    formatHours(task.timeSpentHours),
    options.ownerEmail ? `CRM owner: ${options.ownerEmail}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

function formatHours(value: unknown) {
  const numeric = toHoursNumber(value);
  return numeric && numeric > 0 ? `Hours spent: ${numeric}h` : '';
}

function toHoursNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getTaskIsoDueDate(task: CalendarTask): string | null {
  if (!task.dueDate || typeof task.dueDate !== 'string') return null;
  const trimmed = task.dueDate.trim();
  if (!trimmed) return null;
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
}

function addDaysIso(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toGoogleDate(iso: string) {
  return iso.replaceAll('-', '');
}

function formatUtcDateTime(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function escapeIcsParam(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/:/g, '\\:');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'crm-task';
}

function normalizeEmail(value?: string | null) {
  const email = (value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}
