# O7 CRM on the VPS

## Production status — 2026-09-28

- Frontend: Vercel, `https://crm.o7digitalgroup.com` and `https://crm-suites-o7.vercel.app`.
- API: `https://api.crm.o7digitalgroup.com/api`, VPS `51.178.36.17`, SSH alias `o7-vps`.
- PostgreSQL: private Docker service on the VPS; active database `pulsecrm_prod_20260928_final`.
- Vercel `NEXT_PUBLIC_API_URL` points to the VPS in production, preview and development.
- All 34 tenants and 25 subscriptions (23 active, 2 paused) were preserved, including 190 deals, 74 contacts, 19 users and 7 tasks. Every table and tenant hash matched the final source snapshot before production usage resumed. Plans, editions, identifiers and relationships were preserved.
- The old Railway API GitHub source was disconnected. Only this CRM's Railway services are retired; the separate Suites Mine frontend/API remain unchanged and still use Railway.

Production checks passed for login context, contacts, deals, tasks, subscriptions, dashboard and reporting. Five real browser routes loaded through the VPS without API errors. A temporary isolated tenant verified LOST closing, actor assignment when the deal has no owner, retry deduplication, dashboard visibility and undo; all test records were removed.

## Layout and backups

- Deployment: `/opt/o7/apps/o7-crm`; Git checkout: its `app` directory.
- Database volume: `o7_crm_postgres_data`; uploads: `/opt/o7/data/o7-crm/uploads`.
- Database backups: `/opt/o7/backups/o7-crm`, with daily `o7-crm-backup.timer`.
- Final migration archive: `crm-final.dump`, SHA-256 `f5eef497d11d91acb7c2cff9d11b2cc5d81c1898d672187175c682a684a0cdff`.
- Verified off-server archive and manifest: `/Users/oliviersteineur/.local/share/o7-backups/crm/20260928`, directory mode `0700`, files `0600`.
- Earlier VPS `pulsecrm` and preflight databases remain available for recovery. Never restore either over production without reviewing records created after cutover.

PostgreSQL has no public port. The API listens locally on `127.0.0.1:8102`, joins `o7-apps`, and is routed through the existing central proxy and a dedicated Mailcow edge vhost. Existing mail and Olivia routing are preserved. The private `.env` (`0600`) keeps application secrets and uses the local database; never commit it.

## Deploy and operate

Backend releases use the VPS, never `railway up`:

```sh
ssh o7-vps
cd /opt/o7/apps/o7-crm
./deploy.sh <tested-commit-on-origin-dev>
docker compose ps
docker compose logs --tail=200 api
curl --fail https://api.crm.o7digitalgroup.com/api/health
./backup.sh
```

`deploy.sh` requires a clean checkout, fetches `dev`, verifies the requested commit belongs to that branch, backs up the database, builds the image and checks health after replacing the API container. It does not restore data automatically. For a code rollback, deploy the previous tested commit; a database rollback requires a separate reviewed restore into a new database.

Deploy frontend changes with the Vercel CLI from the repository root of a clean, tested checkout linked to project `crm-suites-o7`. The root `vercel.json` selects `frontend/package.json`; do not deploy from the frontend directory into a different project:

```sh
vercel deploy --prod --yes
```

## TLS and proxy

`nginx-api.conf` is installed as `/opt/o7/mailcow/data/conf/nginx/o7-crm-api.conf`. Include the server block in `nginx-internal-api.conf` inside the existing central proxy's `http` block, preserving its other routes. If replacing the central proxy config inode, recreate that proxy container: its single-file bind mount otherwise retains the previous file.

The dedicated Let's Encrypt certificate is under `/opt/o7/mailcow/data/assets/ssl/o7-crm/letsencrypt`. The initial certificate expires 2026-12-27. `renew-tls.sh` uses Certbot v5.0.0 and reloads the edge after syntax validation. The enabled `o7-crm-tls-renew.timer` runs twice daily; renewal dry-run passed at cutover.

```sh
sudo install -m 0644 systemd/o7-crm-tls-renew.service /etc/systemd/system/
sudo install -m 0644 systemd/o7-crm-tls-renew.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now o7-crm-tls-renew.timer
```

## Migration audit and integration work

`api/scripts/audit-migration.mjs --out manifest.json` exports row counts and deterministic hashes for every table and tenant; `--compare manifest.json` verifies a restore. Run with a private `DATABASE_URL`, after freezing source writes and before resuming target writes. Ordinary login timestamps change hashes once production resumes.

The Railway source was frozen read-only before the final dump. Any emergency reuse must first reconcile post-cutover VPS writes; do not simply repoint Vercel to the old database.

Four existing proposal paths already referenced missing files on Railway; its uploads directory was empty. Their records were preserved, but those PDFs cannot be recovered from that source. There were no invoices or connected Google Calendar accounts at cutover. Google OAuth must authorize the new API callback before new connections are used. The inherited Stripe test key returns `api_key_expired`; replace it before validating Stripe webhooks on the new domain.

Stopping this CRM's Railway deployments ends their running compute, but retained database storage and other projects/account subscriptions can still incur charges. Suites Mine requires its own migration before Railway can be closed for the whole account.
