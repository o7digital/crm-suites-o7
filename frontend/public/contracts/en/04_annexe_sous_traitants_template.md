# ANNEX 3 - SUB-PROCESSOR LIST (TEMPLATE)

Date: {{subprocessor_annex_date}}

| Vendor | Service | Purpose | Main location | Transfer mechanism | DPA/URL | Status |
|---|---|---|---|---|---|---|
| Stripe, Inc. | Billing and payments | Subscription management | {{stripe_region}} | {{stripe_transfer_mechanism}} | https://stripe.com/legal/dpa | Active |
| Supabase | Auth / DB (if used) | User auth and database | {{supabase_region}} | {{supabase_transfer_mechanism}} | {{supabase_dpa_url}} | Active |
| Railway / Vercel / Hosting | Infrastructure hosting | App/API execution | {{hosting_region}} | {{hosting_transfer_mechanism}} | {{hosting_dpa_url}} | Active |
| o7 Mailcow (SMTP) | Transactional email | Invite and notification delivery | {{mailcow_region}} | {{mailcow_transfer_mechanism}} | {{mailcow_dpa_reference}} | Active |
| {{other_vendor_name}} | {{other_vendor_service}} | {{other_vendor_purpose}} | {{other_vendor_region}} | {{other_vendor_transfer}} | {{other_vendor_dpa_url}} | {{other_vendor_status}} |

Update process:
- Provider notifies Customer of material changes with notice period {{subprocessor_notice_period}}.

Objection process:
- Customer may submit a reasoned objection according to the main agreement.
