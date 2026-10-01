'use client';

import { useState } from 'react';
import { useApi, useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';

const labels = {
  fr: { label: 'Nouveau mot de passe', save: 'Définir le mot de passe', saved: 'Mot de passe enregistré.', hint: '8 caractères minimum, 72 octets maximum.', mismatch: 'Les mots de passe ne correspondent pas.', confirm: 'Confirmer le mot de passe' },
  en: { label: 'New password', save: 'Set password', saved: 'Password saved.', hint: 'At least 8 characters, at most 72 bytes.', mismatch: 'Passwords do not match.', confirm: 'Confirm password' },
  es: { label: 'Nueva contraseña', save: 'Establecer contraseña', saved: 'Contraseña guardada.', hint: 'Mínimo 8 caracteres, máximo 72 bytes.', mismatch: 'Las contraseñas no coinciden.', confirm: 'Confirmar contraseña' },
};

export function AdminPasswordForm({ endpoint, email }: { endpoint: string; email: string }) {
  const { token } = useAuth();
  const api = useApi(token);
  const { language, t } = useI18n();
  const copy = labels[language as keyof typeof labels] || labels.en;
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const valid = password.length >= 8 && new TextEncoder().encode(password).length <= 72;

  return <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={async (event) => {
    event.preventDefault();
    if (saving || !valid) return;
    setMessage('');
    setFailed(false);
    if (password !== confirmation) { setFailed(true); setMessage(copy.mismatch); return; }
    setSaving(true);
    try {
      await api(endpoint, { method: 'PATCH', body: JSON.stringify({ password }) });
      setPassword(''); setConfirmation(''); setMessage(copy.saved);
    } catch (err) { setFailed(true); setMessage(err instanceof Error ? err.message : 'Unable to save password'); }
    finally { setSaving(false); }
  }}>
    <input type="password" autoComplete="new-password" aria-label={`${copy.label} (${email})`} placeholder={copy.label} minLength={8} maxLength={72} required disabled={saving} value={password} onChange={(e) => { setPassword(e.target.value); setMessage(''); }} className="w-44 rounded-lg bg-black/20 px-2 py-2 text-xs ring-1 ring-white/10" />
    <input type="password" autoComplete="new-password" aria-label={`${copy.confirm} (${email})`} placeholder={copy.confirm} required disabled={saving} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="w-44 rounded-lg bg-black/20 px-2 py-2 text-xs ring-1 ring-white/10" />
    <button type="submit" disabled={saving || !valid || !confirmation} className="btn-secondary text-xs">{saving ? t('common.saving') : copy.save}</button>
    <p className="w-full text-xs text-slate-400">{copy.hint}</p>
    {message && <p role="status" className={`w-full text-xs ${failed ? 'text-red-300' : 'text-emerald-300'}`}>{message}</p>}
  </form>;
}
