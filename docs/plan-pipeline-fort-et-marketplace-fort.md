# Plan de travail - Pipeline commercial fort + Marketplace integrations fort

Date de reference: 11 mars 2026
Branche de travail: `dev`

## 1. Objectif

Ce document sert a cadrer deux chantiers structurants:

1. rendre le pipeline commercial d `o7 PulseCRM` tres fort;
2. rendre le socle d integrations / marketplace tres fort.

Le but n est pas d empiler des options.  
Le but est de rendre le produit:

- plus efficace pour les commerciaux;
- plus pilotable pour les managers;
- plus credible pour un acheteur;
- plus branchable a l ecosysteme du client.

## 2. Point de depart dans le repo

### Frontend existant

- [crm/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/crm/page.tsx)
- [crm/deal/[dealId]/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/crm/deal/[dealId]/page.tsx)
- [crm/stage/[stageId]/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/crm/stage/[stageId]/page.tsx)
- [forecast/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/forecast/page.tsx)
- [post-sales/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/post-sales/page.tsx)
- [admin/benchmarking/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/admin/benchmarking/page.tsx)
- [admin/calendar/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/admin/calendar/page.tsx)
- [admin/mail/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/admin/mail/page.tsx)

### Backend existant

- [deals.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/deals/deals.service.ts)
- [deals.controller.ts](/Users/oliviersteineur/crm-suites-o7/api/src/deals/deals.controller.ts)
- [pipelines.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/pipelines/pipelines.service.ts)
- [stages.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/stages/stages.service.ts)
- [tasks.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/tasks/tasks.service.ts)
- [tenant.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/tenant/tenant.service.ts)
- [google-calendar.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/admin/google-calendar.service.ts)

### Schema Prisma existant

- [schema.prisma](/Users/oliviersteineur/crm-suites-o7/api/prisma/schema.prisma)

Modeles deja presents et directement utiles:

- `Tenant`
- `Client`
- `Task`
- `Pipeline`
- `Stage`
- `Deal`
- `Product`
- `DealItem`
- `DealStageHistory`
- `GoogleCalendarConnection`

## 3. Ce qu on appelle "pipeline commercial tres fort"

Un pipeline fort n est pas juste un tableau Kanban.

Il doit couvrir 5 couches:

### 3.1 Execution commerciale

- multi-pipelines propres;
- stages robustes;
- drag and drop fiable;
- proprietaire du deal;
- date de closing;
- montant, devise, produits;
- notes et pieces jointes;
- prochaine action claire.

### 3.2 Discipline de donnees

- champs obligatoires par stage;
- raison de perte obligatoire quand un deal devient `LOST`;
- raison de gain / source de gain optionnelle mais exploitable;
- validation avant passage d etape;
- historique de mouvements.

### 3.3 Productivite commerciale

- activites relancees automatiquement;
- templates emails;
- sequences simples;
- IA qui resume, suggere, alerte;
- deal detail plus exploitable.

### 3.4 Pilotage manager

- forecast fiable;
- deals sans activite;
- deals qui stagnent;
- aging par stage;
- attainment par vendeur;
- hygiene pipeline.

### 3.5 Passage fluide vers post-sales

- quand `WON`, creation eventuelle d une checklist post-sales;
- continuité entre vente et execution.

## 4. Ce qu on appelle "marketplace integrations fort"

Un marketplace fort n est pas une grille de logos.

Il faut 4 couches:

### 4.1 Plateforme d integration

- credentials tenant-scoped;
- OAuth ou API keys;
- webhooks;
- logs;
- retries;
- permissions;
- status de sync.

### 4.2 Objets standards

Les integrations doivent parler les memes objets:

- clients
- deals
- tasks
- invoices
- products
- users
- pipelines
- stages

### 4.3 UX admin claire

- connect / disconnect;
- dernier sync;
- erreurs lisibles;
- health status;
- sync now.

### 4.4 Catalogue supporte

Au minimum:

- Google Calendar
- Gmail / Outlook
- SMTP / Mailcow
- Brevo / Mailchimp
- Stripe
- QuickBooks / Xero
- Zapier / Make / n8n

## 5. Chantier A - Pipeline commercial fort

## A1. Renforcer le modele de donnees commercial

### Problemes actuels

Le modele `Deal` est encore trop court pour un pipeline "fort":

- pas de prochaine action structuree;
- pas de derniere activite calculee;
- pas de raison de perte;
- pas de champs obligatoires par stage;
- pas de score / risque / hygiene exploitable nativement.

### Evolution proposee

Ajouter au schema Prisma:

### Nouveau modele `DealActivity`

But:

- journaliser les activites commerciales.

Champs proposes:

