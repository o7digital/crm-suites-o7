export type SalesDeal = {
  id: string;
  title: string;
  pipelineId?: string;
  status?: "OPEN" | "WON" | "LOST";
  closedAt?: string | null;
  followUpAt?: string | null;
  lossReason?: string | null;
  lossComment?: string | null;
  value: number | string | null;
  currency?: string | null;
  createdAt?: string;
  updatedAt?: string;
  clientId?: string | null;
  client?: { name: string; firstName?: string | null } | null;
  stage?: { status: "OPEN" | "WON" | "LOST" } | null;
  history?: Array<{
    movedAt?: string | null;
    toStage?: { status: "OPEN" | "WON" | "LOST" } | null;
  }>;
};

export type SalesTask = {
  id: string;
  title: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  dueDate?: string | null;
  clientId?: string | null;
  opportunityId?: string | null;
  assignee?: { name: string } | null;
};

export function salesDealStatus(deal: SalesDeal) {
  return deal.status || deal.stage?.status || "OPEN";
}

export function salesClosedDate(deal: SalesDeal) {
  const status = salesDealStatus(deal);
  const move = (deal.history || [])
    .filter((row) => row.toStage?.status === status)
    .sort((a, b) =>
      String(b.movedAt || "").localeCompare(String(a.movedAt || "")),
    )[0];
  return (
    deal.closedAt ||
    move?.movedAt ||
    deal.updatedAt ||
    deal.createdAt ||
    ""
  ).slice(0, 10);
}

export function localSalesDate(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

// Older closing flows saved the title and contact without opportunityId.
export function salesTasksForDeal(deal: SalesDeal, tasks: SalesTask[]) {
  return tasks.filter(
    (task) =>
      task.opportunityId === deal.id ||
      (!task.opportunityId &&
        Boolean(deal.clientId) &&
        task.clientId === deal.clientId &&
        task.title === `Follow-up: ${deal.title}` &&
        Boolean(deal.followUpAt) &&
        task.dueDate === deal.followUpAt),
  );
}

const labels = {
  en: {
    title: "Sales follow-up report",
    hint: "Closed deals use the selected period. Follow-ups use their due date.",
    won: "Won",
    lost: "Lost",
    open: "Open",
    winRate: "Win rate",
    overdue: "Overdue follow-ups",
    losses: "Loss reasons",
    reason: "Reason",
    deals: "Deals",
    value: "Value by currency",
    followUps: "Sales follow-ups",
    empty: "No sales follow-ups in this period.",
    date: "Due date",
    deal: "Deal",
    client: "Client",
    outcome: "Sales status",
    assignee: "Assignee",
    status: "Follow-up status",
    pending: "Planned",
    inProgress: "In progress",
    done: "Completed",
    late: "Overdue",
    missing: "Date only — no task",
    noClient: "No client",
    none: "Unassigned",
    noReason: "Not recorded",
    emptyLosses: "No lost deals in this period.",
    details: "Closed sales",
    closedDate: "Closing date",
    amount: "Amount",
    emptyDeals: "No closed deals in this period.",
  },
  fr: {
    title: "Rapport de suivi des ventes",
    hint: "Ventes clôturées sur la période choisie. Suivis filtrés par date prévue.",
    won: "Gagnées",
    lost: "Perdues",
    open: "Ouvertes",
    winRate: "Taux de réussite",
    overdue: "Suivis en retard",
    losses: "Motifs de perte",
    reason: "Motif",
    deals: "Ventes",
    value: "Montants par devise",
    followUps: "Suivis des ventes",
    empty: "Aucun suivi de vente sur cette période.",
    date: "Date prévue",
    deal: "Vente",
    client: "Contact",
    outcome: "Statut de vente",
    assignee: "Responsable",
    status: "Statut du suivi",
    pending: "Planifié",
    inProgress: "En cours",
    done: "Terminé",
    late: "En retard",
    missing: "Date seule — aucune tâche",
    noClient: "Sans contact",
    none: "Non assigné",
    noReason: "Non renseigné",
    emptyLosses: "Aucune vente perdue sur cette période.",
    details: "Ventes clôturées",
    closedDate: "Date de clôture",
    amount: "Montant",
    emptyDeals: "Aucune vente clôturée sur cette période.",
  },
  es: {
    title: "Informe de seguimiento de ventas",
    hint: "Ventas cerradas en el período elegido. Seguimientos por fecha prevista.",
    won: "Ganadas",
    lost: "Perdidas",
    open: "Abiertas",
    winRate: "Tasa de éxito",
    overdue: "Seguimientos vencidos",
    losses: "Motivos de pérdida",
    reason: "Motivo",
    deals: "Ventas",
    value: "Importes por moneda",
    followUps: "Seguimientos de ventas",
    empty: "Sin seguimientos de ventas en este período.",
    date: "Fecha prevista",
    deal: "Venta",
    client: "Contacto",
    outcome: "Estado de venta",
    assignee: "Responsable",
    status: "Estado del seguimiento",
    pending: "Programado",
    inProgress: "En curso",
    done: "Completado",
    late: "Vencido",
    missing: "Solo fecha — sin tarea",
    noClient: "Sin contacto",
    none: "Sin asignar",
    noReason: "Sin registrar",
    emptyLosses: "Sin ventas perdidas en este período.",
    details: "Ventas cerradas",
    closedDate: "Fecha de cierre",
    amount: "Importe",
    emptyDeals: "Sin ventas cerradas en este período.",
  },
};

export function salesReportingLabels(language: string) {
  return labels[language as keyof typeof labels] || labels.en;
}
