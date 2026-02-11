# ANNEXE 2 - MESURES DE SECURITE (MODELE)

Date: {{security_annex_date}}

## 1. Gouvernance securite
- Politique securite documentee
- Revue periodique des droits d'acces
- Journalisation des actions administrateur

## 2. Controle d'acces
- Authentification forte recommandee (MFA)
- Separation des roles (OWNER / ADMIN / MEMBER)
- Principe du moindre privilege

## 3. Chiffrement
- Donnees en transit: TLS 1.2+ minimum
- Donnees au repos: chiffrement stockage fournisseur cloud (si disponible)
- Secrets stockes hors code source

## 4. Disponibilite et continuite
- Sauvegardes periodiques: {{backup_frequency}}
- Procedure de restauration testee: {{restore_test_frequency}}
- Monitoring applicatif et alerting

## 5. Securite applicative
- Validation des entrees
- Protection contre injections et controles d'acces server-side
- Processus de correction des vulnerabilites

## 6. Journalisation et tracabilite
- Logs d'acces et d'erreurs
- Horodatage des operations critiques
- Conservation des logs: {{log_retention_period}}

## 7. Gestion des incidents
- Detection, qualification, remediations
- Notification Client sans delai indu pour incidents impactant les donnees personnelles
- Post-mortem et plan d'actions correctives

## 8. Ressources humaines
- Engagement de confidentialite du personnel
- Sensibilisation securite periodique

## 9. Sous-traitants techniques
- Evaluation securite minimale
- Contrats et obligations de securite adaptes

## 10. Amelioration continue
- Revue annuelle des mesures
- Ajustement selon l'etat de l'art et le niveau de risque

---

Valeurs de reference:
- RPO cible: {{rpo_target}}
- RTO cible: {{rto_target}}
- Fenetre de maintenance: {{maintenance_window}}
