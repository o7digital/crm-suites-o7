# Clerk, Stripe and Subscription Architecture

## Goal

Turn the current CRM subscription system into a production SaaS flow:

- Clerk manages identity, sessions, sign-in, sign-up and password recovery.
- Stripe manages payments, recurring subscriptions, invoices and payment status.
- The CRM database keeps the business model: tenants, users, roles, seats, subscription access and legal acceptance.
- Every paid workspace has a clear license limit and subscription status.
- Every account creation records acceptance of the legal terms and data processing notice.

## Current System

The application already has:

- `Tenant` for workspaces.
- `User` for workspace members and roles.
- `Subscription` for customer workspaces, plans, seats and active/suspended/canceled status.
- `UserInvite` for workspace invites.
- Supabase/JWT based frontend auth in `frontend/src/contexts/AuthContext.tsx`.
- NestJS JWT validation in `api/src/common/jwt.strategy.ts`.
- Admin subscription screens in `frontend/src/app/admin/subscriptions/page.tsx`.

This means the migration should be progressive. Clerk should replace identity, not the CRM business data.

## Target Responsibilities

### Clerk

Clerk is responsible for:

- user identity;
- sign-in/sign-up;
- email verification;
- password reset;
- optional MFA later;
- issuing session tokens consumed by the frontend and backend.

Clerk is not responsible for:

- CRM roles;
- tenant permissions;
- seat limits;
- subscription status;
- legal acceptance records.

### Stripe

Stripe is responsible for:

- checkout;
- recurring subscription billing;
- invoice/payment lifecycle;
- customer portal later;
- payment failure and cancellation events.

Stripe is not responsible for:

- deciding CRM permissions directly;
- storing legal acceptance;
- storing workspace role details.

### CRM Database

The CRM database remains responsible for:

- `Tenant`;
- `User`;
- `User.role`;
- `Subscription`;
- seat limits;
- invite limits;
- subscription access state;
- legal acceptance audit trail.

## Proposed Data Model Changes

### User

Add:

```prisma
clerkUserId String? @unique
```

Keep:

```prisma
email
name
role
tenantId
```

The existing `password` field can stay during migration, then become optional or be removed in a later migration.

### Subscription

Add:

```prisma
stripeCustomerId String?
stripeSubscriptionId String?
stripePriceId String?
stripeProductId String?
billingEmail String?
currentPeriodEnd DateTime?
cancelAtPeriodEnd Boolean @default(false)
```

Keep:

```prisma
plan
seats
status
customerTenantId
tenantId
trialEndsAt
```

### LegalAcceptance

Create a new model:

```prisma
model LegalAcceptance {
  id              String   @id @default(uuid())
  tenantId        String
  userId          String?
  email           String
  contractVersion String
  acceptedAt      DateTime @default(now())
  country         String?
  ipAddress       String?
  userAgent       String?
  source          String   @default("SIGNUP")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([email])
  @@index([contractVersion])
}
```

This stores proof that the customer accepted the legal terms.

## Signup Flow

Target flow:

1. User opens sign-up.
2. User enters company/workspace data.
3. User selects country.
4. User reviews legal terms in English.
5. User checks required acceptance checkbox.
6. Clerk creates the identity.
7. Backend creates or links:
   - `Tenant`;
   - `User`;
   - initial `Subscription` or checkout-pending record;
   - `LegalAcceptance`.
8. User is redirected to Stripe Checkout when a paid plan is selected.
9. Stripe webhook activates the subscription after checkout succeeds.
10. CRM access is granted only if the tenant subscription is active or in allowed trial state.

## Legal Acceptance Requirements

The sign-up checkbox should be explicit. Example label:

> I have read and agree to the Terms, Privacy Notice, Data Processing Terms, and cross-border data transfer conditions.

The app should store:

- contract version;
- acceptance timestamp;
- tenant;
- user/email;
- country;
- IP address when available;
- user agent when available.

The legal text should cover, at minimum:

