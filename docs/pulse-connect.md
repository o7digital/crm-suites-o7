# Pulse Connect — livraison MCP / OAuth individuel

> État actuel au 23 octobre 2026 : déployé sur le VPS et Vercel avec la migration 0042 ; callback et parcours réel ChatGPT encore à valider. Voir [le rapport de production](pulse-connect-production-20261023.md). L'audit ci-dessous décrit la situation initiale du 17 octobre.

Version préparée le 17 octobre 2026, dans le worktree `crm-pulse-chatgpt`, branche `feature/chatgpt-mcp-oauth`. La branche de livraison repose sur le SHA exact de l'API de production ; les quatre commits frontend de dev non liés à ce chantier ont été laissés hors de la livraison. La production n'a pas été modifiée. Ce document décrit une version avec écritures réelles sur PostgreSQL et un parcours navigateur testé, pas une connexion déjà installée chez Eduardo.

## Audit de l'existant

- Le dépôt principal reste sur `dev` avec ses modifications locales intactes : intégration ChatGPT, migration 0035, administration, seed, dashboard et fichiers frontend. Aucun de ces changements locaux n'a été importé ou écrasé. Les six suites locales Olivia/ChatGPT existantes passent : 27 tests. L'ancien connecteur est une API GET, à clé globale O7 ; il n'est ni un serveur MCP ni un OAuth individuel.
- `OliviaIntegrationService` persiste déjà `Client(clientStatus=PROSPECT)`, `Deal` et `Task` dans une transaction et déduplique les messages. Il utilise un secret commun et un routage mailbox/domain/tenant. Ce mécanisme n'est pas utilisé pour authentifier ChatGPT. Il conserve son comportement historique.
- `IaController` analyse des opportunités à partir des services et du tenant utilisateur ; il n'apporte pas de flux OAuth/MCP individuel.
- Production vérifiée en SSH : API Docker `o7-crm-api-1`, image/checkout `ba2b1584d625a89974ff0c8f8f3f04ea15138c8b`, checkout propre, dans `/opt/o7/apps/o7-crm`. Base privée `pulsecrm_prod_20260928_final`, service `postgres`, utilisateur PostgreSQL `pulsecrm`. Aucun secret n'a été affiché.
- L'identité active est le login local Pulse et le JWT existant, avec issuer/audience configurés. Supabase et Clerk ne sont pas configurés sur l'API active. Le frontend est toujours sur Vercel : `https://crm.o7digitalgroup.com` (HTTP 200). L'API VPS `https://api.crm.o7digitalgroup.com/api/health` répond 200. Les routes MCP, discovery OAuth et ancien ChatGPT GET répondent 404 avant livraison.
- Le workspace `ZEVI CAPITAL` contient le compte client propriétaire et un compte de support distinct. Il n'existe aucune colonne de fuseau horaire dans le schéma de production. Le fuseau d'Eduardo ne peut donc pas être déduit du compte. Le consentement propose le fuseau du navigateur et exige sa confirmation explicite ; la valeur confirmée est enregistrée dans la connexion. Aucun fuseau d'Eduardo n'a été présumé.
- Les anciennes mentions Railway/Vercel dans `pulse-v2-phase-1.md` ne sont pas une procédure actuelle pour l'API. Le registre Prisma historique n'est pas réconcilié : ne pas lancer `prisma migrate deploy` en production.

## Comportement livré

`POST /api/mcp` utilise le SDK officiel MCP TypeScript, en Streamable HTTP stateless avec réponses JSON. Les sessions SSE autonomes ne sont pas nécessaires ; GET/DELETE authentifiés retournent 405. Discovery à `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` et `/.well-known/oauth-protected-resource/api/mcp`.

