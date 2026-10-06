"use client";

import Link from "next/link";
import { useI18n } from "../contexts/I18nContext";
import { getClientDisplayName } from "../lib/clients";
import {
  localSalesDate,
  salesClosedDate,
  salesDealStatus,
  salesReportingLabels,
  salesTasksForDeal,
  type SalesDeal,
  type SalesTask,
} from "../lib/sales-reporting";

export function SalesFollowUpReport({
  deals,
  tasks,
  startDate,
  endDate,
}: {
  deals: SalesDeal[];
  tasks: SalesTask[];
  startDate: string;
  endDate: string;
}) {
  const { language, t, isMedicalWorkspace } = useI18n();
  const l = { ...salesReportingLabels(language), ...(isMedicalWorkspace ? { client: t("clients.table.client") } : {}) };
  const inRange = (date: string) =>
    Boolean(date && date >= startDate && date <= endDate);
  const today = localSalesDate(new Date());
  const closed = deals
    .filter(
      (deal) =>
        salesDealStatus(deal) !== "OPEN" && inRange(salesClosedDate(deal)),
    )
    .sort((a, b) => salesClosedDate(b).localeCompare(salesClosedDate(a)));
  const won = closed.filter((deal) => salesDealStatus(deal) === "WON");
  const lost = closed.filter((deal) => salesDealStatus(deal) === "LOST");
  const followUps = deals
    .flatMap<{ deal: SalesDeal; task: SalesTask | null; date: string }>((deal) => {
      const linked = salesTasksForDeal(deal, tasks);
      if (linked.length)
        return linked.map((task) => ({
          deal,
          task,
          date: task.dueDate ? localSalesDate(task.dueDate) : "",
        }));
      return deal.followUpAt
        ? [{ deal, task: null, date: localSalesDate(deal.followUpAt) }]
        : [];
    })
    .filter((row) => inRange(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const isOverdue = (row: (typeof followUps)[number]) =>
    row.date < today && row.task?.status !== "DONE";
  const money = (deal: SalesDeal) =>
    `${(deal.currency || "USD").toUpperCase()} ${Number(deal.value || 0).toLocaleString(language, { maximumFractionDigits: 2 })}`;
  const client = (deal: SalesDeal) =>
    deal.client ? getClientDisplayName(deal.client) : l.noClient;
  const dealHref = (deal: SalesDeal) => `/crm?${new URLSearchParams({
    dealId: deal.id,
    ...(deal.pipelineId ? { pipelineId: deal.pipelineId } : {}),
  })}`;
  const status = (deal: SalesDeal) =>
    ({ OPEN: l.open, WON: l.won, LOST: l.lost })[salesDealStatus(deal)];
  const reason = (key?: string | null) =>
    key ? t(`crm.close.reason.${key}`) : l.noReason;
  const reasons = Array.from(new Set(lost.map((deal) => deal.lossReason || "")))
    .map((key) => {
      const rows = lost.filter((deal) => (deal.lossReason || "") === key);
      const amounts = new Map<string, number>();
      for (const deal of rows) {
        const currency = (deal.currency || "USD").toUpperCase();
        amounts.set(
          currency,
          (amounts.get(currency) || 0) + Number(deal.value || 0),
        );
      }
      return {
        key,
        count: rows.length,
        amounts: Array.from(amounts)
          .map(
            ([currency, amount]) =>
              `${currency} ${amount.toLocaleString(language, { maximumFractionDigits: 2 })}`,
          )
          .join(" · "),
      };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <section className="card p-4" aria-label={l.title}>
      <h2 className="text-lg font-semibold">{l.title}</h2>
      <p className="mt-1 text-xs text-slate-400">{l.hint}</p>
      <div className="my-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [l.won, won.length],
          [l.lost, lost.length],
          [
            l.winRate,
            closed.length
              ? `${Math.round((won.length / closed.length) * 100)}%`
              : "—",
          ],
          [l.overdue, followUps.filter(isOverdue).length],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10"
          >
            <p className="text-xs uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <h3 className="mb-2 text-sm font-semibold">{l.losses}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              {[l.reason, l.deals, l.value].map((label) => (
                <th key={label} className="px-3 py-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reasons.map((row) => (
              <tr key={row.key} className="border-t border-white/10">
                <td className="px-3 py-2">{reason(row.key)}</td>
                <td className="px-3 py-2">{row.count}</td>
                <td className="px-3 py-2">{row.amounts}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reasons.length && (
          <p className="py-3 text-sm text-slate-400">{l.emptyLosses}</p>
        )}
      </div>
      <h3 className="mb-2 mt-5 text-sm font-semibold">{l.followUps}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              {[l.date, l.deal, l.client, l.outcome, l.assignee, l.status].map(
                (label) => (
                  <th key={label} className="px-3 py-2">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {followUps.map((row) => (
              <tr
                key={row.task?.id || `date-${row.deal.id}`}
                className="border-t border-white/10"
              >
                <td className="px-3 py-2">{row.date}</td>
                <td className="px-3 py-2">
                  <Link
                    className="hover:underline"
                    href={dealHref(row.deal)}
                  >
                    {row.deal.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{client(row.deal)}</td>
                <td className="px-3 py-2">{status(row.deal)}</td>
                <td className="px-3 py-2">
                  {row.task?.assignee?.name || l.none}
                </td>
                <td
                  className={`px-3 py-2 ${isOverdue(row) ? "text-red-300" : ""}`}
                >
                  {row.task ? (
                    <Link
                      className="hover:underline"
                      href={`/tasks#task-${encodeURIComponent(row.task.id)}`}
                    >
                      {row.task.status === "DONE"
                        ? l.done
                        : isOverdue(row)
                          ? l.late
                          : row.task.status === "IN_PROGRESS"
                            ? l.inProgress
                            : l.pending}
                    </Link>
                  ) : (
                    l.missing
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!followUps.length && (
          <p className="py-3 text-sm text-slate-400">{l.empty}</p>
        )}
      </div>
      <h3 className="mb-2 mt-5 text-sm font-semibold">{l.details}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              {[
                l.closedDate,
                l.deal,
                l.client,
                l.outcome,
                l.amount,
                l.reason,
              ].map((label) => (
                <th key={label} className="px-3 py-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {closed.map((deal) => (
              <tr key={deal.id} className="border-t border-white/10">
                <td className="px-3 py-2">{salesClosedDate(deal)}</td>
                <td className="px-3 py-2">
                  <Link
                    className="hover:underline"
                    href={dealHref(deal)}
                  >
                    {deal.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{client(deal)}</td>
                <td className="px-3 py-2">{status(deal)}</td>
                <td className="px-3 py-2">{money(deal)}</td>
                <td className="px-3 py-2">
                  {salesDealStatus(deal) === "LOST"
                    ? reason(deal.lossReason)
                    : "—"}
                  {deal.lossComment && (
                    <p className="mt-1 text-xs text-slate-400">
                      {deal.lossComment}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!closed.length && (
          <p className="py-3 text-sm text-slate-400">{l.emptyDeals}</p>
        )}
      </div>
    </section>
  );
}
