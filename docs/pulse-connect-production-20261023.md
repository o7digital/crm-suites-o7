# Pulse Connect — livraison en production du 23 octobre 2026

Complément du 24 octobre : [restauration réelle de la sauvegarde, contrôle du schéma et navigateur, étapes ChatGPT restantes](pulse-connect-verification-20261024.md). Le compte de test est maintenant aussi disponible dans le fichier privé `Bureau/Rapports O7/PULSE-CONNECT-COMPTE-TEST-PRIVE.txt`.

Intervention réalisée les 23 octobre (Mexico) / 24 octobre 2026 UTC. Ce rapport remplace l'état de production des rapports initiaux et du précontrôle du 18 octobre.

## Version et préservation des changements récents

- Branche du chantier d'origine : `feature/chatgpt-mcp-oauth`, commit `28a9151a770fe52d2a0ee922e0c17a00c69aa6b3`, laissée intacte.
- Version applicative livrée : `dc8505219a385ac5072572cc5b58e30c2c3f5786`, branche `release/pulse-connect-preserve-frontend`, déjà préparée avant cette reprise.
- Cette version contient le chantier et la production plus récente `6af760f1fa8447706303bf8b5af2175ae4946130`. Aucun redéveloppement ni retour à l'ancienne base `ba2b158`.
- Vérification GitHub par `git fetch origin`, checkout VPS propre et identité API/frontend recontrôlés avant la bascule. Aucune branche protégée modifiée.

## Sauvegarde et rollback vérifiés

- Dump privé : `/opt/o7/backups/o7-crm/pulse-connect-release-20261024T054526Z.dump`, 191692 octets.
- SHA-256 : `b659fb1e7bd71bce17925c371e28e7bc7bc6cf608b9c7e7267ca646287666c88`, fichier `.sha256` adjacent.
- Contrôles : `pg_restore --list` et décompression complète `pg_restore --file=/dev/null`, sans restauration en production. Aucun ancien backup purgé.
- Copie privée de l'environnement avant intervention : `/opt/o7/backups/o7-crm/pulse-connect-env-20261024T054526Z`.
- Image de rollback API présente : `o7-crm-api:6af760f1fa8447706303bf8b5af2175ae4946130`, ID `sha256:1e52aff0aabda571a7812309fa1aee8e43921b35cd69b1fc283186bbcd8a6a3b`.
- Rollback frontend disponible : `dpl_Gx7Bnh6gFRgUNqDVxE6QrQe36Z3k`, `https://crm-suites-o7-pt2kinqcg-olivier-steineur.vercel.app`.
- Rollback applicatif : désactiver Pulse Connect si nécessaire, remettre `APP_VERSION=6af760f1fa8447706303bf8b5af2175ae4946130` et recréer uniquement `api` avec cette image ; remettre le checkout au même SHA ; restaurer le déploiement frontend précédent via Vercel CLI. Vérifier santé/login/CRM. Conserver les tables additives et les écritures récentes ; aucun DROP ni restauration de base dans ce rollback. Procédure et artefacts vérifiés, rollback non déclenché.

## Migration et hébergements

- Base cible confirmée avant intervention : PostgreSQL privé du VPS, `pulsecrm_prod_20260928_final`.
- Les cinq tables Pulse étaient absentes et 0042 n'était pas enregistrée.
- Seul `api/prisma/migrations/0042_pulse_connect/migration.sql` a été appliqué, transaction avec `lock_timeout=5s`.
- Cinq tables présentes après application. Migration `0042_pulse_connect` enregistrée avec `prisma migrate resolve --applied 0042_pulse_connect`, terminée à `2026-10-24T05:50:32.443906Z`.
- Aucun `prisma migrate deploy`, aucune migration historique rejouée ou réconciliée.
- API : Docker Compose du VPS existant `/opt/o7/apps/o7-crm`, image `o7-crm-api:dc8505219a385ac5072572cc5b58e30c2c3f5786`, ID `sha256:a5fabcc71be91976f3403a733a8bdc1efe80dc6d2c280a17af56fa99c046606f`, conteneur healthy.
- Frontend : Vercel CLI, projet existant `crm-suites-o7`, déploiement production `dpl_9CBRtZQKSxtUMD7avawW1hm6qtdx`, URL `https://crm-suites-o7-94et213j7-olivier-steineur.vercel.app`, alias vérifié `https://crm.o7digitalgroup.com`.

## Configuration effective et vérifications

| Variable | Valeur effective |
|---|---|
| PULSE_CONNECT_ENABLED | true |
| PULSE_CONNECT_ORIGIN | https://api.crm.o7digitalgroup.com |
| PULSE_CONNECT_FRONTEND | https://crm.o7digitalgroup.com |
| PULSE_CONNECT_CLIENT_ID | pulse-chatgpt |
| PULSE_CONNECT_REDIRECT_URIS | vide : attend la callback exacte affichée par ChatGPT |

