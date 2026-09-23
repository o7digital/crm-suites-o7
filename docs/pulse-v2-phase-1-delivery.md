# Fichiers du lot Phase 1

Liste exhaustive des fichiers du second lot ; le premier lot de sécurité est dans le commit ee6a7f1. Les fichiers utilisateur préexistants sont exclus, sauf les ajouts Phase 1 isolés dans schema.prisma.

- `.github/workflows/ci.yml`
- `.gitignore`
- `api/prisma/migrations/0037_pulse_phase1/migration.sql`
- `api/prisma/schema.prisma`
- `api/scripts/encrypt-marketing-secrets.cjs`
- `api/src/auth/auth.module.ts`
- `api/src/common/jwt-policy.spec.ts`
- `api/src/common/jwt-policy.ts`
- `api/src/common/jwt.strategy.spec.ts`
- `api/src/common/jwt.strategy.ts`
- `api/src/dashboard/command-center.service.spec.ts`
- `api/src/dashboard/command-center.service.ts`
- `api/src/dashboard/dashboard.controller.ts`
- `api/src/dashboard/dashboard.module.ts`
- `api/src/deals/deal-actions.service.ts`
- `api/src/deals/deals.controller.ts`
- `api/src/deals/deals.module.ts`
- `api/src/deals/deals.service.ts`
- `api/src/deals/dto/close-deal.dto.ts`
- `api/src/deals/dto/create-deal.dto.ts`
- `api/src/deals/dto/rank-deal.dto.ts`
- `api/src/deals/dto/update-deal.dto.ts`
- `api/src/main.ts`
- `api/src/tasks/dto/create-task.dto.ts`
- `api/src/tasks/tasks.controller.ts`
- `api/src/tasks/tasks.service.ts`
- `api/src/tenant/marketing-secrets.spec.ts`
- `api/src/tenant/marketing-secrets.ts`
- `api/src/tenant/tenant.service.spec.ts`
- `api/src/tenant/tenant.service.ts`
- `api/test/fixtures/pre-phase1-data.sql`
- `api/test/fixtures/pre-phase1.prisma`
- `api/test/jest-phase1.json`
- `api/test/phase1.integration-spec.ts`
- `api/test/run-phase1-integration.sh`
- `docs/pulse-phase1.env.example`
- `docs/pulse-v2-phase-1.md`
- `frontend/.gitignore`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/src/app/admin/benchmarking/page.tsx`
- `frontend/src/app/admin/mail/CampaignTools.tsx`
- `frontend/src/app/admin/mail/page.tsx`
- `frontend/src/app/crm/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/tasks/page.tsx`
- `frontend/src/components/CommandCenter.tsx`
- `frontend/src/components/DealActivityHistory.tsx`
- `frontend/src/lib/pulse-phase1.ts`
- `frontend/src/middleware.ts`
- `frontend/tests/phase1.spec.ts`
- `docs/pulse-v2-phase-1-delivery.md`

Voir [le dossier de livraison](pulse-v2-phase-1.md) pour les migrations, contrats, tests, risques et prérequis Railway.
