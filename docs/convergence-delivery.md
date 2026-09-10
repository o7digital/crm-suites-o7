# Livraison convergence — 10 septembre 2026

Travail isolé dans `convergence/crm-integrations` (Suites Mine) et `convergence/communications` (O7). Sauvegardes `dev_suites` et `dev_crmpluse` préexistantes conservées. Les dossiers de travail originaux, notamment le WIP ChatGPT d'O7, restent intacts.

## Réalisé dans le code

- O7 : studio communication adapté au workspace, contenus par défaut génériques, brouillons navigateur séparés par tenant et utilisateur ; récupération locale sans écrasement au chargement ; catalogue basé sur les contenus du workspace.
- Suites Mine : port ciblé du CRM/Pulse du master, clôture WON/LOST avec historique et Undo, classement Kanban, tâches enrichies, Command Center, reporting et métriques. Thème client conservé. Migrations 0036/0037 proposées, non appliquées en production.
- Deux projets : création Buffer exclusivement en brouillon, validation du statut et de la date renvoyés ; intégrations Mailchimp/Cloudbeds/GA4/Olivia décrites par des contrats tenant-scoped et page `/admin/connections` affichant leur état réel. Aucune nouvelle synchronisation Cloudbeds, GA4 ou Olivia n'est revendiquée.
- Suites Mine : contrôles issuer/audience JWT et permissions repris du master ; secrets marketing masqués et chiffrés ; mode démo explicite ; CORS limité aux URLs configurées ; readiness Railway `/api/ready`.

Le studio mail ne constitue pas une boîte IMAP : inbox entrante, synchronisation complète d'emails, historique conversationnel par contact, statistiques délivrabilité/tracking et centre de préférences ne sont pas nouvellement implémentés. Leur absence ne doit pas être présentée comme une intégration fonctionnelle. Le paramétrage SMTP/Mailchimp existant est conservé ; aucun envoi réel effectué pendant ce travail.

## Validation réalisée

- Builds API et frontend : succès sur les deux projets.
- O7 : 55 tests unitaires API ; Suites Mine : 40 tests unitaires API.
- PostgreSQL local jetable : 10 tests d'intégration par projet, dont migration 0037, isolation tenant, transactions, concurrence WON/LOST, historique et Undo.
- O7 : 4 tests navigateur réussis avec Google Chrome, réseau simulé pour tester l'interface (pas une recette production).
- Suites Mine : les 4 scénarios navigateur repris du master ne peuvent pas atteindre l'interface dans le build local sans Clerk ; la page « Clerk is not configured » est affichée. Pas de suppression de la protection pour faire passer ces tests. Recette avec une vraie configuration/session Clerk encore requise.
- Initialisation B2C : SQL complet du schéma exécuté sur une seconde base locale vide ; aucune donnée O7 ou Suites Mine importée.

## Limites et bascule

Railway Suites Mine n'existe pas encore : suivre `docs/deployment/railway-suitesmine-b2c.md`. Le projet localement lié contient les bots et ne doit pas recevoir l'API CRM. Aucun backend ou schéma de production déployé dans cette livraison ; aucune publication Buffer ni campagne envoyée.

La bascule production reste conditionnée à la création du projet B2C isolé, au contrat Clerk issuer/audience testé, à l'inventaire des données client actuelles et à la validation explicite du baseline/migrations. L'ancienne migration 0006 ne peut pas être rejouée telle quelle sur une base vide. O7 doit également vérifier l'état de ses migrations et variables JWT/chiffrement avant de déployer son API avec ce code.

Les anciennes clés localStorage non cloisonnées ne sont pas supprimées ni attribuées automatiquement à un tenant : une récupération explicite de ces anciens brouillons peut être nécessaire. Le chiffrement nécessite une clé marketing propre à chaque environnement, conservée durablement.

## Modules partagés proposés

Extraire progressivement en packages versionnés : contrats CRM (deals/tâches/activités), communication (templates et brouillons), contrôles de permissions/tenant, contrats d'intégrations et composants Pulse. Garder l'authentification, les secrets, le branding et la composition des applications dans chaque déploiement. Ni monorepo ni refactor massif dans cette étape. Les nouveaux modules de cette livraison restent copiés de façon ciblée ; une publication de packages sera une étape ultérieure validée.
