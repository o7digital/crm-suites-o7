# Bascule proposée — à valider avant toute production

Aucune commande ci-dessous n'a été exécutée en production pendant ce chantier. Mailcow, DNS, proxy, sauvegarde de secours et dispositifs de continuité restent inchangés.

## Changements précis

1. Ajouter cinq tables par `0042_pulse_connect/migration.sql` : demandes OAuth, connexions individuelles, codes hashés, tokens hashés, reçus/audit des actions. Aucun changement de colonne des modèles CRM et aucune réécriture des fiches existantes.
2. Déployer l'API Nest du commit testé sur le VPS existant. Les nouveaux endpoints sont `/api/mcp`, `/api/oauth/*` et les trois endpoints `/.well-known/*` du dossier principal. Le routage existant du domaine API possède déjà `location /` : aucun vhost/DNS à créer.
3. Déployer le frontend Next sur le projet Vercel racine `crm-suites-o7`. Routes modifiées : `/account` (lien), `/login` (retour vers le consentement uniquement), `/connect/pulse` (nouvelle). Ajouter les headers anti-frame/no-referrer/no-store sur `/connect/*`.
4. Ajouter les cinq variables de `pulse-connect.env.example` à l'environnement privé de l'API. Conserver tous les JWT et paramètres de production existants. Aucun secret commun n'est remis aux utilisateurs. Le client public proposé est `pulse-chatgpt` ; sa callback exacte doit être copiée depuis ChatGPT avant activation.

Les dépendances ajoutées sont `@modelcontextprotocol/sdk` et `zod`, verrouillées par `api/package-lock.json`. Le code est désactivé si `PULSE_CONNECT_ENABLED` n'est pas exactement `true`.

## Préparation / vérification

- Recontrôler le SHA actuellement déployé avant intervention : celui audité est `ba2b1584d625a89974ff0c8f8f3f04ea15138c8b`.
- Lire le SHA final de la branche de livraison et vérifier le diff avec ce SHA de production. Le dossier de validation identifie la version testée. Ne pas sélectionner automatiquement `dev` ou le dernier commit d'une autre branche.
- Le script de déploiement VPS existant impose une ascendance `origin/dev`. Ne pas le contourner avec un merge/push de branche protégée implicite. La procédure ciblée ci-dessous permet de livrer le SHA approuvé de la branche dédiée, sans modifier une branche protégée.
- Vérifier le checkout propre, les backups, la base cible et la disponibilité du rollback de l'image existante. Ne pas lancer `prisma migrate deploy` : l'historique 0006 et le registre de production restent à réconcilier séparément.

## API : commandes après validation

Dans une session SSH sur `o7-vps`, avec le SHA complet de livraison approuvé :

```sh
cd /opt/o7/apps/o7-crm
git -C app status --short
git -C app rev-parse HEAD
git -C app fetch origin feature/chatgpt-mcp-oauth
# Renseigner uniquement le SHA complet testé fourni dans la livraison.
pulse_release_sha=SHA_COMPLET_APPROUVE
git -C app merge-base --is-ancestor "$pulse_release_sha" origin/feature/chatgpt-mcp-oauth
git -C app diff --stat ba2b1584d625a89974ff0c8f8f3f04ea15138c8b "$pulse_release_sha"
./backup.sh
git -C app checkout --detach "$pulse_release_sha"
APP_VERSION="$pulse_release_sha" docker compose build api
```

Avant la migration, vérifier que la base de l'API et `POSTGRES_DB` correspondent toujours à `pulsecrm_prod_20260928_final`. Lire uniquement le nom de base, jamais la DATABASE_URL brute. Vérifier l'absence des nouvelles tables ; si elles existent déjà, arrêter et comparer leur schéma plutôt que rejouer le SQL sans contrôle.

```sh
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < app/api/prisma/migrations/0042_pulse_connect/migration.sql
```

La migration comporte `BEGIN/COMMIT` et `lock_timeout=5s`. Elle ajoute seulement les tables/index/FK du connecteur. Son échec ne doit pas être masqué. Vérifier les cinq tables et les index uniques après application.

Ajouter les variables de l'exemple à `.env` via l'outil habituel, sans afficher son contenu. Garder `PULSE_CONNECT_ENABLED=false` jusqu'à la disponibilité du frontend et de la callback. Mettre `APP_VERSION` au SHA approuvé dans ce même fichier pour que les opérations Compose ultérieures gardent la bonne image.

```sh
APP_VERSION="$pulse_release_sha" docker compose up -d --no-deps api
curl --fail https://api.crm.o7digitalgroup.com/api/health
```

## Frontend et activation après validation

Depuis le worktree propre du SHA testé, à la racine du dépôt liée au projet existant `crm-suites-o7` :

```sh
vercel deploy --prod --yes
```

Ne pas reprendre un build local compilé pour `127.0.0.1:4109`. La commande distante utilise les variables Vercel du projet ; confirmer que `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_ROOT` désigne le VPS existant, sans valeur localhost. Vérifier `/login`, `/account`, `/connect/pulse` en production avec un compte de test isolé autorisé.

