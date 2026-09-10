# Intégration ChatGPT — O7 PulseCRM

Cette intégration expose une API privée, compacte et strictement **read-only** pour le seul tenant O7 configuré côté serveur. Elle ne modifie ni les souscriptions, ni Stripe, ni les sièges, ni les invitations, ni les JWT utilisateurs.

## Configuration Railway

Ajouter uniquement au service API Railway :

```env
CHATGPT_API_KEY=<secret aléatoire long>
CHATGPT_O7_TENANT_ID=<UUID exact du tenant O7 Digital>
CHATGPT_INTEGRATION_ENABLED=true
```

Génération locale possible :

```bash
openssl rand -base64 48
```

Ne mettre aucune de ces variables dans Vercel et ne jamais utiliser un préfixe `NEXT_PUBLIC_`. La clé est un secret serveur. Le tenant O7 peut être vérifié dans la base avec une requête en lecture seule :

```sql
SELECT id, name FROM "Tenant" WHERE name ILIKE '%O7%';
```

Le compte administrateur attendu est `olivier.steineur@gmail.com`, mais l’API **ne déduit jamais le tenant depuis l’e-mail**. Seule la valeur serveur `CHATGPT_O7_TENANT_ID` détermine le périmètre.

## Authentification

Chaque appel utilise :

```http
Authorization: Bearer <CHATGPT_API_KEY>
```

Après une rotation depuis `Admin > AI Access`, la nouvelle clé n’est affichée qu’une fois. Seul son hash SHA-256 est conservé en base; l’ancienne clé, y compris celle de l’environnement, cesse immédiatement de fonctionner.

## Endpoints

Base : `https://<API_RAILWAY>/api/integrations/chatgpt`

| Méthode | Route | Scope | Paramètres optionnels |
|---|---|---|---|
| GET | `/summary` | tous les scopes read | — |
| GET | `/clients` | `clients:read` | `limit` (1–100) |
| GET | `/deals` | `deals:read` | `status=OPEN|WON|LOST`, `limit` |
| GET | `/tasks` | `tasks:read` | `overdueOnly=true`, `limit` |
| GET | `/invoices` | `invoices:read` | `dueWithinDays` (1–365), `limit` |
| GET | `/forecast` | `forecast:read` | `month=YYYY-MM` |
| GET | `/pipeline` | `deals:read` | — |

Il n’existe aucun endpoint externe `POST`, `PATCH`, `PUT` ou `DELETE`. Le `POST` de rotation est séparé sous `/api/admin/integrations/chatgpt/rotate-key` et exige le JWT d’un admin du tenant O7.

Exemple :

```bash
curl -sS https://<API_RAILWAY>/api/integrations/chatgpt/summary \
  -H "Authorization: Bearer $CHATGPT_API_KEY"
```

Réponse synthétique :

```json
{
  "generatedAt": "2026-08-22T18:00:00.000Z",
  "workspace": { "name": "O7 Digital", "displayCurrency": "MXN" },
  "clients": { "total": 42, "newThisWeek": 3 },
  "tasks": { "open": 8, "overdue": 2 },
  "deals": {
    "counts": { "OPEN": 5, "WON": 7, "LOST": 2 },
    "totalsByCurrencyAndStatus": { "MXN": { "OPEN": 120000, "WON": 80000 } }
  }
}
```

Le modèle actuel de facture suit le traitement OCR (`NEW`, `PROCESSING`, `READY`) et non l’encaissement bancaire. Les réponses indiquent donc `paymentTrackingAvailable: false` au lieu d’inventer un montant encaissé.

## Connexion à ChatGPT

Le fichier [`chatgpt-openapi.yaml`](./chatgpt-openapi.yaml) décrit uniquement les opérations GET. Remplacer l’URL du serveur, puis l’importer dans la configuration d’une Action GPT et choisir une authentification API Key de type Bearer. Coller la clé O7 comme secret de l’Action, jamais dans les instructions du GPT.

Instructions suggérées pour le GPT :

```text
Utilise les actions PulseCRM uniquement pour répondre aux questions sur O7 Digital.
Les données sont en lecture seule. N'invente jamais un statut de paiement : si
paymentTrackingAvailable vaut false, explique que l'encaissement n'est pas suivi.
Ne demande et ne transmets jamais de tenantId.
```

## Sécurité multi-tenant

- Le guard lit le tenant exclusivement depuis `CHATGPT_O7_TENANT_ID`.
- Tout `tenantId` fourni par query, body ou header est rejeté.
- Chaque requête Prisma métier contient `where: { tenantId: configuredTenantId }`.
- Les clés brutes ne sont ni persistées ni loggées.
- L’audit conserve le tenant, l’identifiant non secret de clé, la route, la date et le statut HTTP.
- Les tenants clients apparaissent uniquement avec `External AI: Disabled`.

## Désactivation immédiate

Dans Railway, définir :

```env
CHATGPT_INTEGRATION_ENABLED=false
```

Puis redéployer/restart le service API. Tous les appels reçoivent alors `503`, y compris avec une clé correcte. Pour une révocation avec maintien du service, utiliser `Rotate API Key` et ne pas distribuer la nouvelle clé.

## Déploiement base de données

La migration `0035_chatgpt_external_api` crée les tables de credentials hashés et d’audit. Le `SchemaUpgraderService` contient aussi une création idempotente pour les déploiements où Prisma Migrate est temporairement bloqué.
