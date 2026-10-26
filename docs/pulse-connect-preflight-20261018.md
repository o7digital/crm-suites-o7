# Précontrôle du déploiement Pulse Connect — 18 octobre 2026

> Suite autorisée le 23 octobre : livraison réalisée avec la variante `dc85052`. Voir [le rapport de production](pulse-connect-production-20261023.md). Les réserves d'autorisation de ce précontrôle sont historiques ; le test ChatGPT reste à terminer après réception de sa callback exacte.

## Conclusion

Le SHA initialement approuvé est `28a9151a770fe52d2a0ee922e0c17a00c69aa6b3`. Il ne doit pas être déployé tel quel : les deux composants de production ont reçu des correctifs plus récents. Une branche de livraison `release/pulse-connect-preserve-frontend` fusionne ce commit avec la production actuelle `6af760f1fa8447706303bf8b5af2175ae4946130` et conserve intégralement ces correctifs. Cette variante est préparée et testée ; sa bascule reste à confirmer, car son SHA diffère du SHA explicitement validé.

Le delta applicatif de la variante par rapport à `6af760f` est **strictement identique, octet pour octet**, au delta applicatif de `28a9151` par rapport à sa base `ba2b158`. Comparaison réalisée avec `git diff --binary ... -- api frontend` ; SHA-256 commun : `c6c76131c729bc16c3e0294423108415928b4e01b4dc816999f5928a384bea0d`. Aucun comportement Pulse Connect n'est ajouté ou modifié dans la variante.

Les procédures et états de production des documents précédents décrivent l'audit initial. Ce précontrôle remplace leur hypothèse « production = ba2b158 » ; ne pas utiliser ce SHA comme rollback de la nouvelle intervention.

## Hébergement et changements détectés

- Au début de ce précontrôle : API VPS sur `ba2b1584d625a89974ff0c8f8f3f04ea15138c8b`, checkout propre ; image disponible `sha256:6480847272a253a47f561627881557fbd61a3a21eef591ba642bdb9934372730`.
- Le frontend Vercel actif à ce moment était `dpl_JD2hhDxCVvY6dk6vZgFgg2wwhyD2`, alias `https://crm.o7digitalgroup.com`, dont les sources correspondent à `090273754e0de085e8db1b7a540fc4a2d2a36507`. Les métadonnées Git étaient absentes ; les empreintes SHA-1 des sources Vercel ont été comparées à l'intégralité des fichiers frontend suivis et à vercel.json : 139 fichiers identiques, aucun fichier applicatif différent. Le .gitignore n'est normalement pas envoyé.
- Pendant le contrôle, une intervention concurrente a livré l'API `6af760f1fa8447706303bf8b5af2175ae4946130`. La garde de sauvegarde a arrêté sa première tentative avant écriture en détectant ce changement.
- Le frontend a également changé : déploiement actif `dpl_Gx7Bnh6gFRgUNqDVxE6QrQe36Z3k`, URL `https://crm-suites-o7-pt2kinqcg-olivier-steineur.vercel.app`, mêmes alias habituels. Ses sources frontend correspondent à `6af760f` : 141 fichiers identiques, aucun différent.
- Les changements à conserver couvrent la probabilité manuelle, la prévision pondérée, la devise mémorisée, les conflits de closing et la suppression des workflows/historiques transférés. Les fichiers métier correspondants ne diffèrent pas entre la variante et la production actuelle.
- PostgreSQL reste le service privé `postgres`, base `pulsecrm_prod_20260928_final`, sur le VPS. Aucun secret n'a été affiché.

## Sauvegarde et rollback

Une sauvegarde de la version actuelle a ensuite été créée, sans rétention ni suppression d'anciens backups :

