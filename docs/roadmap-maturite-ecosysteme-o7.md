# Roadmap produit - maturite et ecosysteme o7 PulseCRM

Date de reference: 11 mars 2026
Branche de travail: `dev`

## 1. Objectif

L'objectif n'est pas de "rajouter des features".

L'objectif est de reduire la faiblesse principale identifiee dans le comparatif:

> maturite produit et ecosysteme plus faibles que les leaders

Concretement, cela veut dire:

- fiabiliser le coeur du CRM;
- terminer les modules encore incomplets;
- sortir les fonctions encore locales vers un vrai backend;
- ajouter quelques integrations qui comptent vraiment;
- mettre en place une discipline produit / QA / release.

## 2. Positionnement a proteger

o7 ne doit pas essayer de battre Salesforce ou Zoho sur la largeur brute.

Le positionnement a renforcer est:

- CRM natif operationnel;
- centre sur le process reel du business;
- vente + post-sales + contrats + OCR + newsletters + branding tenant;
- produit plus direct et plus personnalisable qu'un CRM trop generique.

## 3. Limites actuelles a corriger

### 3.1 Maturite produit

- `Admin > Goals` repose encore sur du stockage local navigateur.
- `Admin > Mail` n'est pas un module termine.
- plusieurs pages contiennent encore du texte hardcode hors i18n.
- certaines langues supplementaires viennent d'etre remises, mais la couverture n'est pas encore exhaustive sur 100% des pages.
- il manque une couche de tests E2E sur les parcours critiques.

### 3.2 Ecosysteme

- peu d'integrations "standard de marche" visibles.
- pas de couche webhook / API publique documentee.
- pas de connecteurs no-code.
- pas de bibliotheque d'import / mapping de champs suffisamment industrialisee.

### 3.3 Credibilite enterprise / acheteur

- pas encore assez de signaux de robustesse:
  - audit log;
  - permissions fines;
  - documentation d'administration;
  - release discipline;
  - matrice de support integrations.

## 4. Axes de travail

### Axe A - Stabiliser le coeur produit

But:

- faire en sorte que le coeur `Clients / Tasks / CRM / Post-Sales / Orders / Forecast` soit propre, testable et sans zones grises.

Chantiers:

- corriger les regressions UX bloquantes;
- uniformiser les messages d'erreur;
- eliminer les zones "foundation only" les plus visibles;
- ajouter de vrais tests de parcours.

### Axe B - Sortir les modules semi-finis du mode brouillon

But:

- eviter qu'un client tombe sur une fonction qui "a l'air la" mais n'est pas fiable.

Chantiers prioritaires:

- `Goals` persiste en backend;
- `Mail Integration` devient un vrai module;
- `Benchmarking` clarifie les providers reellement supportes en envoi direct;
- `Company Detail` stocke enfin les vraies donnees tenant.

### Axe C - Renforcer l'ecosysteme utile

But:

- ajouter peu d'integrations, mais les bonnes.

Priorite:

1. `Google / Outlook mail`
2. `Google Calendar`
3. `SMTP / Mailcow / Brevo / Mailchimp` bien cadres
4. `Stripe`
5. `QuickBooks / Xero` ou equivalent comptable
6. `Webhooks + API docs`
7. `Zapier / Make / n8n`

### Axe D - Monter le niveau produit

But:

- rendre o7 presentable et defendable face a un acheteur exigeant.

Chantiers:

- changelog propre;
- checklist de release;
- docs admin / user / comparatif;
- definition of done;
- suivi bugs / priorites / dette.

## 5. Roadmap 90 jours

## Phase 1 - 0 a 30 jours

Objectif:

- supprimer les points faibles les plus visibles.

### Priorite 1

`Goals` en vrai backend

Livrables:

- schema base de donnees;
- endpoints API tenant-scoped;
- lecture / ecriture serveur;
- suppression du stockage local comme source principale;
- garde-fous par tenant et permissions.

Critere d'acceptation:

- un admin configure des objectifs;
- un refresh ne perd rien;
- un autre admin du meme tenant voit les memes objectifs;
- un autre tenant ne voit jamais ces donnees.

### Priorite 2

`Mail Integration` en vrai module

Livrables:

- configuration SMTP / Mailcow persistante;
- test d'envoi depuis l'UI;
- etat de connexion clair;
- erreurs lisibles;
- documentation minimale d'installation.

Critere d'acceptation:

- un admin enregistre une config;
- un test email part;
- l'etat est visible apres refresh;
- l'UI ne promet pas une sync inbox si elle n'existe pas encore.

### Priorite 3

Couverture i18n propre

Livrables:

- recenser les textes hardcodes;
- basculer les pages principales dans i18n;
- valider les langues remises:
  - `de`
  - `it`
  - `pt`
  - `nl`
  - `ru`
  - `no`
  - `ja`
  - `zh`
  - `ar`

Critere d'acceptation:

- pas de page principale avec blocs hardcodes majeurs;
- pas de build casse par `Record<LanguageCode, ...>`;
- `ar` passe bien en `rtl`.

## Phase 2 - 30 a 60 jours

Objectif:

- fiabiliser l'exploitation quotidienne.

### Priorite 4