Le flux OAuth repose sur la session Pulse existante : authorization code à usage unique, PKCE S256 obligatoire, callback exact autorisé, `state`, `iss`, audience `resource`, expiration, access tokens opaques de 15 minutes, refresh tokens rotatifs de 30 jours avec `offline_access`. Les codes et tokens sont stockés uniquement sous forme de hash SHA-256. Le rejeu d'un refresh token révoque sa famille de connexion. Un client OAuth public prédéfini est utilisé ; aucun secret CRM partagé n'est demandé à Eduardo. DCR et CIMD ne sont pas annoncés.

Les scopes sont `pulse:read`, `pulse:write` et `offline_access`. Le consentement affiche l'identité et l'espace issus du serveur ; les écritures sont décochées par défaut. Une session d'impersonation support ne peut pas autoriser une connexion. La révocation est disponible dans Pulse, `Mon compte → Conexiones ChatGPT`, ou via le endpoint OAuth de révocation. Une connexion ne peut révoquer celles d'un autre utilisateur. Adhésion, abonnement et permissions sont revérifiés lors des appels.

| Outil | Résultat réel |
|---|---|
| `pulse_context` | identité autorisée, workspace, rôle, fuseau confirmé, heure courante |
| `pulse_search_contacts`, `pulse_get_contact` | recherche et lecture de Client/PROSPECT |
| `pulse_create_contact`, `pulse_update_contact` | création PROSPECT et modification de coordonnées |
| `pulse_pipelines` | pipelines et étapes du workspace |
| `pulse_search_opportunities`, `pulse_get_opportunity` | recherche et lecture d'un Deal autorisé |
| `pulse_create_opportunity`, `pulse_update_opportunity` | création et modification de Deal |
| `pulse_move_opportunity` | déplacement vers une étape OPEN du même pipeline |
| `pulse_create_task`, `pulse_tasks` | création et consultation des tâches/relances |
| `pulse_create_prospect_opportunity_followup` | création atomique contact + Deal + tâche, ou utilisation d'un clientId explicitement choisi |

Les montants non négatifs ont deux décimales au maximum ; les devises de cette version sont MXN/USD/EUR/CAD. Le pipeline, l'étape, le contact et la relation entre tâche et opportunité sont validés. Les changements de coordonnées et d'opportunité exigent `expectedUpdatedAt` issu de la dernière lecture ; une modification concurrente est refusée. Les étapes de closing WON/LOST sont exclues de cette version, pour respecter les validations distinctes de closing du CRM.

Les noms, emails et téléphones existants provoquent une demande de choix avant une création de contact ; aucun homonyme n'est choisi silencieusement. Les dates doivent être des timestamps ISO avec offset. Le serveur retourne le fuseau confirmé et l'heure locale, mais n'interprète pas du français/espagnol libre : ChatGPT doit préciser le mardi concerné et l'heure si nécessaire avant l'écriture. Les textes des fiches sont explicitement traités comme données non fiables dans les instructions serveur et les descriptions d'outils.

Chaque écriture exige un `operationId` UUID stable. Une transaction associe les services métier, les changements et le reçu persistant ; les appels simultanés au même identifiant retrouvent les mêmes IDs, et un identifiant réutilisé avec d'autres paramètres est refusé. Les retries conservent ce même UUID, y compris après une perte de réponse. L'action combinée est entièrement atomique : aucun succès partiel n'est annoncé. Après une erreur de transport/persistance indéterminée, le résultat est déclaré inconnu jusqu'au retry du même identifiant. Les actions séparées restent des commits distincts : si une tâche échoue après une création de contact séparée, le contact demeure ; ChatGPT doit annoncer les IDs déjà confirmés et réessayer seulement l'action restante avec son operationId.

Les résultats contiennent les IDs persistés et des liens vers les routes existantes `/clients/:id`, `/crm/deal/:id` et `/tasks`. Les lectures/créations/modifications utilisent `ClientsService`, `DealsService`, `PipelinesService` et `TasksService`, liés à la transaction enveloppante ; aucun deuxième modèle de lead et aucune interface SQL libre. Le service `PulseActionsService.execute` peut être appelé par un futur adaptateur Olivia résolvant la même identité individuelle et la même connexion autorisée. Ce chantier ne modifie pas l'authentification historique Olivia.

