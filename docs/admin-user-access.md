# Admin user access

Workspace administrators can set an existing user's password in `/admin/users`. Subscription managers can set passwords for users in their own customer subscriptions in `/admin/subscriptions`. Both forms require confirmation and at least eight characters (maximum 72 UTF-8 bytes).

The API checks current database permissions and scopes every target to the authorized workspace. It updates the authentication provider before saving the local bcrypt hash. Provider errors and missing credentials return an error; the panel must never report success in those cases.

Production uses Supabase. Set `SUPABASE_SERVICE_ROLE_KEY` in `/opt/o7/apps/o7-crm/.env` on the VPS, using the project's server-only service role key. `SUPABASE_URL` is optional when `SUPABASE_JWT_ISSUER` already identifies the project. For Clerk user IDs, the API requires `CLERK_SECRET_KEY`. These keys must never appear in frontend environment variables or Git. Provider requirements such as password strength still apply.

Invitation creation sends an email automatically when `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` (or `MAIL_FROM`) and `FRONTEND_URL` are configured on the API server. Optional settings: `SMTP_PORT` (587 by default), `SMTP_SECURE`, `SMTP_FROM_NAME`. The API returns `SENT`, `NOT_CONFIGURED` or `FAILED`; SMTP acceptance does not guarantee inbox delivery. Copying a link does not send an email.

After changing server environment variables, recreate the API container with `docker compose up -d --no-deps --force-recreate api` from `/opt/o7/apps/o7-crm`, and verify API health. Verify an invitation with a designated recipient and test the changed password on a dedicated test account.

References: [Supabase admin password updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Clerk user updates](https://clerk.com/docs/reference/backend/user/update-user).