Après configuration de la callback exacte et de l'identifiant client, passer `PULSE_CONNECT_ENABLED=true` et recréer seulement l'API. Vérifier :

```sh
curl --fail https://api.crm.o7digitalgroup.com/.well-known/oauth-authorization-server
curl --fail https://api.crm.o7digitalgroup.com/.well-known/oauth-protected-resource/api/mcp
# Attendu : 401 + WWW-Authenticate, aucun accès anonyme.
curl -i https://api.crm.o7digitalgroup.com/api/mcp
```

La discovery doit annoncer le bon issuer, PKCE S256 et exactement `resource=https://api.crm.o7digitalgroup.com/api/mcp`. Exécuter ensuite le parcours OAuth et les écritures dans un tenant de test de production distinct, vérifier leurs fiches dans Pulse puis révoquer et nettoyer uniquement ces données de test selon le processus habituel. Aucun essai ne doit créer Carlos dans Zevi sans instruction explicite d'Eduardo.

## Retour arrière

- Désactivation immédiate : `PULSE_CONNECT_ENABLED=false`, recréer uniquement le service API. Les connexions deviennent inutilisables sans changer les JWT du CRM.
- Pour révoquer définitivement les connexions existantes : utiliser la révocation individuelle ; une opération de révocation générale en base doit faire l'objet d'une intervention explicite distincte.
- Retour applicatif : remettre l'image API précédente `o7-crm-api:ba2b1584d625a89974ff0c8f8f3f04ea15138c8b` et son `APP_VERSION`, recréer seulement l'API, remettre le checkout au SHA précédent et vérifier la santé/login/CRM. Le script `deploy.sh` existant accepte le SHA précédent s'il appartient toujours à `origin/dev` ; il n'exécute aucune migration descendante.
- Frontend : redéployer via Vercel CLI le SHA/déploiement précédent du même projet, vérifier les routes principales.
- Conserver les cinq tables et l'audit ; l'ancien code les ignore. Aucun DROP, aucune restauration de base sur les écritures récentes. Une restauration éventuelle se prépare dans une base distincte et n'est pas une étape de rollback de ce chantier.

## Connecter le ChatGPT d'Eduardo après activation

1. Dans ChatGPT web, ouvrir Plugins, bouton `+`, puis **Add custom MCP server**. Si la création de serveur personnalisé est absente ou bloquée par son workspace, un administrateur ChatGPT doit autoriser cette fonction. Aucun accès à ce réglage personnel n'était disponible pendant les tests.
2. Nom : **Pulse CRM**. Server URL : `https://api.crm.o7digitalgroup.com/api/mcp` — cette adresse utilise le domaine existant mais sa route sera disponible seulement après la bascule.
3. Choisir **OAuth**. Renseigner le client public prédéfini `pulse-chatgpt` et aucun client secret ; token endpoint auth `none` avec PKCE S256. Si des champs de scopes sont disponibles : `pulse:read pulse:write offline_access`. Les endpoints sont publiés dans discovery et n'ont pas à être inventés.
4. Copier la callback exacte affichée dans la gestion du serveur ChatGPT et la communiquer pour l'allowlist `PULSE_CONNECT_REDIRECT_URIS`. Ne pas remplacer cette étape par une callback supposée ; le serveur refuse toute autre URL. Si ChatGPT exige une autre méthode d'identification client dans son interface effective, constater le blocage et adapter la configuration avant d'activer, sans passer en accès anonyme.
Si ChatGPT ne révèle la callback qu'après découverte du serveur, activer d'abord le connecteur avec une allowlist de callbacks vide : discovery et le challenge 401 fonctionnent, mais toute demande d'autorisation échoue. Ajouter ensuite seulement la callback exacte affichée et recréer l'API.

5. Créer/installer le plugin puis lancer la connexion. Eduardo se connecte avec son propre compte Pulse, vérifie **ZEVI CAPITAL** et son identité, confirme son vrai fuseau, et coche l'autorisation d'écriture s'il la souhaite. Il ne doit pas utiliser le compte de support O7.
6. Dans la conversation, sélectionner `@Pulse CRM`, demander d'abord l'identité/le fuseau, puis une recherche de contact. Pour la demande combinée, fournir les coordonnées manquantes, choisir le pipeline/étape et confirmer la date/heure de « mardi » si ambiguë. ChatGPT doit utiliser l'action atomique et afficher les IDs/liens réels après validation d'écriture.
7. Ouvrir ces liens dans Pulse. Révoquer depuis **Mon compte → Conexiones ChatGPT**, puis vérifier qu'un nouvel appel exige de se reconnecter.

Le test de l'hôte ChatGPT lui-même reste manuel : le navigateur local teste un client OAuth de test et le vrai serveur MCP, sans prétendre simuler la politique de confirmation ou l'interface actuelle du compte personnel d'Eduardo.
