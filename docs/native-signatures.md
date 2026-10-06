# Native o7 signature workflow

Open `/admin/contracts`. Import a PDF (10 MB, up to 30 pages), or generate one from text/a contract template. `{{variables}}` can be populated from a CRM contact before the source PDF is frozen. PDFs with rotated pages must first be exported with their rotation flattened.

Add up to five recipients and place signature, initials, signing date and text fields on the rendered pages. Fields can be dragged or positioned using percentages. Each recipient needs a required signature field. Save the draft and send it. Sent fields and source content cannot be edited; cancel the request and prepare a new document for corrections.

## Mail configuration

Each workspace sends through its own saved **SMTP or Mailcow** connector (`Tenant.marketingSetup`), including its sender name/address and reply-to address. Configure it in `/admin/parameters/customers`, Mailing settings. No global SMTP fallback and no DocuSign account are used. API-key-only newsletter providers are not supported for these transactional messages.

An unconfigured connector blocks sending, but permits draft preparation. Invitations and verification codes report SMTP failures. Mail server acceptance is not a delivery/read receipt. Failed final PDF deliveries can be retried from the document.

## Recipient flow

The emailed `/sign/<random-token>` link expires after 14 days. Before viewing the PDF, the recipient requests a six-digit code at the invited email. Codes expire in ten minutes, are single-use, permit five attempts, and are limited to one request per minute/six per hour per invitation. A verified signing session lasts 30 minutes and remains in browser memory. Reopening the page requires verification again.

The recipient fills only their assigned fields, types a signature or draws it, supplies initials in letters, and explicitly accepts electronic signing. The last signature generates a fixed PDF with a completion record, then emails that PDF to recipients and the sender through the workspace connector. Repeated signing requests are idempotent. Resending invitations rotates only unsigned recipients' links. Cancelling invalidates access.

## Storage and evidence

The PostgreSQL `SignatureEnvelope` table stores tenant-bound documents, recipients, hashed invitation/code/session credentials, field coordinates, timestamps, PDF hashes, delivery status and an append-only hash-linked event record. Event hashes use SHA-256 over compact JSON with alphabetically sorted keys (excluding `hash`), so PostgreSQL JSONB key ordering does not affect verification. Raw invitation tokens/codes are only passed to the mailing transport, never returned to administrators. PDFs reside in the existing persistent uploads volume under `uploads/signatures/<server-generated-id>/`; they are never exposed as static public files. Downloads check workspace administration or verified recipient access. The JSON event record and final PDF are available to workspace admins.

These are native electronic signatures with email verification and audit evidence, not a qualified certificate-based digital signature or an independent timestamp authority. Existing platform upload/database backup and retention controls also apply to signature documents.

## Deployment

Apply additive SQL migration `api/prisma/migrations/0039_signature_envelopes/migration.sql` after a database backup, then deploy the API and frontend. The legacy production migration ledger is incomplete: do not run `prisma migrate deploy` against that database without reconciling it first. The table uses explicit, parameterized SQL transactions with row locks; no generated Prisma model is required.

The API Docker image includes the licensed Noto Sans font needed for Unicode PDF text. The frontend postinstall script copies the matching PDF.js worker into public assets. Set `FRONTEND_URL` to the canonical CRM origin for invitations. No new signature-specific credentials are required.

## Verification

Run `npm test -- --runInBand signatures` and `npm run build` from `api`. After installing both API and frontend dependencies, run `npm run build` then `npm run test:signatures` from `frontend` (Chrome browser required). Signature tests mock mail delivery and never contact actual recipients.
