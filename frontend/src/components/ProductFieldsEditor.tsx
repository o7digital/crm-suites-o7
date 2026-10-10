'use client';

export type ExtraField = {
  label: string;
  value: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options?: string[];
};

export function normalizeExtraFields(fields: ExtraField[]): ExtraField[] {
  return fields.map((field) => ({
    label: field.label.trim(),
    type: field.type ?? 'text',
    value: field.value,
    ...(field.type === 'select'
      ? { options: [...new Set((field.options ?? []).map((v) => v.trim()).filter(Boolean))] }
      : {}),
  }));
}

export function extraFieldsError(fields: ExtraField[]): string | null {
  for (const field of normalizeExtraFields(fields)) {
    if (!field.label) return 'Each additional field needs a name.';
    if (field.type === 'select') {
      if (!field.options?.length) return `Add at least one choice for "${field.label}".`;
      if (field.options.length > 50) return `Use up to 50 choices for "${field.label}".`;
      if (field.value && !field.options.includes(field.value)) return `Choose an available value for "${field.label}".`;
    }
    if (
      field.value &&
      field.type === 'number' &&
      (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(field.value) || !Number.isFinite(Number(field.value)))
    ) {
      return `Enter a valid number for "${field.label}".`;
    }
    if (field.value && field.type === 'date') {
      const date = new Date(`${field.value}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(field.value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== field.value
      )
        return `Enter a valid date for "${field.label}".`;
    }
  }
  return null;
}

export function formatExtraField(field: ExtraField): string {
  if (field.value === '') return '—';
  if (field.type === 'boolean') return field.value === 'true' ? 'Yes' : 'No';
  if (field.type === 'date') {
    const date = new Date(`${field.value}T00:00:00`);
    if (Number.isFinite(date.getTime())) return date.toLocaleDateString();
  }
  if (field.type === 'number' && Number.isFinite(Number(field.value)))
    return Number(field.value).toLocaleString(undefined, { maximumFractionDigits: 20 });
  return field.value;
}

const inputClass = 'mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2';
const templates: Record<string, ExtraField[]> = {
  category: [{ label: 'Category', type: 'select', value: '', options: ['Product', 'Service', 'Subscription'] }],
  edition: [
    {
      label: 'Edition',
      type: 'select',
      value: '',
      options: ['One', 'Basic', 'Standard', 'Advanced', 'Premium', 'Team'],
    },
  ],
  o7: [
    { label: 'Product family', type: 'select', value: '', options: ['O7 Pulse', 'Olivia'] },
    {
      label: 'Edition',
      type: 'select',
      value: '',
      options: ['One', 'Basic', 'Standard', 'Advanced', 'Premium', 'Team'],
    },
  ],
};

export function ProductFieldsEditor({
  fields,
  onChange,
  disabled,
  products = [],
}: {
  fields: ExtraField[];
  onChange: (fields: ExtraField[]) => void;
  disabled: boolean;
  products?: { id: string; name: string; extraFields?: ExtraField[] }[];
}) {
  const update = (index: number, changes: Partial<ExtraField>) =>
    onChange(fields.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  const add = (source: ExtraField[]) =>
    onChange([
      ...fields,
      ...source.map((field) => ({ ...field, value: '', ...(field.options ? { options: [...field.options] } : {}) })),
    ]);
  const reusable = products.filter((product) => product.extraFields?.length);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-slate-300">Additional fields</p>
      <p className="text-xs text-slate-400">
        Choose a type for each field. Dropdown choices can be customized for your business.
      </p>
      {fields.map((field, index) => (
        <div key={index} className="rounded-lg border border-white/10 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm text-slate-300">
              Field name
              <input
                aria-label={`Field name ${index + 1}`}
                maxLength={100}
                disabled={disabled}
                className={inputClass}
                value={field.label}
                onChange={(e) => update(index, { label: e.target.value })}
              />
            </label>
            <label className="text-sm text-slate-300">
              Field type
              <select
                aria-label={`Field type ${index + 1}`}
                className={inputClass}
                disabled={disabled}
                value={field.type ?? 'text'}
                onChange={(e) =>
                  update(index, { type: e.target.value as ExtraField['type'], value: '', options: field.options ?? [] })
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="select">Dropdown list</option>
                <option value="boolean">Yes / No</option>
              </select>
            </label>
            {field.type === 'select' ? (
              <label className="text-sm text-slate-300 sm:col-span-2">
                Choices (one per line)
                <textarea
                  aria-label={`Field choices ${index + 1}`}
                  className={inputClass}
                  rows={3}
                  disabled={disabled}
                  value={(field.options ?? []).join('\n')}
                  onChange={(e) => update(index, { options: e.target.value.split('\n') })}
                />
              </label>
            ) : null}
            <label className="min-w-0 text-sm text-slate-300 sm:col-span-2">
              Value (optional)
              {field.type === 'select' ? (
                <select
                  aria-label={`Field value ${index + 1}`}
                  className={inputClass}
                  disabled={disabled}
                  value={field.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                >
                  <option value="">Choose a value…</option>
                  {[...new Set((field.options ?? []).map((option) => option.trim()).filter(Boolean))].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === 'boolean' ? (
                <select
                  aria-label={`Field value ${index + 1}`}
                  className={inputClass}
                  disabled={disabled}
                  value={field.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                >
                  <option value="">Choose a value…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  aria-label={`Field value ${index + 1}`}
                  type={field.type === 'number' || field.type === 'date' ? field.type : 'text'}
                  step={field.type === 'number' ? 'any' : undefined}
                  maxLength={2000}
                  disabled={disabled}
                  className={inputClass}
                  value={field.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                />
              )}
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              aria-label={`Remove field ${index + 1}`}
              disabled={disabled}
              className="btn-secondary text-sm"
              onClick={() => onChange(fields.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={disabled || fields.length >= 30}
          onClick={() => add([{ label: '', type: 'text', value: '' }])}
        >
          + Add a field
        </button>
        <select
          aria-label="Add common fields"
          className="btn-secondary text-sm"
          value=""
          disabled={disabled || fields.length >= 30}
          onChange={(e) => {
            if (templates[e.target.value]) add(templates[e.target.value]);
          }}
        >
          <option value="">Add common fields…</option>
          <option value="category">Category</option>
          <option value="edition">Edition / plan</option>
          <option value="o7" disabled={fields.length > 28}>
            O7 Pulse / Olivia fields
          </option>
        </select>
        {reusable.length ? (
          <select
            aria-label="Reuse fields from a product"
            className="btn-secondary max-w-full text-sm"
            value=""
            disabled={disabled || fields.length >= 30}
            onChange={(e) => {
              const source = reusable.find((p) => p.id === e.target.value);
              if (source?.extraFields) add(source.extraFields);
            }}
          >
            <option value="">Reuse fields from a product…</option>
            {reusable.map((product) => (
              <option
                key={product.id}
                value={product.id}
                disabled={fields.length + (product.extraFields?.length ?? 0) > 30}
              >
                {product.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}