- `GET https://api.crm.o7digitalgroup.com/api/mcp` : 401 avec `WWW-Authenticate` et URL de métadonnées correcte.
- Discovery OAuth et ressource : 200 ; issuer exact, resource `https://api.crm.o7digitalgroup.com/api/mcp`, PKCE S256, client public `none`, scopes `pulse:read pulse:write offline_access`, refresh et révocation annoncés.
- Santé API : `ok=true`, `db=true`. Historique Prisma ancien laissé en l'état, aucune tentative de correction globale.
- Routes frontend `/login`, `/account`, `/connect/pulse` : HTTP 200. Consentement : headers `no-store`, `no-referrer`, `DENY`, `noindex, nofollow` vérifiés.
- Build API Docker et frontend local/Vercel : réussis. API : 23 suites, 103 tests réussis.
- Intégration PostgreSQL locale jetable : 14 scénarios réussis (OAuth, MCP 14 outils, services métier, droits, atomicité, retries concurrents, doublons, révocation et rotation refresh). Ce test ne touche pas la production.
- Compte membre isolé : login réel depuis Chrome ; lecture API authentifiée `/auth/me`, `/oauth/connections`, `/clients`, `/pipelines`, `/tasks` réussie ; accès `/admin/users` refusé 403 comme attendu pour MEMBER.
- Parcours Chrome de production terminé avec succès : `/connect/pulse`, `/account`, `/clients`, `/crm`, `/tasks`. Le navigateur appelle bien `https://api.crm.o7digitalgroup.com/api`, sans localhost. Capture privée : `/private/tmp/pulse-connect-ops/production-connect.png`. Le premier passage du banc a dû être corrigé pour accepter une navigation sans nouvelle réponse et les refus admin attendus pour MEMBER ; le passage final réussit. Aucun code applicatif modifié pour ces ajustements du banc temporaire.
- Totaux métier avant et après intervention : 91 contacts, 208 opportunités, 8 tâches ; aucune fiche fictive créée dans Zevi Capital.

## Espace de test préparé et étapes dépendant de l'utilisateur

- Espace exclusif : **PULSE CONNECT TEST 20261024**, tenant `ecff3761-ec64-467e-ba90-8bec374a9e72`.
- Compte `pulse-chatgpt-test-20261024@example.test`, rôle MEMBER, distinct de tout compte Zevi ou support.
- Pipeline `ChatGPT isolated sales`, ID `c20f8190-4dfd-41f7-a836-2dc6a7962842` ; étape `Nuevo — test`, ID `eccaa2e3-3ee4-46b0-83ab-520b0df4c92a`.
- Mot de passe aléatoire uniquement dans le fichier local privé `/private/tmp/pulse-connect-ops/compte-pulse-test.md`, jamais dans Git.
- **Connexion réelle depuis ChatGPT : non validée.** La callback exacte et les interactions dans le compte ChatGPT sont encore nécessaires. L'allowlist vide permet la découverte mais refuse toute autorisation ; aucune callback supposée ajoutée.
- Action attendue : ChatGPT web → Plugins → + → Add custom MCP server → Pulse CRM → URL MCP ci-dessus → OAuth → client public `pulse-chatgpt`, sans secret. Copier « Redirect URI / Callback URL » depuis gestion/détails du serveur et la transmettre. Si l'interface exige un autre mode client, relever exactement le champ ou l'erreur ; ne pas prétendre que ce mode est déjà testé.
- Après réception : ajouter uniquement cette URI exacte à l'environnement privé, recréer seulement l'API, puis connecter le compte de test. Vérifier dans le consentement le bon espace et confirmer le vrai fuseau.
- Depuis ChatGPT : vérifier identité/espace/fuseau et rechercher un contact ; créer un prospect unique `@example.test` avec opportunité et relance par l'outil atomique ; vérifier les liens et les trois fiches Pulse ; rejouer la même opération avec le même `operationId` et les mêmes données, vérifier les mêmes IDs et l'absence de doublons ; essayer une nouvelle opération avec le même email/téléphone et vérifier le refus ; révoquer dans Pulse et vérifier qu'un appel ChatGPT ne peut plus lire ni écrire. Enregistrer IDs et résultats dans ce rapport. Toutes les écritures doivent rester dans cet espace de test.
- Instructions espagnoles préparées dans [pulse-connect-eduardo-es.md](pulse-connect-eduardo-es.md), à utiliser après validation du premier parcours. Chaque utilisateur se connecte avec son propre compte et conserve les droits appliqués par les services CRM.

Mailcow, DNS, secours, alertes WhatsApp et migration Railway : aucune intervention.
