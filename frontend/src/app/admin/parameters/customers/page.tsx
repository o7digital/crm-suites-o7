'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { Guard } from '../../../../components/Guard';
import { useApi, useAuth } from '../../../../contexts/AuthContext';

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

type TenantSettingsPayload = {
  settings?: {
    contractSetup?: ContractSetup | null;
  };
};

type ContractTemplateOption = {
  href: string;
  label: string;
};

const CONTRACT_TEMPLATE_OPTIONS: ContractTemplateOption[] = [
  { href: '/contracts/fr/01_master_service_agreement_template.md', label: 'FR · 01 MSA' },
  { href: '/contracts/fr/02_dpa_rgpd_template.md', label: 'FR · 02 DPA / RGPD' },
  { href: '/contracts/fr/03_annexe_securite_template.md', label: 'FR · 03 Annexe securite' },
  { href: '/contracts/fr/04_annexe_sous_traitants_template.md', label: 'FR · 04 Annexe sous-traitants' },
  { href: '/contracts/en/01_master_service_agreement_template.md', label: 'EN · 01 MSA' },
  { href: '/contracts/en/02_dpa_rgpd_template.md', label: 'EN · 02 DPA / GDPR' },
  { href: '/contracts/en/03_annexe_securite_template.md', label: 'EN · 03 Security annex' },
  { href: '/contracts/en/04_annexe_sous_traitants_template.md', label: 'EN · 04 Sub-processors' },
  { href: '/contracts/es/01_master_service_agreement_template.md', label: 'ES · 01 MSA' },
  { href: '/contracts/es/02_dpa_rgpd_template.md', label: 'ES · 02 DPA / RGPD' },
  { href: '/contracts/es/03_annexe_securite_template.md', label: 'ES · 03 Anexo seguridad' },
  { href: '/contracts/es/04_annexe_sous_traitants_template.md', label: 'ES · 04 Subencargados' },
];

const CLIENT_FIELD_OPTIONS: Array<{ value: ContractClientFieldKey; label: string }> = [
  { value: 'firstName', label: 'Prenom' },
  { value: 'name', label: 'Nom' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telephone' },
  { value: 'company', label: 'Entreprise' },
  { value: 'companySector', label: 'Secteur entreprise' },
  { value: 'function', label: 'Fonction' },
  { value: 'website', label: 'Site web' },
  { value: 'address', label: 'Adresse' },
  { value: 'taxId', label: 'Tax ID / RFC' },
  { value: 'notes', label: 'Notes' },
];

function extractContractPlaceholders(templateText: string): string[] {
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const output: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(templateText))) {
    const placeholder = String(match[1] || '').trim();
    if (!placeholder) continue;
    if (!output.includes(placeholder)) output.push(placeholder);
  }
  return output;
}

function guessClientFieldForPlaceholder(placeholder: string): ContractClientFieldKey {
  const key = placeholder.toLowerCase();
  if (key.includes('email')) return 'email';
  if (key.includes('phone') || key.includes('mobile') || key.includes('tel')) return 'phone';
  if (key.includes('tax') || key.includes('rfc') || key.includes('vat') || key.includes('siret')) return 'taxId';
  if (key.includes('website') || key.includes('site') || key.includes('url')) return 'website';
  if (key.includes('address') || key.includes('adresse')) return 'address';
  if (key.includes('sector') || key.includes('industry')) return 'companySector';
  if (key.includes('company') || key.includes('legal_name')) return 'company';
  if (key.includes('first_name') || key.includes('firstname')) return 'firstName';
  if (key.includes('function') || key.includes('role') || key.includes('title')) return 'function';
  return 'name';
}

function toClientFieldLabel(clientField: ContractClientFieldKey): string {
  return CLIENT_FIELD_OPTIONS.find((opt) => opt.value === clientField)?.label || clientField;
}

