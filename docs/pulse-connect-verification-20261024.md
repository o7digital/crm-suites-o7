# Pulse Connect — vérification complémentaire du 24 octobre 2026

La livraison applicative est en production. **La connexion réelle dans ChatGPT reste non validée : la callback exacte de ce compte ChatGPT n'a pas été reçue.** Aucun callback supposé, wildcard, accès anonyme ou compte Zevi n'a été utilisé pour contourner ce prérequis.

## Versions et déploiement vérifiés

- API OVH : `dc8505219a385ac5072572cc5b58e30c2c3f5786`, conteneur `o7-crm-api-1` healthy, image `sha256:a5fabcc71be91976f3403a733a8bdc1efe80dc6d2c280a17af56fa99c046606f`.
- Frontend Vercel : `dpl_9CBRtZQKSxtUMD7avawW1hm6qtdx`, READY, domaine `https://crm.o7digitalgroup.com`. Les métadonnées Git du déploiement annoncent le même SHA `dc85052` et la branche `release/pulse-connect-preserve-frontend`.
- Cette livraison conserve `28a9151` et les correctifs de production `6af760f`. La branche originale `feature/chatgpt-mcp-oauth` et le checkout principal avec ses modifications locales sont préservés.
- Le contrôle de concurrence a détecté la livraison déjà appliquée pendant la reprise ; la tentative de build supplémentaire s'est arrêtée avant mutation. La migration et le déploiement n'ont pas été rejoués.
- Base `pulsecrm_prod_20260928_final` : cinq tables Pulse, 40 colonnes et neuf index. Les 40 définitions de colonnes correspondent exactement à celles de la migration 0042 appliquée dans la base locale jetable. `0042_pulse_connect` est enregistré. Aucune migration historique exécutée par cette vérification.

## Sauvegarde et rollback

Le dump de livraison `/opt/o7/backups/o7-crm/pulse-connect-release-20261024T054526Z.dump` a été copié en fichier privé sur le Mac. SHA-256 identique : `b659fb1e7bd71bce17925c371e28e7bc7bc6cf608b9c7e7267ca646287666c88`.

**Restauration réelle réussie** dans la seule base locale `pulse_connect_backup_verify`, PostgreSQL 17 sur localhost:55439. Résultat : 91 contacts, 208 opportunités et huit tâches, conformes aux comptes de production contrôlés. Le dump n'a pas été restauré en production.

L'image API `6af760f` reste présente pour rollback ; le déploiement Vercel précédent est `dpl_Gx7Bnh6gFRgUNqDVxE6QrQe36Z3k`. Le rollback conserve les tables additives et les nouvelles écritures. Il n'a pas été déclenché. Voir les emplacements et la procédure dans [le rapport de livraison](pulse-connect-production-20261023.md).

## Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| Build API et build frontend locaux | Réussis |
| Tests unitaires API | 23 suites, 103 tests réussis |
| Intégration locale PostgreSQL isolée | 14 scénarios réussis : OAuth/PKCE, 14 outils MCP, droits, création atomique, retry concurrent, doublons, révocation et refresh |
| Discovery OAuth publique | 200 ; issuer et endpoints OVH, S256, `none`, scopes individuels et révocation |
| MCP sans OAuth | 401 et challenge `WWW-Authenticate` correct |
| Chrome, vrai login avec le compte MEMBER de test | Réussi |
| Routes `/crm`, `/clients`, `/tasks`, `/account`, `/connect/pulse` | 200, aucune erreur JavaScript observée |
| Destination des requêtes du frontend | `https://api.crm.o7digitalgroup.com/api`, vérifiée dans le navigateur |
| Lecture API du CRM et des connexions OAuth | 200 |
| Accès `/api/admin/users` du compte MEMBER | 403 attendu : droits usuels conservés |
| Création atomique et révocation depuis ChatGPT réel | À exécuter après callback et connexion personnelles |

Les tests navigateur de cette vérification n'ont créé aucune fiche CRM. Les tests d'écriture/déduplication/révocation ont été exécutés dans la base locale jetable ; ils ne constituent pas une validation des confirmations ou de l'interface ChatGPT.

