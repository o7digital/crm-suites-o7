// Industry, not the account name or CRM mode, determines clinical terminology.
export function isMedicalIndustry(industry?: string | null) {
  const value = (industry || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_/()-]+/g, ' ');
  return /\b(healthcare|medical|doctor|physician|medicine|medecin|medecine|medico|medicina|dentist|dentiste|dentista|dentistry|dental|odontologia|psychiatry|psychiatrist|psychiatre|psyquiatre|psiquiatra|psiquiatria|psychology|psychologue|psicologo|psicologia|sante|salud)\b/.test(value);
}

export function medicalTranslation(key: string, value: string, language: string, medical: boolean) {
  // Subscription customers are businesses, even when their CRM tracks patients.
  const eligible = key === 'nav.clients' || key.startsWith('clients.') || key.startsWith('dashboard.')
    || key.startsWith('tasks.') || key.startsWith('crm.') || key.startsWith('orders.')
    || key.startsWith('invoices.') || key.startsWith('export.clients.') || key === 'field.clientStatus';
  // Import instructions must keep the actual supported column names.
  if (!medical || !eligible || /headersHint|headers|supported/i.test(key)) return value;
  const words: Record<string, [string,string]> = { en:['patient','patients'], fr:['patient','patients'], es:['paciente','pacientes'] };
  const pair = words[language];
  if (!pair) return value;
  return value.replace(/\b(clients?|clientes?)\b/gi, (word, _match, offset: number) => {
    if (value[offset - 1] === '{' || value[offset + word.length] === '}') return word;
    const plural = /s$/i.test(word);
    const replacement = pair[plural ? 1 : 0];
    return word === word.toUpperCase() ? replacement.toUpperCase() : /^[A-Z]/.test(word) ? replacement[0].toUpperCase()+replacement.slice(1) : replacement;
  });
}