export default function AdminParametersCustomersPage() {
  const { token } = useAuth();
  const api = useApi(token);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [templateHref, setTemplateHref] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [fieldMappings, setFieldMappings] = useState<ContractFieldMapping[]>([]);

  const mappedCount = useMemo(
    () => fieldMappings.filter((item) => Boolean(item.clientField)).length,
    [fieldMappings],
  );

  const mergeMappingsWithTemplate = useCallback(
    (placeholders: string[], existing: ContractFieldMapping[]): ContractFieldMapping[] => {
      const byPlaceholder = new Map(existing.map((item) => [item.placeholder, item]));
      return placeholders.map((placeholder) => {
        const saved = byPlaceholder.get(placeholder);
        if (saved) return saved;
        const guess = guessClientFieldForPlaceholder(placeholder);
        return {
          placeholder,
          clientField: guess,
          label: toClientFieldLabel(guess),
        };
      });
    },
    [],
  );

  const loadTemplatePlaceholders = useCallback(
    async (href: string, keepMappings: ContractFieldMapping[] = []) => {
      if (!href) {
        setFieldMappings([]);
        return;
      }
      setTemplateLoading(true);
      setTemplateError(null);
      try {
        const res = await fetch(href, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Unable to load template (${res.status})`);
        const templateText = await res.text();
        const placeholders = extractContractPlaceholders(templateText);
        if (placeholders.length === 0) {
          throw new Error('No {{placeholder}} found in selected template');
        }
        setFieldMappings(mergeMappingsWithTemplate(placeholders, keepMappings));
      } catch (err) {
        setTemplateError(err instanceof Error ? err.message : 'Unable to load template');
        setFieldMappings([]);
      } finally {
        setTemplateLoading(false);
      }
    },
    [mergeMappingsWithTemplate],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api<TenantSettingsPayload>('/tenant/settings', { method: 'GET' })
      .then((data) => {
        const setup = data.settings?.contractSetup || null;
        const href = String(setup?.templateHref || '').trim();
        setTemplateHref(href);
        const savedMappings = Array.isArray(setup?.fieldMappings) ? setup!.fieldMappings : [];
        if (!href) {
          setFieldMappings(savedMappings);
          return;
        }
        void loadTemplatePlaceholders(href, savedMappings);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api, loadTemplatePlaceholders, token]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const payload = templateHref
        ? {
            templateHref,
            fieldMappings: fieldMappings
              .filter((item) => item.placeholder && item.clientField)
              .map((item) => ({
                placeholder: item.placeholder,
                clientField: item.clientField,
                label: item.label?.trim() || undefined,
              })),
          }
        : null;

      await api('/tenant/settings', {
        method: 'PATCH',
        body: JSON.stringify({ contractSetup: payload }),
      });
      setInfo('Contract setup saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save contract setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Guard>
      <AppShell>
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.15em] text-slate-400">Admin · Parameters</p>
          <h1 className="text-3xl font-semibold">Customers</h1>
          <p className="mt-2 text-sm text-slate-400">
            Configure contract extraction setup: template + placeholder to client-field mapping.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/admin/parameters" className="btn-secondary text-sm">
              Back
            </Link>
          </div>
        </div>

        <div className="card p-6">
          {loading ? <p className="text-sm text-slate-300">Loading…</p> : null}

          {!loading ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="text-sm text-slate-300">Contract template</label>
                  <select
                    className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                    value={templateHref}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTemplateHref(next);
                      setTemplateError(null);
                      if (!next) {
                        setFieldMappings([]);
                        return;
                      }
                      void loadTemplatePlaceholders(next, fieldMappings);
                    }}
                  >
                    <option value="">No template (disable extraction)</option>
                    {CONTRACT_TEMPLATE_OPTIONS.map((tpl) => (
                      <option key={tpl.href} value={tpl.href}>
                        {tpl.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    className="btn-secondary text-sm"
                    type="button"
                    onClick={() => void loadTemplatePlaceholders(templateHref, fieldMappings)}
                    disabled={!templateHref || templateLoading}
                  >
                    {templateLoading ? 'Loading…' : 'Reload placeholders'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                {fieldMappings.length} placeholders detected · {mappedCount} mapped to client fields
              </div>

              {templateError ? <p className="text-sm text-amber-200">{templateError}</p> : null}

              {fieldMappings.length > 0 ? (
                <div className="space-y-2">
                  {fieldMappings.map((mapping) => (
                    <div
                      key={mapping.placeholder}
                      className="grid gap-2 rounded-lg border border-white/10 bg-white/5 p-3 md:grid-cols-[230px_220px_1fr]"
                    >
                      <div>
                        <p className="text-[11px] text-slate-500">Placeholder</p>
                        <p className="font-mono text-sm text-slate-200">{`{{${mapping.placeholder}}}`}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Client field</p>
                        <select
                          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                          value={mapping.clientField}
                          onChange={(e) => {
                            const nextField = e.target.value as ContractClientFieldKey;
                            setFieldMappings((prev) =>
                              prev.map((item) =>
                                item.placeholder === mapping.placeholder
                                  ? { ...item, clientField: nextField, label: item.label || toClientFieldLabel(nextField) }
                                  : item,
                              ),
                            );
                          }}
                        >
                          {CLIENT_FIELD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Display label in IA Pulse (optional)</p>
                        <input
                          className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
                          value={mapping.label || ''}
                          onChange={(e) => {
                            const nextLabel = e.target.value;
                            setFieldMappings((prev) =>
                              prev.map((item) =>
                                item.placeholder === mapping.placeholder ? { ...item, label: nextLabel } : item,
                              ),
                            );
                          }}
                          placeholder={toClientFieldLabel(mapping.clientField)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Select a contract template to load placeholders and configure mappings.
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button className="btn-primary text-sm" type="button" onClick={save} disabled={saving || loading}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : null}

          {info ? <p className="mt-3 text-sm text-emerald-200">{info}</p> : null}
          {error ? <div className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">{error}</div> : null}
        </div>
      </AppShell>
    </Guard>
  );
}
