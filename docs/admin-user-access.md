# Admin user access

The administrator shares invitation links manually, including through Gmail. No SMTP configuration is required for that workflow.

Workspace administrators can set an existing user's password in `/admin/users`. Subscription managers can set passwords for users in their own customer subscriptions in `/admin/subscriptions`. Both forms require confirmation and at least eight characters (maximum 72 UTF-8 bytes). Users must first have a CRM account; a pending invitation alone is not an account.

The API checks current database permissions and scopes every target to the authorized workspace. It stores a bcrypt hash on the VPS. The user signs in at `/login` with their email and assigned password; no Supabase administration key is required. Local login preserves existing user and workspace IDs, includes the workspace name, records login timestamps and blocks inactive subscriptions.

The frontend first attempts CRM authentication. An account without a local password can continue using its existing Supabase login. A wrong configured CRM password is rejected without provider fallback. Local sessions are restored by verifying `/auth/me` and are protected from unrelated Supabase session events; logout removes the local session. Existing Supabase signup and invitation registration remain available. This adds CRM password access without migrating the whole authentication system or deleting provider accounts. Existing external-provider sessions are not revoked by assigning a local password.

Optional automatic invitation email remains available when SMTP is configured, but is not required for manual link sharing. The delivery result is shown separately from creation of the invitation.