L'audit `PulseActionReceipt` conserve l'acteur, le workspace, la connexion, l'action, sa date et les valeurs avant/après, avec le résultat nécessaire au retry. Les erreurs sont journalisées avec acteur/action/date/statut, sans arguments ni secrets. Les suppressions, envois, opérations en masse, calendriers externes et leurs effets réseau sont exclus. L'adaptateur TasksService de MCP désactive explicitement la synchronisation Google Calendar ; la tâche CRM et son activité restent réelles.

### Périmètre des droits

Les contrôles reprennent les services métier existants : les Deals des membres sont limités à leur propriétaire, tandis que les contacts et les tâches sont partagés au sein du workspace dans le CRM actuel. Les relations d'une nouvelle tâche avec un Deal conservent le contrôle du propriétaire appliqué par TasksService. Les OWNER/ADMIN travaillent dans leur workspace. Aucun outil n'accepte un tenantId/userId/ownerId externe pour changer ce périmètre ; les créations sont attribuées à l'utilisateur connecté. Aucune permission nouvelle ni restriction arbitraire n'est introduite sur les fiches historiques. Les tests comparent aussi la visibilité des contacts partagés avec ClientsService.

Les annotations MCP distinguent lecture et écriture ; le serveur ne désactive pas les confirmations ChatGPT. Le scope d'écriture autorise une capacité, pas une demande de contourner la confirmation de l'hôte.

## Vérifications reproductibles

Base locale jetable uniquement : `pulse_connect_test`, PostgreSQL 17, écoute localhost. Aucune donnée client copiée en test. Le script refuse un hôte distant ou un autre nom de base avant toute suppression.

```sh
cd api
npm ci
npm run build
npm test -- --runInBand
CONNECT_TEST_DATABASE_URL=postgresql://pulse_test@127.0.0.1:55439/pulse_connect_test bash test/run-connect-integration.sh
```

Le script reconstruit le snapshot pré-connecteur et applique le vrai SQL 0042. Il contourne le défaut historique 0006 sans changer son checksum. Les tests couvrent discovery/MCP initialize/list/call, consentement/annulation, PKCE invalide, code rejoué, audience et callback, scopes, hash des tokens, révocation personnelle et RFC 7009, rotation/rejeu/expiration, suspension et disparition d'adhésion, écritures réelles, isolation des tenants/propriétaires, doublons/homonymes, retry concurrent, conflits de version, relations invalides, rollback après échec d'étape et après échec de tâche.

Parcours navigateur avec toute l'application locale :

```sh
cd api
CONNECT_TEST_DATABASE_URL=postgresql://pulse_test@127.0.0.1:55439/pulse_connect_test node test/connect-browser-server.cjs
# Dans un autre terminal
cd frontend
npm ci
NEXT_PUBLIC_API_URL=http://127.0.0.1:4109/api npm run build
PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.connect.config.ts
```

Le harness refuse une base externe ; son compte temporaire et son jeton JWT ne sont pas des identifiants de production. Le test passe par le vrai login Pulse, le consentement, le token OAuth et l'appel MCP, puis ouvre les vrais écrans contact, opportunité et tâches et révoque la connexion. Le callback local représente un client OAuth de test : ce n'est pas le client ChatGPT.

Résultats et limites : voir `pulse-connect-validation.md`. Le lint frontend complet reste affecté par des erreurs préexistantes hors de ces fichiers ; le lint des fichiers frontend de ce chantier passe.

## Références officielles vérifiées

Les exigences d'authentification MCP/OAuth ont été vérifiées dans [OpenAI — Authentication](https://developers.openai.com/plugins/build/auth). La procédure d'installation, le support lecture/écriture, Streamable HTTP, les clients OAuth prédéfinis et les confirmations proviennent de [OpenAI — Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server). Le code n'utilise pas l'ancien mécanisme d'Actions GPT OpenAPI à clé partagée.
