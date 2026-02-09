export const CLIENT_FUNCTION_OPTIONS = [
  'CEO',
  'COO',
  'CIO',
  'CTO',
  'CFO',
  'CMO',
  'Sales Director',
  'Operation Director',
  'Engineer',
  'Product Manager',
  'Marketing Director',
  'HR Director',
  'Consultant',
  'Founder',
  'Owner',
] as const;

export function getClientDisplayName(client: {
  firstName?: string | null;
  name?: string | null;
}): string {
  const firstName = (client.firstName || '').trim();
  const lastName = (client.name || '').trim();
  const full = `${firstName} ${lastName}`.trim();
  return full || '—';
}

