"use client";
import { useEffect, useState } from "react";
import { useApi, useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { phase1Labels } from "../lib/pulse-phase1";
type Event = {
  id: string;
  action: string;
  actorId: string;
  actorName?: string | null;
  createdAt: string;
  after?: { lossReason?: string; lossComment?: string; closeNote?: string };
};
export function DealActivityHistory({ dealId }: { dealId: string }) {
  const { token } = useAuth();
  const api = useApi(token);
  const { language } = useI18n();
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Event[]>(`/deals/${dealId}/activity`)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [api, dealId]);
  const labels = phase1Labels(language);
  return (
    <details className="mb-3 text-xs text-slate-400">
      <summary className="cursor-pointer">{labels.history}</summary>
      {error && <p role="alert">{error}</p>}
      {!error && !events.length && <p>{labels.empty}</p>}
      {events.map((event) => (
        <div key={event.id} className="mt-2 border-t border-white/10 pt-2">
          <p>
            {event.action.replaceAll("_", " ")} ·{" "}
            {new Date(event.createdAt).toLocaleString()} ·{" "}
            {event.actorName || "—"}
          </p>
          <p>
            {event.after?.lossReason}{" "}
            {event.after?.lossComment || event.after?.closeNote}
          </p>
        </div>
      ))}
    </details>
  );
}
