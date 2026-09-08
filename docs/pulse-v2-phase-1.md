# Pulse V2 — Phase 1

La Phase 1 conserve Next.js, NestJS, Prisma, le modèle `Deal` et le style Pulse. Aucun modèle Company/Contact/Opportunity V2 n'est introduit. Aucun changement à Olivia V3, Mailcow, WordPress ou DNS.

## Livré dans le code

- Probabilité Olivia bornée entre 0 et 1, sans multiplication par 100. Les valeurs historiques ne sont pas réécrites.
- Les credentials SMTP/Mailchimp/Brevo/Buffer ne sont jamais retournés par les paramètres, y compris aux administrateurs. Les membres ne reçoivent pas la configuration marketing. Les écritures restent réservées aux OWNER/ADMIN.
- Chiffrement AES-256-GCM à chaque sauvegarde des credentials, nonce aléatoire et clé indépendante `MARKETING_ENCRYPTION_KEY`. Lecture compatible avec les anciennes valeurs en clair. Secret vide/omis = conservation ; fournisseur `null` = suppression explicite.
- Issuer et audience vérifiés, signatures et algorithmes limités par fournisseur. JWT historique, Supabase HS256/RS256/ES256 et Clerk RS256 disposent de profils explicites. Aucun issuer du token ne peut déterminer librement une URL JWKS. `NODE_ENV=production` **ou** `RAILWAY_ENVIRONMENT_NAME=production` interdisent les valeurs de développement. La signature historique exige JWT_SECRET, JWT_ISSUER et JWT_AUDIENCE au démarrage.
- Le tenant des utilisateurs existants vient de leur enregistrement serveur, pas de leurs métadonnées éditables. Un nouvel utilisateur ne peut accéder à un tenant existant qu'avec une invitation correspondante.
- Le middleware frontend initialise Clerk uniquement si sa clé est configurée ; les déploiements Supabase évitent ainsi une erreur HTTP 500 liée à Clerk.
- `GET /stages` reste strictement en lecture seule ; mutations pipeline/étapes réservées aux administrateurs. Le DDL historique au démarrage est désactivé, sauf activation explicite de RUN_LEGACY_SCHEMA_UPGRADER.

## Tâches et opportunités actuelles

`Task` reçoit `assigneeId`, `priority` (LOW/MEDIUM/HIGH/URGENT, défaut MEDIUM), `opportunityId` lié à `Deal`, et `completedAt` géré par le serveur. Passer à DONE fixe la date ; répéter DONE la conserve ; rouvrir la tâche l'efface. Le client reste obligatoire dans cette phase. Les références sont vérifiées dans le tenant, et les liens vers des deals respectent leur propriétaire pour les membres.

`Deal` reçoit `lastActivityAt`, `nextActionAt`, `boardOrder`. La création/modification métier, les changements d'étape, les closings et les changements de tâche liée alimentent l'activité ; un simple classement dans une colonne ne compte pas comme activité commerciale. Le formulaire CRM permet de saisir/effacer la prochaine action et affiche la dernière activité.

## Command Center initial

Le dashboard existant contient cinq groupes : tâches du jour, tâches en retard, closings de la semaine, deals sans prochaine action, deals sans activité depuis 14 jours. Chaque groupe donne le total et les dix premiers éléments avec un lien. Endpoint : `GET /api/dashboard/command-center?timeZone=America/Mexico_City`.

Le calendrier utilise le fuseau IANA du navigateur, avec semaines du lundi au lundi et gestion DST. Les tâches terminées et les deals clos sont exclus. Les administrateurs voient le workspace ; les membres voient les tâches qui leur sont assignées et leurs deals. Les anciennes tâches non assignées restent accessibles sur la page Tâches et aux administrateurs ; leur assignation n'est pas inventée.

Une activité historique inconnue reste `null` ; un deal sans activité connue devient ancien selon sa date de création. Aucun faux backfill d'activité/completion n'est réalisé. Les anciennes dates saisies comme minuit UTC peuvent tomber la veille dans certains fuseaux ; une harmonisation des dates civiles historiques reste à préparer.

## Kanban et closing

`PATCH /api/deals/:id/rank` persiste le déplacement/l'ordre. La transaction verrouille l'ordre de destination et vérifie tenant, propriétaire, pipeline, étape ouverte et version `updatedAt`. Le navigateur affiche immédiatement le déplacement, restaure son état si l'appel échoue, puis relit le serveur. L'ordre survit au rechargement et au changement de navigateur.

Pendant le drag, les cibles WON/LOST apparaissent en bas. WON ferme immédiatement le deal. LOST ouvre le formulaire obligatoire de motif avec commentaire optionnel. Les deals clos quittent le pipeline ouvert. Statut, étape, closedAt, motif, note, probabilité et historique sont écrits dans une transaction.

