# Module Kabin

Appliquer `api/prisma/migrations/20260923_kabin/migration.sql` via le processus normal de migration avant le déploiement de l'API. Configurer `KABIN_TENANT_ID` avec l'UUID du tenant CRM de Kabin. Le catalogue public ne renvoie que ses véhicules `PUBLISHED`.

Routes CRM authentifiées (JWT et périmètre tenant) : `GET/POST /api/kabin/vehicles`, `PATCH /api/kabin/vehicles/:id`, `GET/POST /api/kabin/applications`, `PATCH /api/kabin/applications/:id/status`.

Route publique : `GET /api/kabin/catalogue`. Un véhicule comporte `brand`, `model`, `version`, `modelYear`, `armorLevel`, `description`, `specifications` (objet JSON), `imageUrl` (HTTPS), `priceMxn`, `featured`, `sortOrder`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`). Une mise à jour envoie tous les champs requis. Les images sont hébergées à part. Une demande comprend `name`, `email` et, au choix, `clientId`, `vehicleId`, `phone`, `company`, `message`, `amountMxn`, `downPercent`, `termMonths`, `annualRate`. Les liens vers clients et véhicules sont contrôlés dans le tenant.

Le site public lit le catalogue dès que `config.js` contient l'origine HTTPS de l'API CRM. Son formulaire Formspree reste en place : l'intégration automatique des prospects demandera une passerelle serveur, une protection contre le spam et un traitement explicite des données personnelles. Aucun dossier client n'est exposé sur la route publique.
