export function supportEmailsForTenant(tenantId: string): string[] {
  return (process.env.SUPPORT_ADMIN_EMAILS || 'olivier.steineur@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => {
      const [local, domain] = email.split('@');
      return `${local}+support-${tenantId.slice(0, 12)}@${domain}`;
    });
}