- Archive : `/opt/o7/backups/o7-crm/pulse-connect-preflight-20261018T172511Z.dump`.
- Taille : 189658 octets ; archive privée.
- SHA-256 : `b6fb4621944507033b6f2f754b84bc7211936dad0bc61eecdee75d0939a56800` ; fichier `.sha256` adjacent.
- Vérifications : `pg_restore --list`, puis lecture/décompression complète avec `pg_restore --file=/dev/null`, sans restauration ni écriture en base.
- Image de rollback actuelle : `o7-crm-api:6af760f1fa8447706303bf8b5af2175ae4946130`, présente et vérifiée ; ID `sha256:1e52aff0aabda571a7812309fa1aee8e43921b35cd69b1fc283186bbcd8a6a3b`.
- Rollback frontend : conserver le déploiement Vercel `dpl_Gx7Bnh6gFRgUNqDVxE6QrQe36Z3k` et ses alias.

Avant la prochaine bascule, recontrôler ces identités pour détecter un nouveau déploiement concurrent. Le SHA de production `6af760f` remplace `ba2b158` dans les garde-fous et dans le choix de rollback ; le lot SQL reste uniquement 0042.

## Tests de la variante

- Build API : réussi.
- Tests unitaires API : 23 suites, **103 tests réussis**, incluant le correctif actuel de suppression des workflows.
- Intégration PostgreSQL locale jetable : **14 scénarios réussis** (OAuth, MCP, droits, écritures réelles, retry, atomicité, révocation).
- Build frontend Next : réussi.
- Chrome : 4 tests de probabilité/prévision/devise, 2 tests de suppression des workflows et 1 parcours Pulse Connect complet réussis.
- Suite frontend Phase 1 générale : 18/20 réussis. Deux tests historiques appellent `.fill()` sur `recurrence-months`, devenu un élément `<select>` dans le code existant ; ils échouent au sélecteur de test avant l'envoi métier. Aucun changement n'a été apporté à ces tests ou au comportement des packages mensuels dans ce chantier. Les scénarios de closing actualisés passent.

Le parcours navigateur utilise le vrai backend du connecteur approuvé dans une base locale isolée ; le code MCP/OAuth est inchangé dans la variante. Le backend de la variante est également vérifié par les 103 unitaires et les 14 intégrations PostgreSQL. Aucun test n'a écrit dans Zevi Capital ni dans la base de production.

## État actuel après précontrôle

- Aucune migration ni bascule Pulse Connect exécutée.
- Vérification SQL en production : les cinq tables Pulse Connect sont absentes ; aucune entrée 0042 dans le registre.
- HTTP : frontend CRM 200, santé API 200, `/api/mcp` 404.
- Aucun réglage OAuth/activation/callback ajouté à la production.
- Mailcow, DNS et dispositif de secours inchangés.
- Les écritures/révocations dans un espace de test de production et le test depuis ChatGPT restent à exécuter après déploiement de la variante validée. Les tests backend locaux ne sont pas présentés comme un test de l'hôte ChatGPT.

## Callback ChatGPT après livraison

Après déploiement approuvé, si la création du serveur ChatGPT exige la discovery, utiliser `PULSE_CONNECT_ENABLED=true` avec `PULSE_CONNECT_REDIRECT_URIS` vide. La discovery et le challenge 401 seront disponibles, mais chaque demande d'autorisation sera refusée. Ne pas ajouter de callback supposée ou générique pour contourner cette étape.

Dans ChatGPT web : Plugins → + → Add custom MCP server ; nom Pulse CRM ; URL `https://api.crm.o7digitalgroup.com/api/mcp` ; OAuth ; client public prédéfini `pulse-chatgpt`, sans secret, PKCE S256. Dans la gestion/détails de ce serveur, copier l'URI exacte « Redirect URI / Callback URL » affichée par ChatGPT et la transmettre pour l'allowlist. L'interface effective et les autorisations de workspace peuvent varier ; si ces champs sont absents, relever ce blocage au lieu d'autoriser une autre URL.

Une fois cette URI configurée, Eduardo devra autoriser son propre compte Pulse, vérifier ZEVI CAPITAL et confirmer son fuseau. La connexion ne sera déclarée opérationnelle qu'après lecture, écriture confirmée et révocation depuis ChatGPT lui-même.
