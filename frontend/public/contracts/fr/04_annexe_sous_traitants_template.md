# ANNEXE 3 - LISTE DES SOUS-TRAITANTS ULTERIEURS (MODELE)

Date: {{subprocessor_annex_date}}

Le tableau ci-dessous recense les sous-traitants ulterieurs utilises pour le service.

| Fournisseur | Service | Finalite | Localisation principale | Mecanisme transfert | DPA/URL | Statut |
|---|---|---|---|---|---|---|
| Stripe, Inc. | Paiement / Billing | Gestion abonnements et paiements | {{stripe_region}} | {{stripe_transfer_mechanism}} | https://stripe.com/legal/dpa | Actif |
| Supabase | Authentification / DB (si utilise) | Comptes utilisateurs, base de donnees | {{supabase_region}} | {{supabase_transfer_mechanism}} | {{supabase_dpa_url}} | Actif |
| Railway / Vercel / Cloud provider | Hebergement app/API | Execution service SaaS | {{hosting_region}} | {{hosting_transfer_mechanism}} | {{hosting_dpa_url}} | Actif |
| o7 Mailcow (SMTP) | Email transactionnel | Envoi invites, notifications | {{mailcow_region}} | {{mailcow_transfer_mechanism}} | {{mailcow_dpa_reference}} | Actif |
| {{other_vendor_name}} | {{other_vendor_service}} | {{other_vendor_purpose}} | {{other_vendor_region}} | {{other_vendor_transfer}} | {{other_vendor_dpa_url}} | {{other_vendor_status}} |

## Procedure de mise a jour
Le Prestataire informe le Client de toute modification substantielle de cette liste avec un preavis raisonnable de {{subprocessor_notice_period}}.

## Opposition
Le Client peut notifier une opposition motivee a un nouveau sous-traitant dans le delai prevu au contrat principal.

---

Note: completer les zones {{...}} avant signature.
