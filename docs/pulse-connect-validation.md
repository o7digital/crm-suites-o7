# Résultats Pulse Connect

> Mise à jour du 23 octobre 2026 : API/frontend et migration 0042 livrés. Voir [le rapport de production](pulse-connect-production-20261023.md) pour les versions, les tests rejoués et le blocage callback ChatGPT. Les sections ci-dessous conservent les résultats historiques de validation initiale.

## État

- Implémenté : serveur MCP distant, 14 outils, OAuth individuel, scopes, consentement/révocation, validation, restrictions, audit et retry transactionnel.
- Testé : PostgreSQL local isolé et vrai navigateur Chrome avec les écrans Pulse ; aucune donnée de production utilisée ou créée.
- Déployé : aucun nouveau code, aucune migration et aucune configuration en production à ce stade. API de production toujours sur `ba2b1584d625a89974ff0c8f8f3f04ea15138c8b`.
- Restant avant usage réel depuis ChatGPT : validation de bascule, callback exacte du client ChatGPT, déploiement API/frontend et test dans le compte ChatGPT d'Eduardo.

## Vérifications

| Vérification | Résultat |
|---|---|
| Anciennes suites locales Olivia/ChatGPT, dépôt initial intact | 6 suites, 27 tests réussis |
| API, suites unitaires de la branche isolée | 22 suites, 100 tests réussis |
| Build API / génération Prisma | Réussi |
| Migration réelle 0042 sur snapshot pré-connecteur | Réussie |
| OAuth + MCP + services métier sur PostgreSQL | 14 scénarios réussis |
| Chrome : login → consentement → token → MCP → fiches contact/opportunité/tâche → révocation | Réussi |
| Build frontend Next | Réussi |
| Lint des fichiers frontend du chantier | Réussi |
| Lint global frontend | Échec préexistant : 12 erreurs, 3 avertissements hors des fichiers du chantier |
| ChatGPT réel | Non testé : accès au compte et activation distante nécessaires |
| URLs de production avant changement | Santé API/frontend 200 ; routes OAuth/MCP/ancien ChatGPT GET 404 |

Les erreurs globales de lint se trouvent dans `sign/page.tsx`, `ReportingCharts.tsx`, `WorkflowTransferDialog.tsx`, `tests/phase1.spec.ts` et `tests/signatures.spec.ts`. Les avertissements concernent `ia-pulse/page.tsx` et `signatures/SigningPage.tsx`. Ils ne sont pas corrigés dans cette livraison.

Un passage du banc Supertest a eu une interruption de socket isolée ; un timeout d'initialisation est aussi apparu pendant les builds concurrents ; le banc utilise désormais un serveur HTTP persistant plutôt que les sockets éphémères de Supertest, et un délai distinct pour son initialisation. La validation finale des 14 scénarios passe en 6,8 secondes. Les premières reprises navigateur ont signalé des sélecteurs de test ambigus et des doublons de données laissées par un essai précédent ; les sélecteurs et les identités de test sont maintenant uniques. Aucun de ces essais n'a touché la production.

Le test backend vérifie notamment deux appels MCP simultanés avec le même operationId, un seul Client/Deal/Task en base, puis un refus si le contenu du retry change. Il vérifie aussi un échec volontaire de persistance de tâche après la création du contact et du Deal : toutes les écritures et le reçu sont annulés. Les modifications dans le navigateur proviennent des mêmes tables/services que les APIs normales du CRM.

## Limites explicites

- Les droits sont ceux des services CRM : contacts/tâches partagés dans le workspace, Deals des membres limités au propriétaire ; voir `pulse-connect.md`.
- Aucun fuseau n'était stocké sur Zevi ; il doit être confirmé dans le consentement, pas déduit de la localisation de l'utilisateur de ce chantier.
- Pas de DCR/CIMD dans cette version : client public OAuth prédéfini, callback allowlist exacte.
- Les dates relatives et les confirmations d'écriture doivent être validées dans le véritable hôte ChatGPT après installation ; ce n'est pas équivalent au test d'un client OAuth local.
- Les routes existantes sont vérifiées, mais les nouvelles routes de production ne pourront être vérifiées qu'après la bascule approuvée.
- La conservation des reçus est nécessaire pour la déduplication : ne pas les purger sans définir la durée pendant laquelle un retry demeure garanti. Les fiches CRM/coordonnées présentes dans l'audit restent des données personnelles à protéger avec la base et ses backups.
