import type { LanguageCode } from './types';

// Translate known default stage names. Custom stages will fall back to their stored name.
export const STAGE_LABELS: Record<LanguageCode, Record<string, string>> = {
  en: {
    Lead: 'Lead',
    Qualified: 'Qualified',
    Proposal: 'Proposal',
    Negotiation: 'Negotiation',
    'Verbal yes': 'Verbal yes',
    Won: 'Won',
    Lost: 'Lost',
    'INVOICE Customer': 'INVOICE Customer',
    'TRANSFER PAYMENT': 'TRANSFER PAYMENT',
    'Transfer Scheduled': 'Transfer Scheduled',
    Paid: 'Paid',
  },
  fr: {
    Lead: 'Lead',
    Qualified: 'Qualifie',
    Proposal: 'Proposition',
    Negotiation: 'Negociation',
    'Verbal yes': 'Accord verbal',
    Won: 'Gagne',
    Lost: 'Perdu',
    'INVOICE Customer': 'Facture client',
    'TRANSFER PAYMENT': 'Transfert paiement',
    'Transfer Scheduled': 'Transfert planifie',
    Paid: 'Paye',
  },
  es: {
    Lead: 'Lead',
    Qualified: 'Calificado',
    Proposal: 'Propuesta',
    Negotiation: 'Negociacion',
    'Verbal yes': 'Si verbal',
    Won: 'Ganado',
    Lost: 'Perdido',
    'INVOICE Customer': 'Factura cliente',
    'TRANSFER PAYMENT': 'Transferencia',
    'Transfer Scheduled': 'Transferencia programada',
    Paid: 'Pagado',
  },
};

export function translateStageName(lang: LanguageCode, name: string): string {
  return STAGE_LABELS[lang]?.[name] ?? name;
}

