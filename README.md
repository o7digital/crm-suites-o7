# PulseCRM MVP

Multi-tenant CRM dashboard MVP using **Next.js 15 + Tailwind** for the frontend and **NestJS 11 + Prisma + PostgreSQL** for the API.

## Quick start

1) Start Postgres (Docker): `docker compose up -d db`
2) API
   - `cd api`
   - copy env: `cp .env.example .env` (adjust `DATABASE_URL`, `JWT_SECRET`)
   - (optional, for IA Pulse) set `HF_API_KEY` (or `HF_TOKEN`) in `api/.env`
   - run migrations: `npx prisma migrate dev --name init`
   - start dev: `npm run start:dev` (serves on http://localhost:4000/api)
3) Frontend
   - `cd frontend`
   - copy env: `cp .env.example .env.local`
   - run dev server: `npm run dev` (http://localhost:3000)

Login/register flows hit `/api/auth`. All resources are tenant-scoped via JWT.

## Demo features
- Auth + multi-tenant bootstrap on registration
- Dashboard KPIs (clients, tasks, invoice volume, recent invoices)
- Client CRUD
- Tasks linked to clients
- Invoice upload with stubbed AI extraction + storage
- CSV exports for clients and invoices

## Notes
- AI extraction is a stub (filename parsing + sample dates) to stay demoable without external services.
- Files are stored locally under `api/uploads/{tenantId}`. Swap to S3 or another provider for production.
- Keep JWT secret safe and enforce HTTPS in real deployments.
