# CRM editions and migration roadmap

## Branch and deployment policy

- `dev` is the active development branch.
- `main` was merged into `dev` on 2026-09-25 so development can continue from a common history.
- `crmbackup` preserves commit `6fb9530`, the deployed CRM state immediately before that merge.
- The primary production frontend is `https://crm-suites-o7.vercel.app/`.
- The hospitality deployment `https://crm-suitesmine.vercel.app/` and its `o7digital/crm-suitesmine` repository must remain independent and unchanged until the hospitality edition reaches verified feature parity.

Never deploy an unverified vertical edition over an existing customer workspace. Take a database backup before every tenant migration and keep a tested rollback path.

## Product model

The product should use one multi-tenant CRM core with configurable, versioned editions. Commercial plans and business editions are separate concepts:

- The plan controls seats, storage, support and automation limits.
- The edition controls terminology, navigation, default pipelines, forms, templates and vertical modules.
- The sales motion describes the customer relationship: `B2B`, `B2C` or `HYBRID`.

Proposed edition identifiers:

- `CORE`: general B2B CRM.
- `HOSPITALITY`: guests, reservations, stays, campaigns and loyalty.
- `HEALTHCARE`: patients, appointments, consent and follow-up.
- `ECOMMERCE`: consumers, orders, carts, returns and lifecycle marketing.

Healthcare should additionally record a specialty such as `GENERAL_MEDICINE`, `PSYCHIATRY`, `PSYCHOLOGY` or `DENTAL`.

An edition installer must be idempotent and non-destructive. It may create missing defaults, but must not rename or delete customer pipelines, stages, fields or records without an explicit, reviewed migration.

## Subscription provisioning

Subscription creation should capture country, plan, sales motion, edition, industry and optional specialty. Provisioning then stores an edition version and resolves effective features from:

1. the base CRM core;
2. the selected commercial plan;
3. the selected edition and specialty;
4. explicit tenant overrides.

The backend must be the source of truth for the edition catalogue. The frontend should consume that catalogue rather than maintain a separate list that can drift.

## Existing customer safeguards

### GoldenHealthMexico

GoldenHealthMexico already uses the normal CRM. It must remain on the current `CORE` behavior for now, even if its industry is healthcare.

Do not automatically select or activate `HEALTHCARE` for GoldenHealthMexico based on its existing industry field. Migrate it only after the healthcare edition has been validated with test data and accepted by the customer. The future migration must include:

1. a tenant-specific database backup;
2. a preview of new modules, labels and pipelines;
3. explicit customer approval;
4. an edition assignment and versioned migration;
5. functional and data-isolation tests;
6. a documented rollback to `CORE`.

The first healthcare release should remain a patient relationship and appointment CRM. Clinical notes, diagnoses, prescriptions and therapy-session content require a separate compliance review and stronger clinical-record controls.

### Suites Mine hospitality CRM

Treat the current Suites Mine implementation as the reference for `HOSPITALITY_V1`. Port its behavior into the main CRM behind an edition profile, then compare both versions before any migration. Keep the existing domain and repository available throughout the rollback period.

## Suggested delivery order

1. Add edition, edition version, sales motion and specialty to tenant provisioning.
2. Introduce a backend edition registry and feature resolver.
3. Extract and validate `HOSPITALITY_V1` without modifying Suites Mine production.
4. Pilot `HEALTHCARE_V1` with isolated test tenants.
5. Offer GoldenHealthMexico an explicit migration after acceptance.
6. Build `ECOMMERCE_V1` with dedicated order and integration models.

## Custom production domain

The intended user-facing domain is `crm.o7digitalgroup.com`, attached to the existing Vercel project. The API will use `api.crm.o7digitalgroup.com` and point to the VPS only at cutover. DNS and production API settings must not be changed until the VPS proxy, TLS certificate, final database synchronization and smoke tests are ready.