Tests E2E des parcours critiques

Parcours a couvrir:

1. login / register / invitation
2. creation client
3. creation task
4. creation deal
5. workflow stage edit
6. post-sales task flow
7. OCR upload
8. newsletter draft + test send

Critere d'acceptation:

- pipeline CI qui execute ces parcours;
- aucune release `main` sans passage vert.

### Priorite 5

`Company Detail` tenant profile

Livrables:

- nom legal;
- adresse;
- tax IDs;
- email de facturation;
- telephone;
- persistence backend.

Critere d'acceptation:

- visible et modifiable depuis `My Account > Company Detail`;
- reutilisable dans contrats / facturation / branding.

### Priorite 6

Permissions et audit de base

Livrables:

- verifier les roles sensibles;
- journal minimal des actions admin;
- tracabilite des changements critiques.

Critere d'acceptation:

- au minimum: users, subscriptions, tenant settings, goals, mail setup.

## Phase 3 - 60 a 90 jours

Objectif:

- commencer a combler l'ecart ecosysteme.

### Priorite 7

Webhooks + documentation API

Livrables:

- webhooks sortants:
  - client created / updated
  - deal created / updated
  - task created / updated
  - invoice uploaded
- doc d'usage;
- secret de signature.

Critere d'acceptation:

- un outil externe peut reagir sans bricolage manuel.

### Priorite 8

Integrations business prioritaires

Options a choisir selon impact commercial:

- `Stripe`
- `Brevo`
- `Mailchimp`
- `QuickBooks`
- `Xero`

Regle:

- ne pas lancer 5 integrations a moitie faites;
- en terminer 2 correctement.

### Priorite 9

Connecteurs no-code

Objectif:

- rendre o7 branchable par un client sans dev custom.

Minimum viable:

- webhook entrants / sortants;
- guide `Zapier / Make / n8n`.

## 6. Ordre d'execution recommande

Si on veut avancer sans se disperser:

1. `Goals` backend
2. `Mail Integration`
3. i18n propre
4. tests E2E critiques
5. `Company Detail`
6. audit log minimal
7. webhooks
8. 2 integrations externes bien faites

## 7. Definition of done

Une feature n'est pas consideree comme "faite" si elle a seulement une page visible.

Une feature est "faite" si:

- le backend existe si la donnee doit survivre;
- l'UI gere les erreurs;
- les permissions sont claires;
- le comportement est stable apres refresh;
- le multi-tenant est respecte;
- le build passe;
- les tests utiles existent;
- la documentation existe;
- le wording n'induit pas le client en erreur.

## 8. KPIs pour mesurer si on reduit vraiment la faiblesse principale

### Maturite

- nombre de modules "semi-finis" restants
- nombre de regressions critiques par mois
- taux de build vert sur `main`
- couverture E2E des parcours critiques

### Ecosysteme

- nombre d'integrations externes reellement supportees
- nombre de webhooks exposes
- nombre de connecteurs no-code documentes

### Credibilite client

- temps de setup d'un nouveau tenant
- temps pour brancher mail / calendar / products / users
- nombre de pages encore avec message "planned" ou "foundations only"

## 9. Backlog concret

### Bloc A - a ouvrir maintenant

- [ ] backend persistence pour `admin/goals`
- [ ] API `GET/PATCH /admin/goals`
- [ ] migration DB pour goals par tenant / mois / user
- [ ] remplacement du local storage par source serveur
- [ ] UI de loading / saving / error sur goals

### Bloc B - juste apres

- [ ] ecran `admin/mail` branche au backend
- [ ] test d'envoi email depuis interface
- [ ] model de config par tenant
- [ ] messages d'erreur et etat de connexion

### Bloc C - hygiene produit

- [ ] inventaire des textes hardcodes
- [ ] passage systematique dans i18n
- [ ] check de couverture par langue principale
- [ ] gestion `rtl` sur les zones sensibles

### Bloc D - fiabilite

- [ ] choisir stack E2E
- [ ] ecrire les 8 parcours critiques
- [ ] ajouter execution CI

## 10. Methode de travail entre nous

Pour avancer proprement ensemble:

### Quand on ouvre un chantier

On documente:

- probleme reel
- impact business
- solution retenue
- scope exact
- ce qui est explicitement hors scope

### Avant un commit important

On verifie:

- build
- typings
- parcours minimal
- wording UI
- multi-tenant

### Apres livraison

On met a jour:

- la doc user si besoin
- la doc admin si besoin
- la roadmap
- les limites connues

## 11. Decision log

### Decision 1

Ne pas essayer de concurrencer les leaders sur la largeur brute.

### Decision 2

Renforcer le coeur "vente + post-sales + contrats + OCR + newsletters + tenant branding".

### Decision 3

Traiter d'abord les modules visibles mais incomplets avant d'ajouter d'autres gros blocs.

### Decision 4

Ajouter peu d'integrations, mais les terminer proprement.

## 12. Prochaine action recommandee

Le meilleur prochain chantier sur `dev` est:

`Admin > Goals` en vrai backend persistant.

Pourquoi:

- la faiblesse est visible;
- le gain de maturite est immediate;
- le scope est maitrisable;
- cela corrige une incoherence produit nette.
