// Support impersonation creates tenant-local accounts with this reserved alias.
// They grant technical access; they are never members of the sales team.
export function isWorkspaceSeller(user: { email: string }) {
  return !/\+support-[^@]+@/i.test(user.email.trim());
}