- GDPR / UK GDPR where applicable;
- Mexico LFPDPPP;
- USA privacy laws as applicable by state;
- Canada PIPEDA and provincial laws;
- customer responsibility for data entered in the CRM;
- SaaS provider role as processor/service provider where applicable;
- secure hosting and operational safeguards;
- cross-border transfers;
- subprocessors;
- retention and deletion;
- support access;
- limitation that the notice is part of the subscription agreement.

Legal review is still recommended before production use.

## Stripe Subscription Flow

### Checkout

Frontend calls backend:

```http
POST /billing/checkout
```

Backend creates a Stripe Checkout Session with:

- `mode: "subscription"`;
- selected Stripe `priceId`;
- tenant and user metadata;
- success URL;
- cancel URL.

### Webhook

Stripe sends events to:

```http
POST /billing/webhook/stripe
```

Events to handle first:

- `checkout.session.completed`;
- `customer.subscription.created`;
- `customer.subscription.updated`;
- `customer.subscription.deleted`;
- `invoice.payment_succeeded`;
- `invoice.payment_failed`.

Webhook updates local `Subscription.status`, seats, Stripe IDs and billing period.

## License and Seat Enforcement

The app already checks seats for invites. Keep that model and make Stripe plan data feed it.

Recommended rule:

- active users + pending invites cannot exceed `Subscription.seats`;
- owners count as seats;
- suspended/canceled subscriptions cannot invite users;
- suspended/canceled customer tenants cannot access protected CRM features.

## Environment Variables

### Clerk

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### Stripe

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=
```

### Plan Price IDs

```env
STRIPE_PRICE_BASIC=
STRIPE_PRICE_STANDARD=
STRIPE_PRICE_ADVANCED=
STRIPE_PRICE_ADVANCED_PLUS=
STRIPE_PRICE_TEAM=
```

## Implementation Phases

### Phase 1: Documentation and Schema

- Add this architecture document.
- Add Prisma fields for Clerk, Stripe and legal acceptance.
- Add migration.
- Keep existing auth working.

### Phase 2: Clerk Integration

- Install Clerk frontend SDK.
- Add Clerk provider and middleware.
- Add sign-in and sign-up pages.
- Update backend JWT validation for Clerk tokens.
- Add backend sync endpoint for Clerk users.

### Phase 3: Legal Signup Step

- Add legal acceptance UI.
- Add backend endpoint to store acceptance.
- Add contract versioning.
- Add admin visibility later if needed.

### Phase 4: Stripe Billing

- Install Stripe SDK.
- Add checkout endpoint.
- Add webhook endpoint with signature verification.
- Store Stripe IDs in `Subscription`.
- Map Stripe price IDs to plan and seats.

### Phase 5: Access Control and Admin

- Enforce subscription status consistently.
- Update admin subscriptions screen with Stripe-backed fields.
- Add customer portal link later.

### Phase 6: Migration Cleanup

- Migrate existing users to Clerk IDs where possible.
- Make password optional or remove it after Clerk is fully adopted.
- Remove old Supabase auth dependency when no longer needed.

## Open Inputs Needed

### Legal Text

Integrated:

- `docs/legal/privacy-data-protection-notice-v1-en.md`
- `docs/legal/legal-policy-registry.md`

Initial contract version proposal:

- `v1-en-2026-05-29`

### Plans

To fill:

| Plan | Seats | Price | Billing Cycle | Stripe Price ID |
| --- | ---: | ---: | --- | --- |
| Basic | 1 | TBD | monthly | TBD |
| Standard | 3 | TBD | monthly | TBD |
| Advanced | 5 | TBD | monthly | TBD |
| Advanced+ | 10 | TBD | monthly | TBD |
| Team | 11-30 | TBD | monthly | TBD |

### Product Decisions

- Should trial require a card?
- Should customers access CRM before payment succeeds?
- Should account creation happen before or after Stripe Checkout?
- Should existing tenants migrate automatically or only new tenants use Clerk first?