Preuves privées locales : `/private/tmp/pulse-connect-ops/production-state.json`, `browser-smoke.json`, `production-connect-page.png` et `vercel-verification.json`. Les paramètres sensibles et mots de passe ne sont pas suivis par Git.

## Première connexion : action utilisateur nécessaire

Dans ChatGPT web : **Plugins → + → Add custom MCP server**. Valeurs :

| Champ | Valeur |
|---|---|
| Nom | Pulse CRM — test |
| Server URL | `https://api.crm.o7digitalgroup.com/api/mcp` |
| Authentification | OAuth |
| Client ID | `pulse-chatgpt` |
| Client Secret | Vide ; client public, PKCE S256 |
| Scopes, si le champ est proposé | `pulse:read pulse:write offline_access` |

Copier l'URI **Redirect URI / Callback URL** affichée dans la gestion/détails du serveur ChatGPT et la transmettre. Si la création bloque avant son affichage, transmettre le message exact. L'allowlist reste vide en attendant : discovery disponible, autorisation refusée. La documentation officielle impose d'utiliser la callback effectivement affichée : [authentification](https://developers.openai.com/plugins/build/auth), [ajout du serveur](https://developers.openai.com/api/docs/guides/custom-mcp-server).

Le compte préparé est `pulse-chatgpt-test-20261024@example.test`, espace **PULSE CONNECT TEST 20261024**, rôle MEMBER. Son mot de passe est uniquement dans **Bureau → Rapports O7 → PULSE-CONNECT-COMPTE-TEST-PRIVE.txt**, fichier 0600. Ne pas autoriser le compte de support ou Zevi pour ce test.

Après réception de la callback : conserver une copie privée de la configuration, ajouter uniquement cette URI exacte à l'allowlist existante et recréer seulement l'API avec la même image et sa politique de redémarrage actuelle, sans toucher aux gardes. Recontrôler santé et discovery. L'utilisateur se connectera avec le compte de test, vérifiera l'espace et confirmera son fuseau réel ainsi que le droit d'écriture souhaité.

## Parcours réel prêt à exécuter

1. Appeler `pulse_context`, vérifier le compte, **PULSE CONNECT TEST 20261024** et le fuseau ; rechercher un contact avec `pulse_search_contacts`, puis lire les pipelines. Arrêter si l'espace est différent.
2. Demander un prospect explicitement marqué TEST, email unique `@example.test`, une opportunité de 100 MXN dans `ChatGPT isolated sales`, étape `Nuevo — test`, et une relance à une date/heure ISO future confirmée. Utiliser exclusivement `pulse_create_prospect_opportunity_followup` avec un UUID `operationId` unique et une confirmation d'écriture dans ChatGPT. Aucun téléphone réel n'est nécessaire.
3. Conserver le JSON exact de l'opération, l'UUID et les trois IDs/liens retournés. Ouvrir les fiches dans Pulse et vérifier l'utilisateur, les relations, le statut PROSPECT, le montant et l'heure de relance.
4. Rejouer exactement le même appel avec le même UUID et les mêmes données : attendre les mêmes IDs et `replayed=true`, sans nouveau contact, opportunité ou tâche. Une nouvelle tentative de création de contact avec le même email doit être refusée ou demander un choix explicite, sans création silencieuse.
5. Dans Pulse → compte → connexions ChatGPT, révoquer cette connexion. Le prochain appel avec son ancien accès doit être refusé ; un éventuel nouveau consentement est une nouvelle connexion. Conserver les preuves d'audit et noter séparément les résultats ChatGPT réels.

Les instructions espagnoles sont dans [pulse-connect-eduardo-es.md](pulse-connect-eduardo-es.md). Eduardo utilisera ensuite son propre compte et ses droits habituels ; sa callback éventuelle doit aussi être enregistrée exactement. Aucun essai fictif dans ZEVI CAPITAL.

Mailcow, DNS, gardes et dispositif de secours n'ont pas été modifiés par cette vérification. Les chantiers WhatsApp et Railway restent séparés.
