# Pulse V2 — premier lot de sécurisation

Ce lot prépare la phase 1. Il ne constitue pas la refonte V2 complète.

## Contrats corrigés

- Olivia : `probability` est conservée entre 0 et 1. `0.6` représente 60 % ; un montant de 5 000 donne un revenu pondéré de 3 000. Les valeurs finies hors intervalle sont bornées ; les valeurs absentes ou non finies restent absentes. L'idempotence existante est conservée.
- `GET /api/stages` est en lecture seule. Il ne crée plus l'étape Contract et ne corrige plus les étapes existantes.
- Les mutations de pipelines et d'étapes nécessitent un utilisateur OWNER ou ADMIN retrouvé par son identifiant **et** son tenant. La lecture reste accessible aux membres.
- `GET /api/tenant/settings` conserve les paramètres CRM pour les membres mais retourne `marketingSetup: null`. Les administrateurs reçoivent la configuration marketing sans les credentials SMTP, Mailchimp, Brevo et Buffer. Les champs `passwordConfigured` / `apiKeyConfigured` indiquent leur présence.
- `PATCH /api/tenant/settings` ne renvoie jamais ces credentials. Un secret vide ou omis conserve la valeur enregistrée. Une nouvelle valeur la remplace. Un fournisseur explicitement `null` efface sa configuration ; `marketingSetup: null` efface la configuration complète.
- Les JWT asymétriques doivent correspondre exactement à `CLERK_JWT_ISSUER` avant toute récupération JWKS. La signature et l'issuer sont vérifiés même sans audience configurée. `CLERK_JWT_AUDIENCE`, si défini, est vérifié.
- Avec `NODE_ENV=production`, le module d'auth exige un `JWT_SECRET` d'au moins 32 octets et refuse `dev-secret`. La validation HMAC applique cette même règle au secret sélectionné (`SUPABASE_JWT_SECRET` prioritaire, puis `JWT_SECRET`).

## Validation et livraison

La CI construit l'API, exécute les tests unitaires, lance le lint frontend et construit Next.js. Aucun accès à une base n'est nécessaire pour ces tests. Les tests d'isolation utilisent des doubles Prisma ; ils ne remplacent pas des tests d'intégration sur PostgreSQL.

Avant livraison de l'auth, vérifier le fournisseur réellement utilisé et les paramètres du service de production sans afficher les secrets. Le service Railway `web` du projet `modest-heart` est celui référencé par `NEXT_PUBLIC_API_URL` du projet Vercel racine `crm-suites-o7`. Le projet Vercel imbriqué `frontend` n'est pas la cible retenue.

Ne pas inclure les modifications locales préexistantes (ChatGPT, seed et administration) dans ce lot. Déployer une archive du commit testé afin de ne pas les embarquer par le CLI.

## Suite de la phase 1

1. Configurer et unifier les issuers/audiences des flux Supabase, Clerk et JWT historique ; retirer la confiance accordée aux métadonnées utilisateur pour déterminer le tenant.
2. Chiffrer les secrets marketing au repos avec une clé gérée côté serveur et une procédure de rotation. Ce lot corrige leur exposition HTTP ; les valeurs stockées restent en JSON.
3. Remplacer le DDL au démarrage par des migrations explicites après comparaison du schéma déployé et de l'historique Prisma.
4. Rechercher les anciennes probabilités Olivia supérieures à 1 dans une opération de diagnostic séparée, puis préparer un backfill limité aux événements Olivia. Ne pas diviser automatiquement toutes les probabilités historiques.
5. Écrire les tests d'intégration multi-tenant et compléter les contraintes inter-tables avant les tables V2.
6. Préparer la migration Company/Contact/Opportunity par tables parallèles, identifiants legacy uniques par tenant, backfill idempotent, comparaison des totaux, pilote tenant et bascule réversible. Aucune suppression des tables V1 avant validation des comparaisons et du rollback.

Aucune migration de données ni modification des probabilités historiques n'est incluse dans ce lot.
