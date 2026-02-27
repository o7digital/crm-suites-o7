'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiBaseForDisplay } from '@/lib/apiBase';
import { useIA, type LeadAnalysisResult } from '@/hooks/useIA';
import type { LanguageCode } from '@/i18n/types';
import {
  Alert,
  Box,
  Button,
  Card,
  Heading,
  Input,
  Separator,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';

type Pipeline = {
  id: string;
  name: string;
  isDefault?: boolean;
};

type Stage = {
  id: string;
  name: string;
  status: 'OPEN' | 'WON' | 'LOST';
  position: number;
  probability: number;
  pipelineId: string;
};

type Client = {
  id?: string;
  firstName?: string | null;
  name?: string | null;
  function?: string | null;
  companySector?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  address?: string | null;
  taxId?: string | null;
  notes?: string | null;
};

type Deal = {
  id: string;
  title: string;
  value: number | string;
  currency: string;
  expectedCloseDate?: string | null;
  stageId: string;
  pipelineId: string;
  client?: Client | null;
  stage?: {
    id: string;
    name: string;
    status: 'OPEN' | 'WON' | 'LOST';
    probability: number;
    position: number;
  };
};

type ContractClientFieldKey =
  | 'firstName'
  | 'name'
  | 'function'
  | 'companySector'
  | 'email'
  | 'phone'
  | 'company'
  | 'website'
  | 'address'
  | 'taxId'
  | 'notes';

type ContractFieldMapping = {
  placeholder: string;
  clientField: ContractClientFieldKey;
  label?: string;
};

type ContractSetup = {
  templateHref: string;
  fieldMappings: ContractFieldMapping[];
};

type IaPulseLocale = {
  subtitle: string;
  sourceCrm: string;
  pipeline: string;
  leadCrm: string;
  selectPipeline: string;
  selectLead: string;
  analyzeCrmLead: string;
  contractHeading: string;
  contractSubtitle: string;
  templateSetup: string;
  placeholdersMapped: string;
  missingContractSetup: string;
  openContractSetup: string;
  uploadContract: string;
  applyToCrmClient: string;
  file: string;
  orderManagement: string;
  orderManagementSubtitle: string;
  orders: string;
  payments: string;
  invoices: string;
  ordersDescription: string;
  paymentsDescription: string;
  invoicesDescription: string;
  additionalContextPlaceholder: string;
  leadNamePlaceholder: string;
  analyzeText: string;
  summarize: string;
  generateEmail: string;
  improveProposal: string;
  aiDiagnostics: string;
  clearAll: string;
  error: string;
  crmLeadAnalysis: string;
  score: string;
  winProbability: string;
  risk: string;
  nextBestActions: string;
  reasons: string;
  proposedActionPlan: string;
  recommendation: string;
  deal: string;
  stage: string;
  status: string;
  value: string;
  client: string;
  na: string;
  applyRecommendation: string;
  emailReadyToSend: string;
  subject: string;
  copyEmail: string;
  whatsappReadyToSend: string;
  copyWhatsapp: string;
  openWhatsapp: string;
  runtimeDiagnostics: string;
  sentimentAnalysis: string;
  summary: string;
  generatedEmail: string;
  improvedProposal: string;
  copiedToClipboard: string;
  unableToCopy: string;
  stageApplied: string;
  configureContractSetupFirst: string;
  warningNoValueExtracted: string;
  warningPlaceholderUnresolved: string;
  contractLoadedNoValues: string;
  contractParsedFields: string;
  clientFieldsUpdated: string;
  emailLabel: string;
  whatsappLabel: string;
  emailSubjectTemplate: string;
  emailGreeting: string;
  emailThanksTemplate: string;
  emailPlanIntro: string;
  emailPlanFallback: string;
  emailAvailability: string;
  emailRegards: string;
  whatsappGreeting: string;
  whatsappAfterDiscussionTemplate: string;
  whatsappSuggestTemplate: string;
  whatsappPlanFallback: string;
  whatsappClose: string;
  dueSlots: string[];
  defaultActionsByOutcome: Record<'KEEP' | 'WON' | 'LOST', string[]>;
  contractFieldLabels: Record<ContractClientFieldKey, string>;
};

const IA_PULSE_LOCALE: Record<LanguageCode, IaPulseLocale> = {
  en: {
    subtitle: 'Smart CRM lead analysis (score, risks, next-action and stage recommendations)',
    sourceCrm: 'Source CRM',
    pipeline: 'Pipeline',
    leadCrm: 'Lead CRM',
    selectPipeline: 'Select pipeline',
    selectLead: 'Select lead',
    analyzeCrmLead: 'Analyze CRM lead',
    contractHeading: 'Client contract (phase 1 to phase 2)',
    contractSubtitle: 'Phase 1: upload the completed client contract. Phase 2: client fields mapped in Admin appear automatically.',
    templateSetup: 'Template setup',
    placeholdersMapped: '{count} placeholders mapped in Admin.',
    missingContractSetup: 'Missing setup. Configure field mapping first in Admin -> Parameters -> Customers.',
    openContractSetup: 'Open contract setup',
    uploadContract: 'Upload contract',
    applyToCrmClient: 'Apply to CRM client',
    file: 'File',
    orderManagement: 'Order management',
    orderManagementSubtitle: 'Dedicated section for clients who want to manage orders, payments, and invoices in one place.',
    orders: 'ORDERS',
    payments: 'PAYMENTS',
    invoices: 'INVOICES',
    ordersDescription: 'Track order status, client confirmation, and delivery priorities.',
    paymentsDescription: 'Monitor received payments, due dates, and late-payment alerts for each client account.',
    invoicesDescription: 'Quick access to issued invoices, status tracking, and reminders preparation.',
    additionalContextPlaceholder: 'Additional context: latest exchanges, objections, call notes...',
    leadNamePlaceholder: 'Lead name (for emails)',
    analyzeText: 'Analyze text',
    summarize: 'Summarize',
    generateEmail: 'Generate email',
    improveProposal: 'Improve proposal',
    aiDiagnostics: 'AI diagnostics',
    clearAll: 'Clear all',
    error: 'Error',
    crmLeadAnalysis: 'CRM lead analysis',
    score: 'Score',
    winProbability: 'Win Probability',
    risk: 'Risk',
    nextBestActions: 'Next Best Actions',
    reasons: 'Reasons',
    proposedActionPlan: 'Proposed action plan',
    recommendation: 'Recommendation',
    deal: 'Deal',
    stage: 'Stage',
    status: 'Status',
    value: 'Value',
    client: 'Client',
    na: 'N/A',
    applyRecommendation: 'Apply recommendation',
    emailReadyToSend: 'Email ready to send',
    subject: 'Subject',
    copyEmail: 'Copy email',
    whatsappReadyToSend: 'WhatsApp ready to send',
    copyWhatsapp: 'Copy WhatsApp',
    openWhatsapp: 'Open WhatsApp',
    runtimeDiagnostics: 'Runtime diagnostics',
    sentimentAnalysis: 'Sentiment analysis',
    summary: 'Summary',
    generatedEmail: 'Generated email',
    improvedProposal: 'Improved proposal',
    copiedToClipboard: '{label} copied to clipboard.',
    unableToCopy: 'Unable to copy {label}.',
    stageApplied: 'Stage applied: {stage}',
    configureContractSetupFirst: 'Configure contract setup in Admin > Parameters > Customers first.',
    warningNoValueExtracted: 'No value extracted for {{placeholder}}',
    warningPlaceholderUnresolved: 'Placeholder {{placeholder}} appears unresolved in contract',
    contractLoadedNoValues: 'Contract loaded, but no mapped values were detected.',
    contractParsedFields: 'Contract parsed: {count} client fields extracted.',
    clientFieldsUpdated: 'Client fields updated from contract extraction.',
    emailLabel: 'Email',
    whatsappLabel: 'WhatsApp',
    emailSubjectTemplate: 'Follow-up {deal} - action plan',
    emailGreeting: 'Hello {name},',
    emailThanksTemplate: 'Thanks for our discussion regarding "{deal}".',
    emailPlanIntro: 'Here is the proposed action plan to move forward quickly:',
    emailPlanFallback: 'Validate next actions together',
    emailAvailability: 'Could you confirm your availability for a 15-minute check-in?',
    emailRegards: 'Best regards,',
    whatsappGreeting: 'Hello {name},',
    whatsappAfterDiscussionTemplate: 'following our discussion on "{deal}",',
    whatsappSuggestTemplate: 'I suggest: {plan}.',
    whatsappPlanFallback: 'validating next actions together',
    whatsappClose: 'Can we schedule 15 min this week?',
    dueSlots: ['Today', 'D+1', 'D+3', 'D+7'],
    defaultActionsByOutcome: {
      KEEP: [
        'Validate scope and priorities with the client',
        'Confirm budget, timeline, and decision makers',
        'Schedule a follow-up with a dated next action',
      ],
      WON: [
        'Confirm final agreement and launch onboarding',
        'Send project recap and kickoff timeline',
        'Plan kickoff with key stakeholders',
      ],
      LOST: [
        'Document loss reasons and key objections',
        'Propose an alternative or differentiated follow-up',
        'Schedule a win-back follow-up at a fixed date',
      ],
    },
    contractFieldLabels: {
      firstName: 'First name',
      name: 'Last name',
      function: 'Role',
      companySector: 'Industry',
      email: 'Email',
      phone: 'Phone',
      company: 'Company',
      website: 'Website',
      address: 'Address',
      taxId: 'Tax ID / RFC',
      notes: 'Notes',
    },
  },
  fr: {
    subtitle: 'Analyse intelligente des leads CRM (score, risques, recommandations de next action et d etape)',
    sourceCrm: 'Source CRM',
    pipeline: 'Pipeline',
    leadCrm: 'Lead CRM',
    selectPipeline: 'Selectionner pipeline',
    selectLead: 'Selectionner lead',
    analyzeCrmLead: 'Analyser lead CRM',
    contractHeading: 'Contrat client (phase 1 vers phase 2)',
    contractSubtitle: 'Phase 1: chargez le contrat client rempli. Phase 2: les champs client mappes en Admin apparaissent automatiquement.',
    templateSetup: 'Template setup',
    placeholdersMapped: '{count} placeholders mapped in Admin.',
    missingContractSetup: 'Setup manquant. Configurez d abord le mapping dans Admin -> Parameters -> Customers.',
    openContractSetup: 'Ouvrir setup contrat',
    uploadContract: 'Charger contrat',
    applyToCrmClient: 'Appliquer au client CRM',
    file: 'Fichier',
    orderManagement: 'Gestion de pedidos',
    orderManagementSubtitle: 'Section dediee aux clients qui veulent administrer leurs pedidos, pagos et facturas depuis un seul espace.',
    orders: 'PEDIDOS',
    payments: 'PAGOS',
    invoices: 'FACTURAS',
    ordersDescription: 'Suivi du statut de commande, confirmation client et priorisation des livraisons.',
    paymentsDescription: 'Controle des paiements recus, echeances et alertes de retard pour chaque compte client.',
    invoicesDescription: 'Acces rapide aux factures emises, suivi des statuts et preparation des relances.',
    additionalContextPlaceholder: 'Contexte additionnel: derniers echanges, objections, notes call...',
    leadNamePlaceholder: 'Nom du lead (pour les emails)',
    analyzeText: 'Analyser texte',
    summarize: 'Resumer',
    generateEmail: 'Generer email',
    improveProposal: 'Ameliorer devis',
    aiDiagnostics: 'Diagnostic IA',
    clearAll: 'Effacer tout',
    error: 'Erreur',
    crmLeadAnalysis: 'Analyse lead CRM',
    score: 'Score',
    winProbability: 'Win Probability',
    risk: 'Risk',
    nextBestActions: 'Next Best Actions',
    reasons: 'Raisons',
    proposedActionPlan: 'Plan d action propose',
    recommendation: 'Recommendation',
    deal: 'Deal',
    stage: 'Stage',
    status: 'Status',
    value: 'Value',
    client: 'Client',
    na: 'N/A',
    applyRecommendation: 'Appliquer recommandation',
    emailReadyToSend: 'Email pret a envoyer',
    subject: 'Objet',
    copyEmail: 'Copier email',
    whatsappReadyToSend: 'WhatsApp pret a envoyer',
    copyWhatsapp: 'Copier WhatsApp',
    openWhatsapp: 'Ouvrir WhatsApp',
    runtimeDiagnostics: 'Diagnostic runtime',
    sentimentAnalysis: 'Analyse de sentiment',
    summary: 'Resume',
    generatedEmail: 'Email genere',
    improvedProposal: 'Proposition amelioree',
    copiedToClipboard: '{label} copie dans le presse-papiers.',
    unableToCopy: 'Impossible de copier {label}.',
    stageApplied: 'Etape appliquee: {stage}',
    configureContractSetupFirst: 'Configure contract setup in Admin > Parameters > Customers first.',
    warningNoValueExtracted: 'No value extracted for {{placeholder}}',
    warningPlaceholderUnresolved: 'Placeholder {{placeholder}} appears unresolved in contract',
    contractLoadedNoValues: 'Contract loaded, but no mapped values were detected.',
    contractParsedFields: 'Contract parsed: {count} client fields extracted.',
    clientFieldsUpdated: 'Client fields updated from contract extraction.',
    emailLabel: 'Email',
    whatsappLabel: 'WhatsApp',
    emailSubjectTemplate: 'Suivi {deal} - plan d action',
    emailGreeting: 'Bonjour {name},',
    emailThanksTemplate: 'Merci pour notre echange concernant "{deal}".',
    emailPlanIntro: 'Voici le plan d action propose pour avancer rapidement :',
    emailPlanFallback: 'Valider les prochaines actions ensemble',
    emailAvailability: 'Pouvez-vous me confirmer vos disponibilites pour un point de 15 minutes ?',
    emailRegards: 'Bien a vous,',
    whatsappGreeting: 'Bonjour {name},',
    whatsappAfterDiscussionTemplate: 'suite a notre echange sur "{deal}",',
    whatsappSuggestTemplate: 'je propose: {plan}.',
    whatsappPlanFallback: 'valider les prochaines actions ensemble',
    whatsappClose: 'On peut se caller 15 min cette semaine ?',
    dueSlots: ['Aujourd hui', 'J+1', 'J+3', 'J+7'],
    defaultActionsByOutcome: {
      KEEP: [
        'Valider le perimetre et les priorites avec le client',
        'Confirmer budget, delai et interlocuteurs decisionnaires',
        'Programmer un point de suivi avec prochaine action datee',
      ],
      WON: [
        'Confirmer accord final et lancer onboarding',
        'Envoyer recap projet et planning de demarrage',
        'Planifier kick-off avec les parties prenantes',
      ],
      LOST: [
        'Documenter la raison de perte et les objections cles',
        'Proposer une alternative ou une relance differenciee',
        'Programmer une relance de reconquete a date fixe',
      ],
    },
    contractFieldLabels: {
      firstName: 'Prenom',
      name: 'Nom',
      function: 'Fonction',
      companySector: 'Secteur',
      email: 'Email',
      phone: 'Telephone',
      company: 'Entreprise',
      website: 'Site web',
      address: 'Adresse',
      taxId: 'Tax ID / RFC',
      notes: 'Notes',
    },
  },
  es: {
    subtitle: 'Analisis inteligente de leads CRM (score, riesgos, recomendaciones de siguiente accion y etapa)',
    sourceCrm: 'Origen CRM',
    pipeline: 'Pipeline',
    leadCrm: 'Lead CRM',
    selectPipeline: 'Seleccionar pipeline',
    selectLead: 'Seleccionar lead',
    analyzeCrmLead: 'Analizar lead CRM',
    contractHeading: 'Contrato cliente (fase 1 hacia fase 2)',
    contractSubtitle: 'Fase 1: carga el contrato cliente completado. Fase 2: los campos cliente mapeados en Admin aparecen automaticamente.',
    templateSetup: 'Configuracion de plantilla',
    placeholdersMapped: '{count} placeholders mapeados en Admin.',
    missingContractSetup: 'Falta setup. Configura primero el mapping en Admin -> Parameters -> Customers.',
    openContractSetup: 'Abrir setup contrato',
    uploadContract: 'Cargar contrato',
    applyToCrmClient: 'Aplicar al cliente CRM',
    file: 'Archivo',
    orderManagement: 'Gestion de pedidos',
    orderManagementSubtitle: 'Seccion dedicada a clientes que quieren administrar pedidos, pagos y facturas desde un solo espacio.',
    orders: 'PEDIDOS',
    payments: 'PAGOS',
    invoices: 'FACTURAS',
    ordersDescription: 'Seguimiento del estado del pedido, confirmacion del cliente y priorizacion de entregas.',
    paymentsDescription: 'Control de pagos recibidos, vencimientos y alertas de retraso por cuenta cliente.',
    invoicesDescription: 'Acceso rapido a facturas emitidas, seguimiento de estados y preparacion de recordatorios.',
    additionalContextPlaceholder: 'Contexto adicional: ultimos intercambios, objeciones, notas de llamada...',
    leadNamePlaceholder: 'Nombre del lead (para emails)',
    analyzeText: 'Analizar texto',
    summarize: 'Resumir',
    generateEmail: 'Generar email',
    improveProposal: 'Mejorar propuesta',
    aiDiagnostics: 'Diagnostico IA',
    clearAll: 'Limpiar todo',
    error: 'Error',
    crmLeadAnalysis: 'Analisis lead CRM',
    score: 'Puntuacion',
    winProbability: 'Probabilidad de cierre',
    risk: 'Riesgo',
    nextBestActions: 'Siguientes mejores acciones',
    reasons: 'Razones',
    proposedActionPlan: 'Plan de accion propuesto',
    recommendation: 'Recomendacion',
    deal: 'Deal',
    stage: 'Etapa',
    status: 'Estado',
    value: 'Valor',
    client: 'Cliente',
    na: 'N/D',
    applyRecommendation: 'Aplicar recomendacion',
    emailReadyToSend: 'Email listo para enviar',
    subject: 'Asunto',
    copyEmail: 'Copiar email',
    whatsappReadyToSend: 'WhatsApp listo para enviar',
    copyWhatsapp: 'Copiar WhatsApp',
    openWhatsapp: 'Abrir WhatsApp',
    runtimeDiagnostics: 'Diagnostico runtime',
    sentimentAnalysis: 'Analisis de sentimiento',
    summary: 'Resumen',
    generatedEmail: 'Email generado',
    improvedProposal: 'Propuesta mejorada',
    copiedToClipboard: '{label} copiado al portapapeles.',
    unableToCopy: 'No se pudo copiar {label}.',
    stageApplied: 'Etapa aplicada: {stage}',
    configureContractSetupFirst: 'Configura primero el setup de contrato en Admin > Parameters > Customers.',
    warningNoValueExtracted: 'No se extrajo valor para {{placeholder}}',
    warningPlaceholderUnresolved: 'El placeholder {{placeholder}} parece no resuelto en el contrato',
    contractLoadedNoValues: 'Contrato cargado, pero no se detectaron valores mapeados.',
    contractParsedFields: 'Contrato analizado: {count} campos cliente extraidos.',
    clientFieldsUpdated: 'Campos cliente actualizados desde la extraccion del contrato.',
    emailLabel: 'Email',
    whatsappLabel: 'WhatsApp',
    emailSubjectTemplate: 'Seguimiento {deal} - plan de accion',
    emailGreeting: 'Hola {name},',
    emailThanksTemplate: 'Gracias por nuestra conversacion sobre "{deal}".',
    emailPlanIntro: 'Aqui tienes el plan de accion propuesto para avanzar rapido:',
    emailPlanFallback: 'Validar siguientes acciones juntos',
    emailAvailability: 'Puedes confirmar disponibilidad para un punto de 15 minutos?',
    emailRegards: 'Saludos,',
    whatsappGreeting: 'Hola {name},',
    whatsappAfterDiscussionTemplate: 'despues de nuestra conversacion sobre "{deal}",',
    whatsappSuggestTemplate: 'propongo: {plan}.',
    whatsappPlanFallback: 'validar siguientes acciones juntos',
    whatsappClose: 'Podemos agendar 15 min esta semana?',
    dueSlots: ['Hoy', 'D+1', 'D+3', 'D+7'],
    defaultActionsByOutcome: {
      KEEP: [
        'Validar alcance y prioridades con el cliente',
        'Confirmar presupuesto, plazos y decisores',
        'Programar seguimiento con proxima accion fechada',
      ],
      WON: [
        'Confirmar acuerdo final e iniciar onboarding',
        'Enviar resumen del proyecto y calendario de arranque',
        'Planificar kick-off con las partes clave',
      ],
      LOST: [
        'Documentar razones de perdida y objeciones clave',
        'Proponer alternativa o relanzamiento diferenciado',
        'Programar seguimiento de reconquista con fecha fija',
      ],
    },
    contractFieldLabels: {
      firstName: 'Nombre',
      name: 'Apellido',
      function: 'Cargo',
      companySector: 'Sector',
      email: 'Email',
      phone: 'Telefono',
      company: 'Empresa',
      website: 'Sitio web',
      address: 'Direccion',
      taxId: 'Tax ID / RFC',
      notes: 'Notas',
    },
  },
};

function getClientLabel(client?: Client | null): string {
  if (!client) return '';
  const parts = [client.firstName, client.name]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const fullName = parts.join(' ').trim();
  if (fullName) return fullName;
  return String(client.name || '').trim();
}

function templateText(raw: string, params?: Record<string, string | number>): string {
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function toErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function normalizeContactName(raw: string): string {
  const value = raw.trim();
  if (!value) return 'client';
  return value;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForTemplateMatch(input: string): string {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractContractValuesFromTemplate(
  templateText: string,
  contractText: string,
  placeholders: string[],
): Record<string, string> {
  const uniquePlaceholders = Array.from(
    new Set(
      placeholders
        .map((entry) => String(entry || '').trim())
        .filter((entry) => /^[a-zA-Z0-9_]{1,80}$/.test(entry)),
    ),
  );
  if (uniquePlaceholders.length === 0) return {};

  let normalizedTemplate = normalizeForTemplateMatch(templateText);
  for (let i = 0; i < uniquePlaceholders.length; i++) {
    const placeholder = uniquePlaceholders[i];
    const tokenRegex = new RegExp(`\\{\\{\\s*${escapeRegex(placeholder)}\\s*\\}\\}`, 'g');
    normalizedTemplate = normalizedTemplate.replace(tokenRegex, `__PH_${i}__`);
  }

  let pattern = escapeRegex(normalizedTemplate).replace(/\s+/g, '\\s+');
  for (let i = 0; i < uniquePlaceholders.length; i++) {
    pattern = pattern.replace(escapeRegex(`__PH_${i}__`), '([\\s\\S]*?)');
  }

  const contractNormalized = normalizeForTemplateMatch(contractText);
  const matcher = new RegExp(`^${pattern}$`);
  const match = contractNormalized.match(matcher);
  if (!match) return {};

  const output: Record<string, string> = {};
  for (let i = 0; i < uniquePlaceholders.length; i++) {
    const value = String(match[i + 1] || '').trim();
    if (!value) continue;
    output[uniquePlaceholders[i]] = value;
  }
  return output;
}

function buildCrmActionPlan(analysis: LeadAnalysisResult, locale: IaPulseLocale): string[] {
  const baseActions = analysis.analysis.nextBestActions
    .map((item) => item.trim())
    .filter(Boolean);
  const uniqueActions = Array.from(new Set(baseActions));

  const actions =
    uniqueActions.length > 0
      ? uniqueActions
      : locale.defaultActionsByOutcome[analysis.analysis.recommendedOutcome];

  return actions.slice(0, 4).map((action, index) => {
    const due = locale.dueSlots[index] || `D+${index * 2 + 1}`;
    return `${index + 1}. [${due}] ${action}`;
  });
}

function buildCrmEmailDraft(
  analysis: LeadAnalysisResult,
  contactName: string,
  actionPlan: string[],
  locale: IaPulseLocale,
): { subject: string; body: string } {
  const compactPlan = actionPlan
    .slice(0, 3)
    .map((line) => `- ${line.replace(/^\d+\.\s*/, '')}`)
    .join('\n');

  return {
    subject: templateText(locale.emailSubjectTemplate, { deal: analysis.lead.dealTitle }),
    body: [
      templateText(locale.emailGreeting, { name: contactName }),
      '',
      templateText(locale.emailThanksTemplate, { deal: analysis.lead.dealTitle }),
      locale.emailPlanIntro,
      compactPlan || `- ${locale.emailPlanFallback}`,
      '',
      locale.emailAvailability,
      '',
      locale.emailRegards,
    ].join('\n'),
  };
}

function buildCrmWhatsappDraft(
  analysis: LeadAnalysisResult,
  contactName: string,
  actionPlan: string[],
  locale: IaPulseLocale,
): string {
  const compactPlan = actionPlan
    .slice(0, 2)
    .map((line) => line.replace(/^\d+\.\s*/, ''))
    .join(' | ');

  return [
    templateText(locale.whatsappGreeting, { name: contactName }),
    templateText(locale.whatsappAfterDiscussionTemplate, { deal: analysis.lead.dealTitle }),
    templateText(locale.whatsappSuggestTemplate, { plan: compactPlan || locale.whatsappPlanFallback }),
    locale.whatsappClose,
  ].join(' ');
}

function IaPulsePageContent() {
  const searchParams = useSearchParams();
  const prefilledDealId = searchParams.get('dealId') || '';
  const { token } = useAuth();
  const { language } = useI18n();
  const api = useApi(token);
  const locale = useMemo(() => IA_PULSE_LOCALE[language] || IA_PULSE_LOCALE.en, [language]);

  const [text, setText] = useState('');
  const [leadName, setLeadName] = useState('');
  const iaUiBuild = 'ia-ui-crm-lead-analysis-v1';
  const apiTarget = apiBaseForDisplay();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealId, setDealId] = useState('');
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [errorCrm, setErrorCrm] = useState<string | null>(null);
  const [applyInfo, setApplyInfo] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<string | null>(null);
  const [applyingRecommendation, setApplyingRecommendation] = useState(false);
  const [contractSetup, setContractSetup] = useState<ContractSetup | null>(null);
  const [contractTemplateCache, setContractTemplateCache] = useState<Record<string, string>>({});
  const [contractFileName, setContractFileName] = useState('');
  const [contractExtraction, setContractExtraction] = useState<Partial<Record<ContractClientFieldKey, string>>>({});
  const [contractWarnings, setContractWarnings] = useState<string[]>([]);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractInfo, setContractInfo] = useState<string | null>(null);
  const [loadingContractExtraction, setLoadingContractExtraction] = useState(false);
  const [applyingContractFields, setApplyingContractFields] = useState(false);
  const contractInputRef = useRef<HTMLInputElement | null>(null);

  const {
    analyzeLead,
    analyzeCrmLead,
    summarize,
    generateEmail,
    improveProposal,
    fetchDiagnostics,
    reset,
    sentiment,
    summary,
    draftEmail,
    improvedProposal,
    leadAnalysis,
    loadingSentiment,
    loadingSummary,
    loadingEmail,
    loadingImprove,
    loadingLeadAnalysis,
    errorSentiment,
    errorSummary,
    errorEmail,
    errorImprove,
    errorLeadAnalysis,
    diagnostics,
    loadingDiagnostics,
    errorDiagnostics,
  } = useIA();

  useEffect(() => {
    if (!token) return;
    void fetchDiagnostics().catch(() => undefined);
  }, [fetchDiagnostics, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api<{ settings?: { contractSetup?: ContractSetup | null } }>('/tenant/settings', { method: 'GET' })
      .then((data) => {
        if (!active) return;
        const setup = data.settings?.contractSetup || null;
        if (!setup?.templateHref || !Array.isArray(setup.fieldMappings)) {
          setContractSetup(null);
          return;
        }
        setContractSetup({
          templateHref: setup.templateHref,
          fieldMappings: setup.fieldMappings
            .filter((entry) => entry && entry.placeholder && entry.clientField)
            .map((entry) => ({
              placeholder: String(entry.placeholder),
              clientField: entry.clientField,
              ...(entry.label ? { label: String(entry.label) } : {}),
            })),
        });
      })
      .catch(() => {
        if (!active) return;
        setContractSetup(null);
      });
    return () => {
      active = false;
    };
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setErrorCrm(null);

    api<Pipeline[]>('/pipelines')
      .then((raw) => {
        if (!active) return;
        let filtered = raw.filter((p) => p.name !== 'B2C');
        if (filtered.length === 0) filtered = raw;
        setPipelines(filtered);
        setPipelineId((prev) => {
          if (prev && filtered.some((p) => p.id === prev)) return prev;
          const fallback = filtered.find((p) => p.name === 'New Sales') || filtered.find((p) => p.isDefault) || filtered[0];
          return fallback?.id || '';
        });
      })
      .catch((err) => {
        if (!active) return;
        setErrorCrm(toErrorMessage(err));
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    if (!prefilledDealId) return;
    let active = true;

    api<Deal>(`/deals/${prefilledDealId}`)
      .then((deal) => {
        if (!active) return;
        setPipelineId(deal.pipelineId);
        setDealId(deal.id);
        setLeadName((prev) => (prev.trim() ? prev : deal.title || ''));
      })
      .catch(() => {
        // Ignore invalid/missing deal ids in URL.
      });

    return () => {
      active = false;
    };
  }, [api, prefilledDealId, token]);

  const loadPipelineContext = useCallback(
    async (targetPipelineId: string, preferredDealId?: string) => {
      if (!targetPipelineId) {
        setStages([]);
        setDeals([]);
        setDealId('');
        return;
      }

      setLoadingCrm(true);
      setErrorCrm(null);
      try {
        const [pipelineStages, pipelineDeals] = await Promise.all([
          api<Stage[]>(`/stages?pipelineId=${targetPipelineId}`),
          api<Deal[]>(`/deals?pipelineId=${targetPipelineId}`),
        ]);

        setStages(pipelineStages);
        setDeals(pipelineDeals);
        setDealId((prev) => {
          if (preferredDealId && pipelineDeals.some((d) => d.id === preferredDealId)) return preferredDealId;
          if (prev && pipelineDeals.some((d) => d.id === prev)) return prev;
          return pipelineDeals[0]?.id || '';
        });
      } catch (err) {
        setErrorCrm(toErrorMessage(err));
        setStages([]);
        setDeals([]);
      } finally {
        setLoadingCrm(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!token || !pipelineId) return;
    void loadPipelineContext(pipelineId, prefilledDealId || undefined);
  }, [loadPipelineContext, pipelineId, prefilledDealId, token]);

  const canUseText = useMemo(() => text.trim().length > 0, [text]);
  const canGenerateEmail = useMemo(
    () => canUseText && leadName.trim().length > 0,
    [canUseText, leadName],
  );

  const stageById = useMemo(() => {
    const map: Record<string, Stage> = {};
    for (const stage of stages) map[stage.id] = stage;
    return map;
  }, [stages]);

  const selectedDeal = useMemo(() => deals.find((deal) => deal.id === dealId) || null, [dealId, deals]);
  const selectedDealStage =
    (selectedDeal ? stageById[selectedDeal.stageId] : null) ||
    (selectedDeal?.stage
      ? {
          id: selectedDeal.stage.id,
          name: selectedDeal.stage.name,
          status: selectedDeal.stage.status,
          probability: selectedDeal.stage.probability,
          position: selectedDeal.stage.position,
          pipelineId: selectedDeal.pipelineId,
        }
      : null);

  const crmActionPlan = useMemo(
    () => (leadAnalysis ? buildCrmActionPlan(leadAnalysis, locale) : []),
    [leadAnalysis, locale],
  );

  const crmContactName = useMemo(() => {
    if (!leadAnalysis) return normalizeContactName(leadName);
    return normalizeContactName(leadName || leadAnalysis.lead.clientName || leadAnalysis.lead.dealTitle || 'client');
  }, [leadAnalysis, leadName]);

  const crmEmailDraft = useMemo(
    () => (leadAnalysis ? buildCrmEmailDraft(leadAnalysis, crmContactName, crmActionPlan, locale) : null),
    [crmActionPlan, crmContactName, leadAnalysis, locale],
  );

  const crmWhatsappDraft = useMemo(
    () => (leadAnalysis ? buildCrmWhatsappDraft(leadAnalysis, crmContactName, crmActionPlan, locale) : ''),
    [crmActionPlan, crmContactName, leadAnalysis, locale],
  );

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setShareInfo(templateText(locale.copiedToClipboard, { label }));
    } catch {
      setShareInfo(templateText(locale.unableToCopy, { label: label.toLowerCase() }));
    }
  }, [locale.copiedToClipboard, locale.unableToCopy]);

  const openWhatsApp = useCallback(() => {
    if (!crmWhatsappDraft.trim()) return;
    const url = `https://wa.me/?text=${encodeURIComponent(crmWhatsappDraft)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [crmWhatsappDraft]);

  const clearAll = () => {
    setText('');
    setLeadName('');
    setApplyInfo(null);
    setApplyError(null);
    setShareInfo(null);
    setContractError(null);
    setContractInfo(null);
    setContractWarnings([]);
    setContractExtraction({});
    setContractFileName('');
    reset();
  };

  const errors = useMemo(
    () =>
      [errorSentiment, errorSummary, errorEmail, errorImprove, errorLeadAnalysis].filter(
        (x): x is string => Boolean(x),
      ),
    [errorEmail, errorImprove, errorLeadAnalysis, errorSentiment, errorSummary],
  );

  const canAnalyzeCrmLead = Boolean(dealId) && !loadingLeadAnalysis;

  const handleAnalyzeSelectedLead = async () => {
    if (!dealId) return;
    setApplyInfo(null);
    setApplyError(null);
    setShareInfo(null);
    try {
      const result = await analyzeCrmLead(dealId, text.trim() || undefined);
      setLeadName((prev) => {
        if (prev.trim()) return prev;
        if (result.lead.clientName) return result.lead.clientName;
        return result.lead.dealTitle || '';
      });
    } catch {
      // Error is surfaced via hook state.
    }
  };

  const canApplyRecommendation = useMemo(() => {
    if (!leadAnalysis) return false;
    const stageId = leadAnalysis.analysis.recommendedStageId;
    if (!stageId) return false;
    return stageId !== leadAnalysis.lead.stageId;
  }, [leadAnalysis]);

  const applyRecommendedStage = async () => {
    if (!leadAnalysis?.analysis.recommendedStageId) return;
    setApplyingRecommendation(true);
    setApplyInfo(null);
    setApplyError(null);

    try {
      await api(`/deals/${leadAnalysis.lead.dealId}/move-stage`, {
        method: 'POST',
        body: JSON.stringify({ stageId: leadAnalysis.analysis.recommendedStageId }),
      });

      setApplyInfo(
        templateText(locale.stageApplied, {
          stage: leadAnalysis.analysis.recommendedStageName || leadAnalysis.analysis.recommendedStageId,
        }),
      );

      await loadPipelineContext(leadAnalysis.lead.pipelineId, leadAnalysis.lead.dealId);
      await analyzeCrmLead(leadAnalysis.lead.dealId, text.trim() || undefined);
    } catch (err) {
      setApplyError(toErrorMessage(err));
    } finally {
      setApplyingRecommendation(false);
    }
  };

  const selectedDealClientId = selectedDeal?.client?.id || '';
  const extractedFieldEntries = useMemo(
    () =>
      Object.entries(contractExtraction).filter(
        (entry): entry is [ContractClientFieldKey, string] => Boolean(entry[0] && String(entry[1] || '').trim()),
      ),
    [contractExtraction],
  );

  const loadContractTemplate = useCallback(
    async (templateHref: string) => {
      const cached = contractTemplateCache[templateHref];
      if (cached) return cached;
      const res = await fetch(templateHref, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Unable to load template (${res.status})`);
      const textTemplate = await res.text();
      setContractTemplateCache((prev) => ({ ...prev, [templateHref]: textTemplate }));
      return textTemplate;
    },
    [contractTemplateCache],
  );

  const handleChooseContractFile = useCallback(() => {
    setContractError(null);
    setContractInfo(null);
    contractInputRef.current?.click();
  }, []);

  const handleContractFileSelected = useCallback(
    async (file: File) => {
      if (!contractSetup?.templateHref || contractSetup.fieldMappings.length === 0) {
        setContractError(locale.configureContractSetupFirst);
        return;
      }

      setLoadingContractExtraction(true);
      setContractError(null);
      setContractInfo(null);
      setContractWarnings([]);
      setContractFileName(file.name);
      try {
        const [contractText, templateContent] = await Promise.all([
          file.text(),
          loadContractTemplate(contractSetup.templateHref),
        ]);

        const placeholders = contractSetup.fieldMappings.map((item) => item.placeholder);
        const extractedByPlaceholder = extractContractValuesFromTemplate(templateContent, contractText, placeholders);
        const mappedFields: Partial<Record<ContractClientFieldKey, string>> = {};
        const warnings: string[] = [];

        for (const mapItem of contractSetup.fieldMappings) {
          const rawValue = String(extractedByPlaceholder[mapItem.placeholder] || '').trim();
          if (!rawValue) {
            warnings.push(templateText(locale.warningNoValueExtracted, { placeholder: mapItem.placeholder }));
            continue;
          }
          if (rawValue.includes('{{') && rawValue.includes('}}')) {
            warnings.push(templateText(locale.warningPlaceholderUnresolved, { placeholder: mapItem.placeholder }));
            continue;
          }
          if (!mappedFields[mapItem.clientField]) {
            mappedFields[mapItem.clientField] = rawValue;
          }
        }

        setContractExtraction(mappedFields);
        setContractWarnings(warnings);

        const autoLeadName = [mappedFields.firstName, mappedFields.name]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (autoLeadName) {
          setLeadName((prev) => (prev.trim() ? prev : autoLeadName));
        } else if (mappedFields.company) {
          setLeadName((prev) => (prev.trim() ? prev : mappedFields.company || ''));
        }

        if (Object.keys(mappedFields).length === 0) {
          setContractInfo(locale.contractLoadedNoValues);
        } else {
          setContractInfo(templateText(locale.contractParsedFields, { count: Object.keys(mappedFields).length }));
        }
      } catch (err) {
        setContractExtraction({});
        setContractWarnings([]);
        setContractError(toErrorMessage(err));
      } finally {
        setLoadingContractExtraction(false);
      }
    },
    [contractSetup, loadContractTemplate, locale.configureContractSetupFirst, locale.contractLoadedNoValues, locale.contractParsedFields, locale.warningNoValueExtracted, locale.warningPlaceholderUnresolved],
  );

  const canApplyContractToClient = Boolean(selectedDealClientId) && extractedFieldEntries.length > 0;

  const applyExtractedContractToClient = useCallback(async () => {
    if (!selectedDealClientId || extractedFieldEntries.length === 0) return;
    setApplyingContractFields(true);
    setContractError(null);
    setContractInfo(null);
    try {
      const payload = extractedFieldEntries.reduce<Record<string, string>>((acc, [field, value]) => {
        acc[field] = value;
        return acc;
      }, {});
      await api(`/clients/${selectedDealClientId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setDeals((prev) =>
        prev.map((deal) => {
          if (deal.id !== selectedDeal?.id) return deal;
          return {
            ...deal,
            client: {
              ...(deal.client || {}),
              ...payload,
            },
          };
        }),
      );

      setContractInfo(locale.clientFieldsUpdated);
    } catch (err) {
      setContractError(toErrorMessage(err));
    } finally {
      setApplyingContractFields(false);
    }
  }, [api, extractedFieldEntries, locale.clientFieldsUpdated, selectedDeal?.id, selectedDealClientId]);

  return (
    <Guard>
      <AppShell>
        <Box maxW="980px" mx="auto" p={{ base: 0, md: 2 }} color="whiteAlpha.900">
          <Heading mb={2} size="lg">
            o7 IA Pulse
          </Heading>
          <Text color="whiteAlpha.700" mb={6}>
            {locale.subtitle}
          </Text>
          <Text color="whiteAlpha.500" fontSize="xs" mb={4}>
            UI build: {iaUiBuild} · API target: {apiTarget}
          </Text>

          <Stack gap={4}>
            <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
              <Card.Body>
                <Heading size="sm" mb={3}>
                  {locale.sourceCrm}
                </Heading>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                  <Box>
                    <Text fontSize="sm" color="whiteAlpha.800" mb={1}>
                      {locale.pipeline}
                    </Text>
                    <select
                      value={pipelineId}
                      onChange={(e) => {
                        const next = e.currentTarget.value;
                        setPipelineId(next);
                        setApplyInfo(null);
                        setApplyError(null);
                      }}
                      disabled={loadingCrm || pipelines.length === 0}
                      style={{
                        width: '100%',
                        borderRadius: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.24)',
                        padding: '0.5rem 0.75rem',
                      }}
                    >
                      <option value="">{locale.selectPipeline}</option>
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                  </Box>

                  <Box>
                    <Text fontSize="sm" color="whiteAlpha.800" mb={1}>
                      {locale.leadCrm}
                    </Text>
                    <select
                      value={dealId}
                      onChange={(e) => {
                        const nextDealId = e.currentTarget.value;
                        setDealId(nextDealId);
                        const next = deals.find((deal) => deal.id === nextDealId);
                        if (next) {
                          setLeadName((prev) => (prev.trim() ? prev : next.title || ''));
                        }
                      }}
                      disabled={loadingCrm || deals.length === 0}
                      style={{
                        width: '100%',
                        borderRadius: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.24)',
                        padding: '0.5rem 0.75rem',
                      }}
                    >
                      <option value="">{locale.selectLead}</option>
                      {deals.map((deal) => {
                        const stage = stageById[deal.stageId] || deal.stage;
                        return (
                          <option key={deal.id} value={deal.id}>
                            {deal.title}
                            {stage?.name ? ` · ${stage.name}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </Box>
                </SimpleGrid>

                {selectedDeal ? (
                  <Text mt={3} fontSize="xs" color="whiteAlpha.700">
                    {locale.deal}: {selectedDeal.title} · {locale.stage}: {selectedDealStage?.name || selectedDeal.stageId} · {locale.status}:{' '}
                    {selectedDealStage?.status || selectedDeal.stage?.status || 'OPEN'} · {locale.value}:{' '}
                    {(selectedDeal.currency || 'USD').toUpperCase()} {Number(selectedDeal.value || 0).toLocaleString()}
                    {selectedDeal.client ? ` · ${locale.client}: ${getClientLabel(selectedDeal.client) || locale.na}` : ''}
                  </Text>
                ) : null}

                <Box mt={3} display="flex" justifyContent="flex-end">
                  <Button
                    colorPalette="blue"
                    disabled={!canAnalyzeCrmLead}
                    onClick={() => void handleAnalyzeSelectedLead()}
                    borderRadius="xl"
                  >
                    {loadingLeadAnalysis ? <Spinner size="sm" /> : locale.analyzeCrmLead}
                  </Button>
                </Box>

                {errorCrm ? (
                  <Alert.Root status="warning" mt={3} borderRadius="md">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>CRM</Alert.Title>
                      <Alert.Description>{errorCrm}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                ) : null}
              </Card.Body>
            </Card.Root>

            <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
              <Card.Body>
                <Heading size="sm" mb={2}>
                  {locale.contractHeading}
                </Heading>
                <Text fontSize="sm" color="whiteAlpha.800" mb={3}>
                  {locale.contractSubtitle}
                </Text>

                <input
                  ref={contractInputRef}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void handleContractFileSelected(file);
                  }}
                />

                {contractSetup?.templateHref ? (
                  <Box mb={3} p={3} borderRadius="md" bg="blackAlpha.300" borderWidth="1px" borderColor="whiteAlpha.200">
                    <Text fontSize="xs" color="whiteAlpha.600">
                      {locale.templateSetup}
                    </Text>
                    <Text fontSize="sm" color="whiteAlpha.900">
                      {contractSetup.templateHref}
                    </Text>
                    <Text mt={1} fontSize="xs" color="whiteAlpha.600">
                      {templateText(locale.placeholdersMapped, { count: contractSetup.fieldMappings.length })}
                    </Text>
                  </Box>
                ) : (
                  <Box mb={3} p={3} borderRadius="md" bg="blackAlpha.300" borderWidth="1px" borderColor="whiteAlpha.200">
                    <Text fontSize="sm" color="amber.200">
                      {locale.missingContractSetup}
                    </Text>
                    <a
                      href="/admin/parameters/customers"
                      className="mt-2 inline-block text-xs text-cyan-300 underline"
                    >
                      {locale.openContractSetup}
                    </a>
                  </Box>
                )}

                <Box display="flex" gap={2} flexWrap="wrap">
                  <Button
                    colorPalette="teal"
                    onClick={handleChooseContractFile}
                    borderRadius="xl"
                    disabled={!contractSetup || loadingContractExtraction || applyingContractFields}
                  >
                    {loadingContractExtraction ? <Spinner size="sm" /> : locale.uploadContract}
                  </Button>
                  <Button
                    colorPalette="green"
                    onClick={() => void applyExtractedContractToClient()}
                    borderRadius="xl"
                    disabled={!canApplyContractToClient || applyingContractFields || loadingContractExtraction}
                  >
                    {applyingContractFields ? <Spinner size="sm" /> : locale.applyToCrmClient}
                  </Button>
                </Box>

                {contractFileName ? (
                  <Text mt={2} fontSize="xs" color="whiteAlpha.600">
                    {locale.file}: {contractFileName}
                  </Text>
                ) : null}

                {extractedFieldEntries.length > 0 ? (
                  <SimpleGrid mt={3} columns={{ base: 1, md: 2 }} gap={2}>
                    {extractedFieldEntries.map(([field, value]) => {
                      const mapping = contractSetup?.fieldMappings.find((item) => item.clientField === field);
                      const label = mapping?.label?.trim() || locale.contractFieldLabels[field] || field;
                      return (
                        <Box
                          key={field}
                          p={2}
                          borderRadius="md"
                          borderWidth="1px"
                          borderColor="whiteAlpha.200"
                          bg="blackAlpha.200"
                        >
                          <Text fontSize="xs" color="whiteAlpha.600">
                            {label}
                          </Text>
                          <Text fontSize="sm" color="whiteAlpha.900">
                            {value}
                          </Text>
                        </Box>
                      );
                    })}
                  </SimpleGrid>
                ) : null}

                {contractWarnings.length > 0 ? (
                  <Box mt={3}>
                    {contractWarnings.slice(0, 4).map((warning, index) => (
                      <Text key={`${warning}-${index}`} fontSize="xs" color="amber.200">
                        • {warning}
                      </Text>
                    ))}
                  </Box>
                ) : null}

                {contractInfo ? (
                  <Text mt={3} fontSize="sm" color="emerald.200">
                    {contractInfo}
                  </Text>
                ) : null}
                {contractError ? (
                  <Text mt={3} fontSize="sm" color="red.200">
                    {contractError}
                  </Text>
                ) : null}
              </Card.Body>
            </Card.Root>

            <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
              <Card.Body>
                <Heading size="sm" mb={2}>
                  {locale.orderManagement}
                </Heading>
                <Text fontSize="sm" color="whiteAlpha.800" mb={3}>
                  {locale.orderManagementSubtitle}
                </Text>

                <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
                  <Box bg="blackAlpha.300" borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={3}>
                    <Text fontSize="xs" color="whiteAlpha.600" mb={1}>
                      {locale.orders}
                    </Text>
                    <Text fontSize="sm" color="whiteAlpha.900">
                      {locale.ordersDescription}
                    </Text>
                  </Box>

                  <Box bg="blackAlpha.300" borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={3}>
                    <Text fontSize="xs" color="whiteAlpha.600" mb={1}>
                      {locale.payments}
                    </Text>
                    <Text fontSize="sm" color="whiteAlpha.900">
                      {locale.paymentsDescription}
                    </Text>
                  </Box>

                  <Box bg="blackAlpha.300" borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={3}>
                    <Text fontSize="xs" color="whiteAlpha.600" mb={1}>
                      {locale.invoices}
                    </Text>
                    <Text fontSize="sm" color="whiteAlpha.900">
                      {locale.invoicesDescription}
                    </Text>
                  </Box>
                </SimpleGrid>
              </Card.Body>
            </Card.Root>

            <Textarea
              placeholder={locale.additionalContextPlaceholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              bg="whiteAlpha.50"
              borderColor="whiteAlpha.200"
              _focusVisible={{ borderColor: 'cyan.300' }}
              borderRadius="xl"
            />

            <Input
              placeholder={locale.leadNamePlaceholder}
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              bg="whiteAlpha.50"
              borderColor="whiteAlpha.200"
              _focusVisible={{ borderColor: 'cyan.300' }}
              borderRadius="xl"
            />

            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={3}>
              <Button
                colorPalette="blue"
                disabled={!canUseText || loadingSentiment}
                onClick={() => void analyzeLead(text.trim())}
                borderRadius="xl"
              >
                {loadingSentiment ? <Spinner size="sm" /> : locale.analyzeText}
              </Button>

              <Button
                colorPalette="teal"
                disabled={!canUseText || loadingSummary}
                onClick={() => void summarize(text.trim())}
                borderRadius="xl"
              >
                {loadingSummary ? <Spinner size="sm" /> : locale.summarize}
              </Button>

              <Button
                colorPalette="purple"
                disabled={!canGenerateEmail || loadingEmail}
                onClick={() => void generateEmail(leadName.trim(), text.trim())}
                borderRadius="xl"
              >
                {loadingEmail ? <Spinner size="sm" /> : locale.generateEmail}
              </Button>

              <Button
                colorPalette="orange"
                disabled={!canUseText || loadingImprove}
                onClick={() => void improveProposal(text.trim())}
                borderRadius="xl"
              >
                {loadingImprove ? <Spinner size="sm" /> : locale.improveProposal}
              </Button>
            </SimpleGrid>

            <Box display="flex" justifyContent="flex-end">
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
                <Button
                  variant="outline"
                  borderColor="whiteAlpha.300"
                  onClick={() => void fetchDiagnostics()}
                  borderRadius="xl"
                >
                  {loadingDiagnostics ? <Spinner size="sm" /> : locale.aiDiagnostics}
                </Button>
                <Button
                  variant="outline"
                  borderColor="whiteAlpha.300"
                  onClick={clearAll}
                  borderRadius="xl"
                >
                  {locale.clearAll}
                </Button>
              </SimpleGrid>
            </Box>
          </Stack>

          {errors.length ? (
            <Alert.Root status="error" mt={6} borderRadius="md">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{locale.error}</Alert.Title>
                <Alert.Description>
                  <Box mt={1}>
                    {errors.map((message, idx) => (
                      <Text key={`${message}-${idx}`}>{message}</Text>
                    ))}
                  </Box>
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : null}

          {errorDiagnostics ? (
            <Alert.Root status="warning" mt={4} borderRadius="md">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{locale.aiDiagnostics}</Alert.Title>
                <Alert.Description>{errorDiagnostics}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : null}

          <Separator my={8} borderColor="whiteAlpha.200" />

          <Stack gap={6}>
            {leadAnalysis ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={3}>
                    {locale.crmLeadAnalysis}
                  </Heading>

                  <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
                    <Box>
                      <Text fontSize="xs" color="whiteAlpha.600">
                        {locale.score}
                      </Text>
                      <Text fontSize="2xl" fontWeight="bold">
                        {leadAnalysis.analysis.score}/100
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="whiteAlpha.600">
                        {locale.winProbability}
                      </Text>
                      <Text fontSize="2xl" fontWeight="bold">
                        {Math.round(leadAnalysis.analysis.winProbability * 100)}%
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="whiteAlpha.600">
                        {locale.risk}
                      </Text>
                      <Text fontSize="2xl" fontWeight="bold">
                        {leadAnalysis.analysis.lossRisk}
                      </Text>
                    </Box>
                  </SimpleGrid>

                  <Text mt={3} fontSize="sm" color="whiteAlpha.800">
                    {leadAnalysis.lead.dealTitle} · {leadAnalysis.lead.pipelineName} · {leadAnalysis.lead.stageName} ·
                    {(leadAnalysis.lead.currency || 'USD').toUpperCase()} {Number(leadAnalysis.lead.value).toLocaleString()}
                    {leadAnalysis.lead.valueUsd !== null
                      ? ` (USD ${Math.round(leadAnalysis.lead.valueUsd).toLocaleString()})`
                      : ''}
                  </Text>

                  <Text mt={2} fontSize="sm" color="whiteAlpha.700">
                    {leadAnalysis.analysis.explanation}
                  </Text>

                  {leadAnalysis.analysis.reasons.length > 0 ? (
                    <Box mt={3}>
                      <Text fontWeight="semibold" mb={1}>
                        {locale.reasons}
                      </Text>
                      <Stack gap={1}>
                        {leadAnalysis.analysis.reasons.map((reason) => (
                          <Text key={reason} fontSize="sm" color="whiteAlpha.800">
                            • {reason}
                          </Text>
                        ))}
                      </Stack>
                    </Box>
                  ) : null}

                  {leadAnalysis.analysis.nextBestActions.length > 0 ? (
                    <Box mt={3}>
                      <Text fontWeight="semibold" mb={1}>
                        {locale.nextBestActions}
                      </Text>
                      <Stack gap={1}>
                        {leadAnalysis.analysis.nextBestActions.map((action) => (
                          <Text key={action} fontSize="sm" color="whiteAlpha.800">
                            • {action}
                          </Text>
                        ))}
                      </Stack>
                    </Box>
                  ) : null}

                  {crmActionPlan.length > 0 ? (
                    <Box mt={3}>
                      <Text fontWeight="semibold" mb={1}>
                        {locale.proposedActionPlan}
                      </Text>
                      <Stack gap={1}>
                        {crmActionPlan.map((step, index) => (
                          <Text key={`${index}-${step}`} fontSize="sm" color="whiteAlpha.900">
                            {step}
                          </Text>
                        ))}
                      </Stack>
                    </Box>
                  ) : null}

                  <Box mt={4} display="flex" justifyContent="space-between" alignItems="center" gap={3}>
                    <Text fontSize="sm" color="whiteAlpha.700">
                      {locale.recommendation}: {leadAnalysis.analysis.recommendedOutcome}
                      {leadAnalysis.analysis.recommendedStageName
                        ? ` → ${leadAnalysis.analysis.recommendedStageName}`
                        : ''}
                    </Text>
                    <Button
                      colorPalette="green"
                      onClick={() => void applyRecommendedStage()}
                      disabled={!canApplyRecommendation || applyingRecommendation}
                      borderRadius="xl"
                    >
                      {applyingRecommendation ? <Spinner size="sm" /> : locale.applyRecommendation}
                    </Button>
                  </Box>

                  {applyInfo ? <Text mt={2} color="green.300">{applyInfo}</Text> : null}
                  {applyError ? <Text mt={2} color="red.300">{applyError}</Text> : null}
                  {shareInfo ? <Text mt={2} color="green.300">{shareInfo}</Text> : null}

                  {crmEmailDraft ? (
                    <Card.Root mt={4} bg="blackAlpha.300" borderWidth="1px" borderColor="whiteAlpha.200">
                      <Card.Body>
                        <Heading size="xs" mb={2}>
                          {locale.emailReadyToSend}
                        </Heading>
                        <Text fontSize="sm" fontWeight="semibold">
                          {locale.subject}: {crmEmailDraft.subject}
                        </Text>
                        <Text mt={2} fontSize="sm" whiteSpace="pre-wrap" color="whiteAlpha.900">
                          {crmEmailDraft.body}
                        </Text>
                        <Box mt={3} display="flex" justifyContent="flex-end">
                          <Button
                            size="sm"
                            onClick={() =>
                              void copyToClipboard(
                                `${locale.subject}: ${crmEmailDraft.subject}\n\n${crmEmailDraft.body}`,
                                locale.emailLabel,
                              )
                            }
                            borderRadius="lg"
                          >
                            {locale.copyEmail}
                          </Button>
                        </Box>
                      </Card.Body>
                    </Card.Root>
                  ) : null}

                  {crmWhatsappDraft ? (
                    <Card.Root mt={3} bg="blackAlpha.300" borderWidth="1px" borderColor="whiteAlpha.200">
                      <Card.Body>
                        <Heading size="xs" mb={2}>
                          {locale.whatsappReadyToSend}
                        </Heading>
                        <Text fontSize="sm" whiteSpace="pre-wrap" color="whiteAlpha.900">
                          {crmWhatsappDraft}
                        </Text>
                        <SimpleGrid mt={3} columns={{ base: 1, sm: 2 }} gap={2}>
                          <Button
                            size="sm"
                            onClick={() => void copyToClipboard(crmWhatsappDraft, locale.whatsappLabel)}
                            borderRadius="lg"
                          >
                            {locale.copyWhatsapp}
                          </Button>
                          <Button size="sm" colorPalette="green" onClick={openWhatsApp} borderRadius="lg">
                            {locale.openWhatsapp}
                          </Button>
                        </SimpleGrid>
                      </Card.Body>
                    </Card.Root>
                  ) : null}
                </Card.Body>
              </Card.Root>
            ) : null}

            {diagnostics ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    {locale.runtimeDiagnostics}
                  </Heading>
                  <Box as="pre" fontSize="xs" whiteSpace="pre-wrap">
                    {JSON.stringify(diagnostics, null, 2)}
                  </Box>
                </Card.Body>
              </Card.Root>
            ) : null}

            {sentiment ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    {locale.sentimentAnalysis}
                  </Heading>
                  <Box as="pre" fontSize="sm" whiteSpace="pre-wrap">
                    {JSON.stringify(sentiment, null, 2)}
                  </Box>
                </Card.Body>
              </Card.Root>
            ) : null}

            {summary?.summary ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    {locale.summary}
                  </Heading>
                  <Text whiteSpace="pre-wrap">{summary.summary}</Text>
                </Card.Body>
              </Card.Root>
            ) : null}

            {draftEmail ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    {locale.generatedEmail}
                  </Heading>
                  <Text fontWeight="bold">{locale.subject}:</Text>
                  <Text mb={3}>{draftEmail.subject || '—'}</Text>
                  <Text whiteSpace="pre-wrap">{draftEmail.body || '—'}</Text>
                </Card.Body>
              </Card.Root>
            ) : null}

            {improvedProposal?.improvedProposal ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    {locale.improvedProposal}
                  </Heading>
                  <Text whiteSpace="pre-wrap">{improvedProposal.improvedProposal}</Text>
                </Card.Body>
              </Card.Root>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </Guard>
  );
}

export default function IaPulsePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-300">Loading IA Pulse...</div>}>
      <IaPulsePageContent />
    </Suspense>
  );
}