- `id`
- `tenantId`
- `dealId`
- `userId`
- `type` (`CALL`, `EMAIL`, `MEETING`, `NOTE`, `TASK`, `WHATSAPP`, `OTHER`)
- `title`
- `body`
- `dueAt`
- `completedAt`
- `createdAt`
- `updatedAt`

### Nouveaux champs sur `Deal`

- `nextActionTitle`
- `nextActionDueAt`
- `lastActivityAt`
- `lostReason`
- `wonReason`
- `source`
- `priority`
- `healthScore`

### Nouveau modele `StageRule`

But:

- porter les regles de passage par stage.

Champs proposes:

- `id`
- `tenantId`
- `stageId`
- `requiredFields` en JSON
- `requiresNextAction`
- `requiresExpectedCloseDate`
- `requiresLostReason`

## A2. Renforcer l experience CRM frontend

### Pages a travailler

- [crm/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/crm/page.tsx)
- [crm/deal/[dealId]/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/crm/deal/[dealId]/page.tsx)
- [forecast/page.tsx](/Users/oliviersteineur/crm-suites-o7/frontend/src/app/forecast/page.tsx)

### Chantiers UX

#### 1. Deal card plus intelligente

Afficher directement:

- owner;
- prochaine action;
- date de closing;
- stagnation;
- montant + devise;
- client;
- niveau de risque.

#### 2. Deal detail plus profond

Ajouter dans le detail deal:

- timeline activites;
- note rapide;
- appel / email / meeting;
- prochaine action;
- raison de perte / gain;
- hygiene du deal.

#### 3. Guardrails de pipeline

Bloquer ou avertir si:

- deal passe de stage sans client;
- deal sans montant;
- deal sans prochaine action;
- deal perdu sans raison.

#### 4. Vues manager

Ajouter dans `CRM` ou `Forecast`:

- deals sans activite > 7 jours;
- deals proches de closing sans activite;
- deals par vendeur;
- deals qui stagnent par stage;
- aging par stage.

## A3. Automatisation commerciale

### Backend

Creer un moteur de regles simple, pas un no-code monstre.

Cas d usage minimum:

1. si deal passe en `Proposal`, creer une task de relance;
2. si deal reste 7 jours sans activite, creer une alerte;
3. si deal devient `WON`, proposer un pack de tasks post-sales;
4. si deal devient `LOST`, exiger une raison.

### Implementation cible

Premier niveau simple:

- regles codees serveur;
- parametres stockes par tenant;
- execution dans [deals.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/deals/deals.service.ts) et [tasks.service.ts](/Users/oliviersteineur/crm-suites-o7/api/src/tasks/tasks.service.ts)

Deuxieme niveau plus tard:

- regles configurables.

## A4. Forecast beaucoup plus fort

### Etat actuel

Le forecast existe deja et est utile.

### Ce qu il faut ajouter

- forecast par vendeur;
- forecast par pipeline et par mois;
- weighted vs commit;
- quota attainment;
- couverture pipeline / quota;
- deals "best case / commit / omitted".

### Lien direct avec goals

Quand `Goals` sera backende:

- quota par vendeur;
- compare forecast vs target;
- compare won vs target;
- compare pipeline coverage vs target.

## A5. KPIs pipeline a suivre

- nombre de deals sans prochaine action
- nombre de deals sans activite depuis 7 jours
- aging moyen par stage
- win rate par pipeline
- win rate par vendeur
- forecast accuracy
- deals perdus sans raison
- temps moyen entre `Lead` et `Won`

## 6. Chantier B - Marketplace integrations fort

## B1. Sortir d une logique "settings JSON"

### Limite actuelle

Le tenant stocke deja du `marketingSetup` ou du `contractSetup` dans `Tenant`.

Cela va pour un petit nombre de cas, mais pas pour un vrai marketplace.

### Evolution proposee

Ajouter de nouveaux modeles Prisma:

### `IntegrationConnection`

Champs proposes:

- `id`
- `tenantId`
- `provider`
- `status`
- `accountLabel`
- `configJson`
- `secretRef` ou `encryptedSecrets`
- `lastSyncAt`
- `lastSyncError`
- `createdAt`
- `updatedAt`

### `IntegrationSyncLog`

Champs proposes:

- `id`
- `tenantId`
- `connectionId`
- `direction` (`IMPORT`, `EXPORT`, `WEBHOOK`)
- `status`
- `summary`
- `startedAt`
- `finishedAt`
- `payloadMeta`

### `WebhookEndpoint`

Champs proposes:

- `id`
- `tenantId`
- `url`
- `secret`
- `events`
- `isActive`
- `lastDeliveryAt`
- `lastError`

## B2. Construire le socle de plateforme

### A faire en premier

#### 1. Service d integration central

Ajouter un module backend dedie:

