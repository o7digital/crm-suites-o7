'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Guard } from '../../../components/Guard';
import { useI18n } from '../../../contexts/I18nContext';

type TemplateCard = {
  title: string;
  description: string;
  href: string;
};

type ContractsUi = {
  heading: string;
  intro: string;
  hint: string;
  openLabel: string;
  downloadLabel: string;
  pdfLabel: string;
  variablesTitle: string;
  legalNote: string;
  printError: string;
  templates: TemplateCard[];
};

const UI_BY_LANGUAGE: Record<'fr' | 'en' | 'es', ContractsUi> = {
  fr: {
    heading: 'Contracts',
    intro: 'Pack contractuel pret a personnaliser pour vos abonnements clients (MSA + RGPD + securite).',
    hint: "Astuce: completez les variables {{...}} puis exportez en PDF.",
    openLabel: 'Ouvrir',
    downloadLabel: 'Telecharger',
    pdfLabel: 'Generate PDF',
    variablesTitle: 'Variables principales a renseigner',
    legalNote: 'Note: ces modeles sont operationnels mais doivent etre valides par votre conseil juridique avant signature.',
    printError: 'Impossible d ouvrir la fenetre PDF. Autorisez les popups puis reessayez.',
    templates: [
      {
        title: '01 - Contrat SaaS (MSA)',
        description: 'Contrat commercial principal: abonnement, responsabilite, resiliation, signatures.',
        href: '/contracts/fr/01_master_service_agreement_template.md',
      },
      {
        title: '02 - Annexe DPA / RGPD',
        description: 'Clauses de sous-traitance de donnees personnelles (art. 28 RGPD).',
        href: '/contracts/fr/02_dpa_rgpd_template.md',
      },
      {
        title: '03 - Annexe securite',
        description: 'Mesures techniques et organisationnelles (TOMs).',
        href: '/contracts/fr/03_annexe_securite_template.md',
      },
      {
        title: '04 - Annexe sous-traitants',
        description: 'Liste des sous-traitants ulterieurs (Stripe, hosting, Mailcow, etc.).',
        href: '/contracts/fr/04_annexe_sous_traitants_template.md',
      },
    ],
  },
  en: {
    heading: 'Contracts',
    intro: 'Contract pack ready to customize for your subscriptions (MSA + GDPR + security).',
    hint: 'Tip: fill {{...}} placeholders, then export to PDF.',
    openLabel: 'Open',
    downloadLabel: 'Download',
    pdfLabel: 'Generate PDF',
    variablesTitle: 'Main variables to fill',
    legalNote: 'Legal note: templates are operational but must be validated by legal counsel before signature.',
    printError: 'Unable to open PDF window. Enable popups and retry.',
    templates: [
      {
        title: '01 - SaaS Agreement (MSA)',
        description: 'Main commercial agreement: subscription, liability, termination, signatures.',
        href: '/contracts/en/01_master_service_agreement_template.md',
      },
      {
        title: '02 - DPA Annex (GDPR)',
        description: 'Data processing clauses (GDPR Article 28).',
        href: '/contracts/en/02_dpa_rgpd_template.md',
      },
      {
        title: '03 - Security Annex',
        description: 'Technical and organizational security measures (TOMs).',
        href: '/contracts/en/03_annexe_securite_template.md',
      },
      {
        title: '04 - Sub-processor Annex',
        description: 'List of subprocessors (Stripe, hosting, Mailcow, etc.).',
        href: '/contracts/en/04_annexe_sous_traitants_template.md',
      },
    ],
  },
  es: {
    heading: 'Contratos',
    intro: 'Pack contractual listo para personalizar en tus suscripciones (MSA + RGPD + seguridad).',
    hint: 'Tip: completa las variables {{...}} y luego exporta a PDF.',
    openLabel: 'Abrir',
    downloadLabel: 'Descargar',
    pdfLabel: 'Generate PDF',
    variablesTitle: 'Variables principales a completar',
    legalNote: 'Nota legal: estas plantillas deben ser validadas por asesoria legal antes de firma.',
    printError: 'No se pudo abrir la ventana PDF. Habilita popups y vuelve a intentar.',
    templates: [
      {
        title: '01 - Contrato SaaS (MSA)',
        description: 'Contrato principal: suscripcion, responsabilidad, terminacion y firmas.',
        href: '/contracts/es/01_master_service_agreement_template.md',
      },
      {
        title: '02 - Anexo DPA / RGPD',
        description: 'Clausulas de tratamiento de datos (art. 28 RGPD).',
        href: '/contracts/es/02_dpa_rgpd_template.md',
      },
      {
        title: '03 - Anexo de seguridad',
        description: 'Medidas tecnicas y organizativas de seguridad.',
        href: '/contracts/es/03_annexe_securite_template.md',
      },
      {
        title: '04 - Anexo de subencargados',
        description: 'Listado de subencargados (Stripe, hosting, Mailcow, etc.).',
        href: '/contracts/es/04_annexe_sous_traitants_template.md',
      },
    ],
  },
};

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export default function AdminContractsPage() {
  const { language } = useI18n();
  const [pdfBusyHref, setPdfBusyHref] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const ui = useMemo(() => UI_BY_LANGUAGE[language] || UI_BY_LANGUAGE.en, [language]);

  const generatePdf = async (template: TemplateCard) => {
    setPdfError(null);
    setPdfBusyHref(template.href);
    try {
      const res = await fetch(template.href, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Unable to load template (${res.status})`);
      const text = await res.text();

      const popup = window.open('', '_blank', 'noopener,noreferrer');
      if (!popup) {
        setPdfError(ui.printError);
        return;
      }

      popup.document.open();
      popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(template.title)}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin: 24px; color: #111827; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    pre { white-space: pre-wrap; font-size: 12px; line-height: 1.45; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(template.title)}</h1>
  <pre>${escapeHtml(text)}</pre>
</body>
</html>`);
      popup.document.close();
      popup.focus();
      setTimeout(() => {
        popup.print();
      }, 250);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF generation failed');
    } finally {
      setPdfBusyHref(null);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin</p>
          <h1 className="text-3xl font-semibold">{ui.heading}</h1>
        </div>

        <div className="card p-6 text-slate-300">
          <p className="text-sm text-slate-300">{ui.intro}</p>
          <p className="mt-2 text-xs text-slate-400">
            {ui.hint.split('{{...}}')[0]}
            <span className="font-mono">{'{{...}}'}</span>
            {ui.hint.split('{{...}}')[1] || ''}
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {ui.templates.map((tpl) => (
            <div key={tpl.href} className="card p-5">
              <p className="text-lg font-semibold text-slate-100">{tpl.title}</p>
              <p className="mt-2 text-sm text-slate-400">{tpl.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a className="btn-secondary text-sm" href={tpl.href} target="_blank" rel="noreferrer">
                  {ui.openLabel}
                </a>
                <a className="btn-primary text-sm" href={tpl.href} download>
                  {ui.downloadLabel}
                </a>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => void generatePdf(tpl)}
                  disabled={pdfBusyHref === tpl.href}
                >
                  {pdfBusyHref === tpl.href ? 'Generating...' : ui.pdfLabel}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card mt-6 p-5">
          <p className="text-sm font-semibold text-slate-100">{ui.variablesTitle}</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
            <p className="font-mono">{'{{customer_legal_name}}'}</p>
            <p className="font-mono">{'{{customer_contact_email}}'}</p>
            <p className="font-mono">{'{{plan_name}}'}</p>
            <p className="font-mono">{'{{subscription_price}}'}</p>
            <p className="font-mono">{'{{billing_cycle}}'}</p>
            <p className="font-mono">{'{{service_start_date}}'}</p>
            <p className="font-mono">{'{{governing_law}}'}</p>
            <p className="font-mono">{'{{jurisdiction}}'}</p>
          </div>
          <p className="mt-4 text-xs text-slate-500">{ui.legalNote}</p>
          {pdfError ? <p className="mt-3 text-xs text-amber-300">{pdfError}</p> : null}
        </div>
      </AppShell>
    </Guard>
  );
}
