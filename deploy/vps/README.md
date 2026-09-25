# O7 CRM on the VPS

This stack runs beside Railway until the planned cutover. It does not change DNS or the Vercel production API URL.

## Layout

- Deployment: `/opt/o7/apps/o7-crm`
- Git checkout: `/opt/o7/apps/o7-crm/app`
- Persistent database: Docker volume `o7_crm_postgres_data`
- Persistent uploads: `/opt/o7/data/o7-crm/uploads`
- Database backups: `/opt/o7/backups/o7-crm`
- Staging API: `127.0.0.1:8102` on the VPS

The API also joins the existing private `o7-apps` Docker network so the central proxy can route to it at cutover. PostgreSQL is isolated on an internal network and has no published port.

## Operations

```sh
cd /opt/o7/apps/o7-crm
docker compose ps
docker compose logs --tail=200 api
curl --fail http://127.0.0.1:8102/api/health
./backup.sh
```

The `.env` file is generated directly on the VPS with mode `0600` and must never be committed. It reuses the application secrets from Railway but replaces `DATABASE_URL` with the private PostgreSQL service.

## Cutover checklist

1. Put writes on hold for a short maintenance window.
2. Take and verify a final Railway PostgreSQL dump.
3. Restore that dump on the VPS and synchronize `/app/uploads`.
4. Run API smoke tests through the VPS endpoint.
5. Add the API hostname to the existing reverse proxy and TLS configuration.
6. Change the Vercel API environment variable and redeploy the frontend.
7. Verify login, contacts, deals, invoices, uploads, Stripe webhooks, and Google OAuth.
8. Keep Railway online during the rollback window; do not delete it immediately.

Local database backups are scheduled daily. An off-server copy remains necessary before Railway can be retired.

The systemd timer runs `backup.sh` daily at approximately 03:20 UTC and catches up after downtime. Install it with:

```sh
sudo install -m 0644 systemd/o7-crm-backup.service /etc/systemd/system/
sudo install -m 0644 systemd/o7-crm-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now o7-crm-backup.timer
```
