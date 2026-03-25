"use client";

import { FormEvent, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { getClientDisplayName } from "../lib/clients";

export type ClientCollaborator = {
  id: string;
  firstName?: string | null;
  name: string;
  function?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  comments?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientCollaboratorCreatePayload = {
  firstName?: string;
  name: string;
  function?: string;
  email?: string;
  whatsapp?: string;
  comments?: string;
};

type Props = {
  collaborators: ClientCollaborator[];
  onAdd: (payload: ClientCollaboratorCreatePayload) => Promise<void>;
  onDelete: (collaboratorId: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

function toOptionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function ClientCollaboratorsSection({
  collaborators,
  onAdd,
  onDelete,
  disabled = false,
  className = "card p-5",
}: Props) {
  const { t } = useI18n();
  const [firstName, setFirstName] = useState("");
  const [name, setName] = useState("");
  const [jobFunction, setJobFunction] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const trimmedFirstName = toOptionalTrimmed(firstName);
      const trimmedName = toOptionalTrimmed(name) ?? trimmedFirstName;
      if (!trimmedName) {
        throw new Error(t("clients.collaborators.nameRequired"));
      }

      await onAdd({
        firstName:
          trimmedFirstName && trimmedFirstName !== trimmedName
            ? trimmedFirstName
            : undefined,
        name: trimmedName,
        function: toOptionalTrimmed(jobFunction),
        email: toOptionalTrimmed(email),
        whatsapp: toOptionalTrimmed(whatsapp),
        comments: toOptionalTrimmed(comments),
      });

      setFirstName("");
      setName("");
      setJobFunction("");
      setEmail("");
      setWhatsapp("");
      setComments("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to save collaborator";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (collaboratorId: string) => {
    const ok = confirm(t("clients.collaborators.confirmDelete"));
    if (!ok) return;
    setError(null);
    setDeletingId(collaboratorId);
    try {
      await onDelete(collaboratorId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to delete collaborator";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">
            {t("clients.collaborators.title")}
          </p>
          <p className="text-xs text-slate-500">
            {t("clients.collaborators.description")}
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {collaborators.length} {t("clients.collaborators.count")}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {collaborators.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t("clients.collaborators.empty")}
          </p>
        ) : (
          collaborators.map((collaborator) => (
            <div
              key={collaborator.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-100">
                    {getClientDisplayName(collaborator)}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {collaborator.function || "—"}
                    {collaborator.email ? ` · ${collaborator.email}` : ""}
                    {collaborator.whatsapp
                      ? ` · ${t("field.whatsapp")}: ${collaborator.whatsapp}`
                      : ""}
                  </p>
                  {collaborator.comments ? (
                    <p className="mt-2 text-sm text-slate-300">
                      {collaborator.comments}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                  onClick={() => void handleDelete(collaborator.id)}
                  disabled={disabled || deletingId === collaborator.id}
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm text-slate-300">
            {t("field.firstName")}
          </label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            autoComplete="given-name"
            disabled={disabled || saving}
          />
        </div>
        <div>
          <label className="text-sm text-slate-300">{t("field.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            autoComplete="family-name"
            disabled={disabled || saving}
          />
        </div>
        <div>
          <label className="text-sm text-slate-300">
            {t("field.function")}
          </label>
          <input
            value={jobFunction}
            onChange={(e) => setJobFunction(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            disabled={disabled || saving}
          />
        </div>
        <div>
          <label className="text-sm text-slate-300">{t("field.email")}</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            type="email"
            autoComplete="email"
            disabled={disabled || saving}
          />
        </div>
        <div>
          <label className="text-sm text-slate-300">
            {t("field.whatsapp")}
          </label>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            autoComplete="tel"
            disabled={disabled || saving}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm text-slate-300">
            {t("field.comments")}
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-400"
            rows={3}
            disabled={disabled || saving}
          />
        </div>
        {error ? (
          <div className="md:col-span-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            className="btn-primary"
            disabled={disabled || saving}
          >
            {saving ? t("common.saving") : t("clients.collaborators.add")}
          </button>
        </div>
      </form>
    </section>
  );
}
