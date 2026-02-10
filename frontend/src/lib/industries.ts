import type { LanguageCode } from '../i18n/types';

export type CrmMode = 'B2B' | 'B2C';

export type IndustryOption = {
  id: string; // Stored in DB (Tenant.industry)
  crmMode: CrmMode; // Recommended CRM mode for this industry
  label: Record<LanguageCode, string>;
};

// Curated list (grouped by CRM mode). You can extend this over time.
export const INDUSTRIES: IndustryOption[] = [
  // B2C
  {
    id: 'HOSPITALITY',
    crmMode: 'B2C',
    label: { fr: 'Hotellerie', en: 'Hospitality', es: 'Hoteleria' },
  },
  { id: 'RESTAURANT', crmMode: 'B2C', label: { fr: 'Restaurant', en: 'Restaurant', es: 'Restaurante' } },
  { id: 'TOURISM_TRAVEL', crmMode: 'B2C', label: { fr: 'Tourisme / Voyage', en: 'Travel & Tourism', es: 'Turismo / Viajes' } },
  { id: 'ECOMMERCE', crmMode: 'B2C', label: { fr: 'E-commerce', en: 'E-commerce', es: 'E-commerce' } },
  { id: 'RETAIL', crmMode: 'B2C', label: { fr: 'Commerce de detail', en: 'Retail', es: 'Retail' } },
  { id: 'REAL_ESTATE_B2C', crmMode: 'B2C', label: { fr: 'Immobilier (B2C)', en: 'Real estate (B2C)', es: 'Inmobiliario (B2C)' } },
  { id: 'BEAUTY', crmMode: 'B2C', label: { fr: 'Beaute / Cosmetique', en: 'Beauty', es: 'Belleza' } },
  { id: 'FITNESS_WELLNESS', crmMode: 'B2C', label: { fr: 'Fitness / Bien-etre', en: 'Fitness & Wellness', es: 'Fitness / Bienestar' } },
  { id: 'EVENTS', crmMode: 'B2C', label: { fr: 'Evenementiel', en: 'Events', es: 'Eventos' } },
  { id: 'ENTERTAINMENT', crmMode: 'B2C', label: { fr: 'Loisirs / Divertissement', en: 'Entertainment', es: 'Entretenimiento' } },
  { id: 'HOME_SERVICES', crmMode: 'B2C', label: { fr: 'Services a domicile', en: 'Home services', es: 'Servicios a domicilio' } },
  { id: 'EDUCATION_B2C', crmMode: 'B2C', label: { fr: 'Education (B2C)', en: 'Education (B2C)', es: 'Educacion (B2C)' } },
  { id: 'HEALTHCARE_B2C', crmMode: 'B2C', label: { fr: 'Sante (B2C)', en: 'Healthcare (B2C)', es: 'Salud (B2C)' } },
  { id: 'AUTOMOTIVE_B2C', crmMode: 'B2C', label: { fr: 'Automobile (B2C)', en: 'Automotive (B2C)', es: 'Automotriz (B2C)' } },

  // B2B
  { id: 'SERVICES', crmMode: 'B2B', label: { fr: 'Services', en: 'Services', es: 'Servicios' } },
  { id: 'PRO_SERVICES', crmMode: 'B2B', label: { fr: 'Services professionnels', en: 'Professional services', es: 'Servicios profesionales' } },
  { id: 'CONSULTING', crmMode: 'B2B', label: { fr: 'Conseil', en: 'Consulting', es: 'Consultoria' } },
  { id: 'IT_SERVICES', crmMode: 'B2B', label: { fr: 'Services IT', en: 'IT services', es: 'Servicios IT' } },
  { id: 'SAAS_SOFTWARE', crmMode: 'B2B', label: { fr: 'SaaS / Logiciel', en: 'SaaS / Software', es: 'SaaS / Software' } },
  { id: 'MARKETING_AGENCY', crmMode: 'B2B', label: { fr: 'Marketing / Agence', en: 'Marketing / Agency', es: 'Marketing / Agencia' } },
  { id: 'MANUFACTURING', crmMode: 'B2B', label: { fr: 'Industrie / Fabrication', en: 'Manufacturing', es: 'Manufactura' } },
  { id: 'CONSTRUCTION', crmMode: 'B2B', label: { fr: 'Construction', en: 'Construction', es: 'Construccion' } },
  { id: 'LOGISTICS', crmMode: 'B2B', label: { fr: 'Logistique / Transport', en: 'Logistics & Transport', es: 'Logistica / Transporte' } },
  { id: 'FINANCE_B2B', crmMode: 'B2B', label: { fr: 'Finance (B2B)', en: 'Finance (B2B)', es: 'Finanzas (B2B)' } },
  { id: 'INSURANCE', crmMode: 'B2B', label: { fr: 'Assurance', en: 'Insurance', es: 'Seguros' } },
  { id: 'TELECOM', crmMode: 'B2B', label: { fr: 'Telecom', en: 'Telecom', es: 'Telecom' } },
  { id: 'ENERGY', crmMode: 'B2B', label: { fr: 'Energie', en: 'Energy', es: 'Energia' } },
  { id: 'AGRICULTURE', crmMode: 'B2B', label: { fr: 'Agriculture', en: 'Agriculture', es: 'Agricultura' } },
  { id: 'PUBLIC_SECTOR', crmMode: 'B2B', label: { fr: 'Secteur public', en: 'Public sector', es: 'Sector publico' } },
  { id: 'NON_PROFIT', crmMode: 'B2B', label: { fr: 'Association / ONG', en: 'Non-profit', es: 'ONG' } },
  { id: 'LEGAL', crmMode: 'B2B', label: { fr: 'Juridique', en: 'Legal', es: 'Legal' } },
  { id: 'HR_RECRUITING', crmMode: 'B2B', label: { fr: 'RH / Recrutement', en: 'HR / Recruiting', es: 'RRHH / Reclutamiento' } },
  { id: 'EDUCATION_B2B', crmMode: 'B2B', label: { fr: 'Education (B2B)', en: 'Education (B2B)', es: 'Educacion (B2B)' } },
  { id: 'HEALTHCARE_B2B', crmMode: 'B2B', label: { fr: 'Sante (B2B)', en: 'Healthcare (B2B)', es: 'Salud (B2B)' } },
  { id: 'AUTOMOTIVE_B2B', crmMode: 'B2B', label: { fr: 'Automobile (B2B)', en: 'Automotive (B2B)', es: 'Automotriz (B2B)' } },

  // Other
  { id: 'OTHER', crmMode: 'B2B', label: { fr: 'Autre (a preciser)', en: 'Other (specify)', es: 'Otro (especificar)' } },
];

export function findIndustryOption(industry: string | null | undefined): IndustryOption | null {
  const raw = (industry || '').trim();
  if (!raw) return null;
  return INDUSTRIES.find((opt) => opt.id === raw) || null;
}

export function industryLabel(opt: IndustryOption, language: LanguageCode): string {
  return opt.label[language] || opt.label.en;
}

export function industryRecommendedMode(industry: string | null | undefined): CrmMode | null {
  const opt = findIndustryOption(industry);
  return opt ? opt.crmMode : null;
}

export function industryGroups() {
  const b2c = INDUSTRIES.filter((x) => x.crmMode === 'B2C');
  const b2b = INDUSTRIES.filter((x) => x.crmMode === 'B2B' && x.id !== 'OTHER');
  const other = INDUSTRIES.filter((x) => x.id === 'OTHER');
  return { b2c, b2b, other };
}