`POST /api/deals/:id/close` accepte un `operationId` pour les retries. `DealActivity` conserve l'acteur, l'action et les valeurs avant/après. L'historique est consultable depuis le formulaire du deal et via `GET /api/deals/:id/activity` (100 événements récents).

Undo apparaît 7 secondes. `POST /api/deals/:id/undo-close` vérifie l'acteur, la version courante et une limite serveur de 2 minutes. Il restaure les champs du closing, y compris montant, probabilité, prochaine action et étape d'origine. Il conserve une nouvelle activité d'audit et refuse d'écraser un changement ultérieur. Les tâches/onboardings créés par ce closing ne sont supprimés que s'ils n'ont pas changé ; sinon toute l'annulation est refusée. L'UI restaure la carte fermée si Undo échoue.

## Migration et ordre de livraison

Nouvelle migration : `api/prisma/migrations/0037_pulse_phase1/migration.sql`. Ajout de colonnes nullable ou avec défaut compatible, enum de priorité, index et table DealActivity. Aucune suppression ni réécriture de données historiques. Une transaction et un lock_timeout de 5 secondes font échouer l'opération plutôt que de bloquer durablement les tables.

La migration existante 0036 doit déjà être appliquée et vérifiée : elle ajoute les champs de closing et comporte un backfill depuis Stage. Ne pas la rejouer aveuglément. L'historique antérieur présente un défaut reproductible dans 0006 (CTE `won_stage` réutilisée après la première instruction). La Phase 1 ne modifie pas les checksums des anciennes migrations.

1. Identifier le fournisseur actif et configurer les paramètres de `pulse-phase1.env.example`, sans rotation improvisée des clés existantes.
2. Comparer le schéma et `_prisma_migrations` sur la cible, sauvegarder la base, valider 0036 et appliquer 0037 dans une fenêtre adaptée. Sur un historique géré auparavant par le SchemaUpgrader, réconcilier explicitement Prisma avant tout `migrate deploy`.
3. Déployer le commit isolé via Railway CLI sur `modest-heart/web/production`, puis Vercel CLI sur le projet racine `crm-suites-o7` (pas le projet imbriqué `frontend`).
4. Vérifier santé, authentification réelle, dashboard, tâches et Kanban avec un compte de test autorisé.
5. Après livraison de la lecture compatible et configuration de la clé, lancer `node scripts/encrypt-marketing-secrets.cjs` sur l'API construite en dry-run. `--apply` chiffre les anciennes valeurs ; mise à jour conditionnelle par updatedAt, aucun credential loggé. Relancer en cas de conflit. Le script n'est jamais lancé au démarrage.

Rollback du schéma : conserver les ajouts, ne pas supprimer les données. Après chiffrement, tout rollback applicatif doit conserver la lecture des valeurs chiffrées et la même clé ; revenir directement à un ancien code incapable de déchiffrer casserait les connecteurs.

## Vérifications

- `npm run build` et `npm test -- --runInBand` dans api.
- `PHASE1_TEST_DATABASE_URL=... bash api/test/run-phase1-integration.sh` utilise exclusivement la base locale jetable `pulse_phase1_test`. Le script supprime son schéma puis reconstruit un snapshot pré-Phase-1 avant d'appliquer le vrai SQL 0037. Il ne valide pas toute la chaîne de migrations historiques.
- `npm run build`, `npm run lint` et `npm run test:phase1` dans frontend. Les tests navigateur utilisent des réponses API simulées ; les transactions métier sont testées séparément sur PostgreSQL réel.
- La CI reprend build, unitaires, intégration PostgreSQL et frontend.

## Blocages de production et Phase 2

Au dernier contrôle, le service Railway ciblé ne déclarait ni JWT_SECRET/issuer/audience, ni configuration Supabase/Clerk attendue, ni MARKETING_ENCRYPTION_KEY. Ne pas pousser `dev` tant que ces prérequis et la migration sûre ne sont pas confirmés : le push peut lancer un déploiement automatique.

Les modifications locales préexistantes ChatGPT, seed et administration restent hors de ce lot.

Prêt pour la Phase 2 : champs d'exécution commerciale, endpoint Command Center, audit des actions Kanban, contrats de sécurité et tests d'isolation. Restent : réconciliation des migrations historiques, contraintes multi-tenant généralisées/RLS, unification complète de l'identité, stockage objet des documents, chiffrement effectif du stock de secrets et normalisation vérifiée des anciennes probabilités Olivia. Le nouveau modèle CRM reste volontairement différé.