- `api/src/integrations/`

Avec:

- `integrations.module.ts`
- `integrations.controller.ts`
- `integrations.service.ts`
- providers specialises

#### 2. Secret management tenant-scoped

Les credentials ne doivent pas rester en clair dans un coin du tenant settings.

Minimum:

- chiffrage en base;
- rotation possible;
- suppression claire.

#### 3. Webhooks sortants

Premiere version:

- `client.created`
- `client.updated`
- `deal.created`
- `deal.updated`
- `deal.stage_changed`
- `task.created`
- `task.updated`
- `invoice.uploaded`

#### 4. Logs de sync

Un admin doit pouvoir voir:

- si la connexion marche;
- la derniere sync;
- la derniere erreur;
- le nombre d objets traites.

## B3. Integrations prioritaires

### Priorite 1 - Mail et calendrier

Pourquoi:

- impact business immediat;
- usage quotidien;
- forte valeur percue.

Integrations:

- Gmail / Google Workspace
- Outlook / Microsoft 365
- Google Calendar
- SMTP / Mailcow

### Priorite 2 - Marketing

- Brevo
- Mailchimp

### Priorite 3 - Paiement / compta

- Stripe
- QuickBooks ou Xero

### Priorite 4 - No-code

- Zapier
- Make
- n8n

## B4. Admin UX du marketplace

### Nouvelle page recommandee

Ajouter a terme:

- `frontend/src/app/admin/integrations/page.tsx`

Avec 4 zones:

1. catalogue
2. connexions actives
3. logs / health
4. webhooks

### Pour chaque integration

Montrer:

- provider
- statut
- compte connecte
- dernier sync
- derniere erreur
- bouton connect
- bouton disconnect
- bouton test
- bouton sync now

## B5. API publique et docs

### Pourquoi

Sans docs, il n y a pas de marketplace credible.

### Minimum viable

- spec OpenAPI propre;
- exemples curl;
- auth;
- erreurs;
- webhooks;
- payloads.

### Livrable concret

Ajouter:

- `docs/api-integrations-o7.md`

Puis a terme:

- page developer docs.

## 7. Roadmap 3 sprints

## Sprint 1

Objectif:

- renforcer le pipeline, pas encore le marketplace.

Livrables:

- design data model `DealActivity` / `StageRule`
- migration Prisma
- endpoints CRUD activites deal
- UI detail deal avec timeline simple
- prochaine action et lost reason

Definition of done:

- build vert;
- CRUD fonctionnel;
- validation stage perdue sans raison;
- tests minimaux API.

## Sprint 2

Objectif:

- renforcer pilotage et hygiene pipeline.

Livrables:

- vues deals sans activite;
- aging par stage;
- health score simple;
- forecast enrichi;
- creation automatique tasks apres passage de stage.

Definition of done:

- manager voit les deals a risque;
- commerciaux voient les prochaines actions;
- passage de stage plus discipline.

## Sprint 3

Objectif:

- poser le vrai socle integrations.

Livrables:

- module `integrations`
- modeles `IntegrationConnection`, `IntegrationSyncLog`, `WebhookEndpoint`
- page admin integrations
- premiers webhooks sortants
- logs de sync

Definition of done:

- une connexion provider est persistante;
- un admin voit les erreurs;
- un endpoint externe recoit les evenements CRM.

## 8. Ordre d execution recommande

Si on veut etre efficaces:

1. `DealActivity`
2. `next action + lost reason`
3. `StageRule`
4. `aging + hygiene pipeline`
5. automatisations simples
6. module `integrations`
7. webhooks
8. 2 integrations tres bien finies

## 9. Decisions produit a prendre ensemble

### Decision 1

Est-ce qu on veut un pipeline "discipline commerciale forte" ?

Si oui:

- il faut accepter les validations par stage;
- il faut imposer certains champs.

### Decision 2

Est-ce qu on veut un marketplace "propre" ou juste des integrations ponctuelles ?

Si on veut un vrai marketplace:

- il faut investir tout de suite dans le socle `IntegrationConnection + logs + webhooks`.

### Decision 3

Quels sont les 2 providers a finir avant les autres ?

Recommendation:

1. `Google / Gmail / Calendar`
2. `Brevo` ou `Mailchimp`

## 10. Prochaine action recommandee dans le code

Le meilleur point de depart technique est:

### Pipeline

Creer `DealActivity` + enrichir `Deal`

Pourquoi:

- valeur immediate;
- impact visible en front;
- renforce le pipeline;
- ouvre la voie au forecast et aux automatisations.

### Marketplace

Creer le module `integrations` avec `IntegrationConnection`

Pourquoi:

- sans socle de connexion et de logs, il n y a pas de marketplace solide.
