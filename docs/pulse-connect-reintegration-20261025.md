# Pulse Connect — réintégration au CRM actuel

## Sources de production retrouvées

Le domaine `crm.o7digitalgroup.com` servait le déploiement CLI
`dpl_CqMbcThKBqHdXUrUyvLZkv8HQRpL`, URL immuable
`https://crm-suites-o7-lk8z426nr-olivier-steineur.vercel.app`.
Il ne contient aucune métadonnée Git attestant sa provenance.

L'audit des empreintes SHA-1 des fichiers de l'API Vercel
`GET /v6/deployments/dpl_CqMbcThKBqHdXUrUyvLZkv8HQRpL/files` a établi :

- Les **405 sources** correspondent toutes au dossier local de publication
  `/private/tmp/crm-monthly-sales.Lnb0HV` (aucun fichier différent ou absent).
- Les **144 sources frontend et `vercel.json`** correspondent exactement aux
  contenus de `origin/dev` à `3249af8536fbccfb8eb621fe53b1a544500615bb`.
- Le seul fichier frontend suivi par Git mais non envoyé est `.gitignore`.

Il s'agit d'une preuve de correspondance des contenus, pas de métadonnées Git
ajoutées rétroactivement à cet ancien déploiement.

## Correction

Fusion de `release/pulse-connect-preserve-frontend` dans la base `dev` actuelle.
Le code métier API du résultat est identique à la version Pulse déjà exécutée
(`dc8505219a385ac5072572cc5b58e30c2c3f5786`) : aucun redéploiement API ou
rejeu de migration n'est nécessaire pour rétablir le frontend.

Le frontend conserve les sources publiées et ajoute le consentement
`/connect/pulse`, le lien « Conexiones ChatGPT » dans `/account`, les en-têtes
de protection et le retour au consentement après login. Les fichiers CRM,
dashboard, reporting, thèmes et workflows actuels ne sont pas remplacés.

La CI exécute désormais le banc OAuth/MCP sur une base PostgreSQL jetable et
un contrôle navigateur indépendant de disponibilité de Pulse Connect et du
lien depuis le compte. Les anciens tests de durée de récurrence sont adaptés
à la liste déroulante déjà en production (12 et 24 mois), sans modifier le CRM.

## Validation locale avant publication

- Builds API et frontend : réussis.
- API : 103 tests unitaires, 14 scénarios d'intégration OAuth/MCP réussis.
- Frontend : 22 tests navigateur CRM réussis, dont les deux contrôles Pulse.
- Navigateur local complet : login réel local, consentement OAuth, création MCP,
  visibilité du contact/opportunité/tâche dans le CRM, puis révocation : réussi.
- Lint ciblé sur les fichiers applicatifs Pulse et les tests modifiés : réussi.
- Lint global : des erreurs préexistantes dans le worker PDF généré,
  ReportingCharts, WorkflowTransferDialog, la page de signature et ses tests
  empêchent encore un résultat global vert. Aucun de ces fichiers n'est modifié
  par cette livraison. Le contrôle CI Pulse frontend est indépendant de ce lint.

Tous les tests d'écriture ci-dessus utilisent PostgreSQL **local**, exclusivement
la base `pulse_connect_test` sur `127.0.0.1:55440`. Aucun n'est un test ChatGPT.

## Publication et retour arrière

Créer un déploiement Vercel avec la configuration production et `--skip-domain`,
contrôler le candidat, vérifier que l'alias public n'a pas changé entre-temps,
puis promouvoir ce candidat. Attacher le SHA Git et la branche aux métadonnées.

Retour arrière frontend préparé :

```sh
vercel rollback https://crm-suites-o7-lk8z426nr-olivier-steineur.vercel.app --yes
```

Ce retour rétablit exactement le frontend précédemment servi et son absence
de consentement Pulse. Il ne touche ni l'API ni les données. Vérifier login,
CRM, reporting et santé API après un éventuel retour. Aucun rollback exécuté
pendant la préparation. Ne pas restaurer de base ni toucher aux gardes VPS.

## Suite dépendant du compte ChatGPT

URL MCP : `https://api.crm.o7digitalgroup.com/api/mcp`.
OAuth actuel : client public préenregistré `pulse-chatgpt`, PKCE S256, sans secret.
Scopes : `pulse:read pulse:write offline_access`.

L'allowlist ne sera complétée qu'avec la callback exacte affichée dans la gestion
du serveur MCP ChatGPT. En cas de refus, relever le message exact et vérifier
le mode client exigé ; ne pas inventer d'URI ni de secret.

Après configuration : commencer avec **PULSE CONNECT TEST 20261024**, confirmer
identité, espace et fuseau depuis `pulse_context`, puis utiliser le pipeline
**ChatGPT isolated sales**, étape **Nuevo — test**. Préparer un prospect TEST
à email unique `@example.test`, une opportunité de 100 MXN et une relance avec
date/heure future confirmée par l'utilisateur. Employer l'outil atomique
`pulse_create_prospect_opportunity_followup`, garder son `operationId` UUID et
les trois IDs sauvegardés. Rejouer exactement le même appel : mêmes IDs,
`replayed=true`, aucun enregistrement supplémentaire. Vérifier les fiches dans
Pulse, puis révoquer et constater le refus de l'ancien accès depuis ChatGPT.

Le compte et le mot de passe de test restent dans le fichier privé existant du
Bureau, jamais dans Git. Aucun enregistrement de démonstration dans un espace
métier. Le parcours d'Eduardo se fera ensuite avec ses propres identifiants et
consentement. **Aucun succès de connexion ChatGPT n'est déclaré à ce stade.**
