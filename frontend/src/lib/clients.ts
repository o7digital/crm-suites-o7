export const CLIENT_FUNCTION_OPTIONS = [
  "CEO",
  "COO",
  "CIO",
  "CTO",
  "CFO",
  "CMO",
  "Sales Director",
  "Operation Director",
  "Engineer",
  "Product Manager",
  "Marketing Director",
  "HR Director",
  "Consultant",
  "Founder",
  "Owner",
] as const;

export const CLIENT_STATUS_OPTIONS = ["CLIENT", "PROSPECT", "LOST"] as const;

export type ClientStatus = (typeof CLIENT_STATUS_OPTIONS)[number];

export function normalizeClientStatus(
  value?: string | null,
): ClientStatus | undefined {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if ((CLIENT_STATUS_OPTIONS as readonly string[]).includes(normalized)) {
    return normalized as ClientStatus;
  }
  return undefined;
}

export function getClientStatusLabel(
  value: string | null | undefined,
  t: (key: string) => string,
): string {
  const status = normalizeClientStatus(value);
  if (!status) return "";
  return t(`clients.status.${status.toLowerCase()}`);
}

export function getClientDisplayName(client: {
  firstName?: string | null;
  name?: string | null;
}): string {
  const firstName = (client.firstName || "").trim();
  const lastName = (client.name || "").trim();
  const full = `${firstName} ${lastName}`.trim();
  return full || "—";
}
