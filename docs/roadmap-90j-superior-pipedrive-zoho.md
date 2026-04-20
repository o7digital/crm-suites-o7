# Roadmap 90 jours - Depasser Pipedrive/Zoho sur notre segment

## Positionnement
Objectif: depasser Pipedrive et Zoho sur notre segment cible en profondeur operationnelle, pas en largeur generaliste.

Wedge produit cible:
- Lead -> Devis -> Signature -> Contrat -> Post-Sales
- Workflow unifie dans un seul CRM
- Automatisations actionnables
- IA utile au quotidien (pas juste "chat")

## Reponse strategique
- Oui, le CRM peut depasser Pipedrive/Zoho sur le segment cible si execution disciplinee.
- Non, pas en largeur globale court terme (marketplace/integrations universelles).

## Plan 90 jours

### S1
- Cadrer modeles Quote/Contract + statuts + relations Deal/Client/User
- Migrations DB + endpoints CRUD
- Onglet Documents dans la modale Deal (lecture)
- Tracking events create/send/sign
- DoD: CRUD docs operationnel + UI visible + build/lint OK

### S2
- Integration Yousign: creation demande signature + URL signer
- Webhook securise (idempotent, retry-safe)
- Sync statuts signature dans DB + timeline
- UI: Envoyer en signature + Voir statut
- DoD: contrat envoye, statut signed recu via webhook

### S3
- Generation PDF devis/contrat par templates
- Variables dynamiques (client/deal/montant/dates)
- Versioning templates
- Preview + download
- DoD: generation stable sur 3 templates reels

### S4
- Automation: signed -> deal WON -> taches post-sales
- Notifications owner/admin
- Historique automation dans timeline
- DoD: scenario bout-en-bout valide en staging

### S5
- Rule engine v1
- Triggers: stage changed, deal created, contract signed, due date passed, inactivity
- Actions: create task, assign owner, send email, move stage, set priority, create post-sales case
- UI minimale regles
- DoD: 5 regles actives sans regression

### S6
- IA operationnelle: next best action, resume compte/deal, relance email
- Score risque deal (inactivite, close date, activite)
- DoD: carte risque visible et actionnable

### S7
- Forecast v2: prevu vs reel, weighted par owner/pipeline
- Dashboard manager v1
- DoD: ecran manager utile en revue hebdo

### S8
- Permissions fines docs/automations
- Audit log complet (qui, quoi, quand, avant/apres)
- DoD: permissions testees + audit consultable

### S9
- Import assistant Pipedrive/Zoho (CSV + mapping)
- Mapping champs standards + custom basique
- Validation/preview import
- DoD: migration sandbox complete

### S10
- Integrations critiques: email/calendar + compta/Stripe
- Observability webhooks + alerting
- DoD: sync fiable cas nominal + erreurs

### S11
- Sprint UX/perf: bulk actions, inline edit, raccourcis, mobile
- Reduction latence CRM/Forecast
- DoD: gain mesure sur temps d'execution utilisateur

### S12
- Hardening release: e2e flows critiques, playbook incident, documentation
- Packaging go-to-market: onboarding wizard + templates metier
- DoD: release candidate stable

## KPIs hebdo
- Taux de devis envoyes / deal
- Taux de signature
- Delai moyen devis -> signature
- Forecast accuracy
- Temps administratif economise / commercial
- Usage des automations
- Retention 30/60 jours

## Regles d'execution
- Chaque feature doit impacter un KPI
- Tests e2e sur flows critiques
- Fix bugs critiques < 24h
- Pas de feature "demo-only"

## Definition du succes
D'ici 90 jours, gagner sur:
- vitesse d'execution commerciale
- fluidite documents/signature/post-sales
- pilotage manager (forecast + conversion + risque)

Perdre acceptablement sur:
- largeur ecosysteme non critique segment

