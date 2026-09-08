"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { phase1Labels } from "../lib/pulse-phase1";

type Item = {
  id: string;
  title: string;
  dueDate?: string;
  expectedCloseDate?: string;
  pipelineId?: string;
};
type Group = { count: number; items: Item[] };
const keys = [
  "dueToday",
  "overdue",
  "closingThisWeek",
  "noNextAction",
  "staleDeals",
] as const;
type Snapshot = Record<(typeof keys)[number], Group> & {
  scope: "workspace" | "assigned";
  timeZone: string;
};
export function CommandCenter() {
  const { token } = useAuth();
  const api = useApi(token);
  const { language } = useI18n();
  const labels = phase1Labels(language);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api<Snapshot>(
      `/dashboard/command-center?timeZone=${encodeURIComponent(zone)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Unable to load");
      });
    return () => controller.abort();
  }, [api, token, refresh]);
  return (
    <section className="mb-6" aria-label="Command Center">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{labels.today}</h2>
        <span className="text-xs text-slate-400">
          {data ? `${labels[data.scope]} · ${data.timeZone}` : "…"}
        </span>
      </div>
      {error ? (
        <div role="alert" className="card p-4 text-sm text-red-200">
          {error}{" "}
          <button
            className="underline"
            onClick={() => setRefresh((v) => v + 1)}
          >
            {labels.retry}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {keys.map((key) => (
            <div key={key} className="card p-4">
              <h3 className="text-sm text-slate-300">{labels[key]}</h3>
              <p
                className={`my-2 text-3xl font-semibold ${key === "overdue" ? "text-red-300" : ""}`}
              >
                {data?.[key].count ?? "…"}
              </p>
              <ul className="space-y-2 text-sm">
                {data?.[key].items.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="text-slate-200 hover:text-cyan-300"
                      href={
                        item.pipelineId
                          ? `/crm?pipelineId=${encodeURIComponent(item.pipelineId)}&dealId=${encodeURIComponent(item.id)}`
                          : `/tasks#task-${encodeURIComponent(item.id)}`
                      }
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {data && data[key].count === 0 && (
                <p className="text-xs text-slate-400">{labels.empty}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
