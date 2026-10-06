"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useApi, useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { getClientDisplayName } from "@/lib/clients";
import { signatureApi, saveBlob } from "./api";
import { signatureLabels } from "./labels";
import { PdfPages } from "./PdfPages";
import type { Envelope, Field, Recipient } from "./types";

const input =
  "mt-1 w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10";
const colors = ["#22d3ee", "#c7f442", "#a78bfa", "#fb923c", "#f472b6"];
type Contact = {
  id: string;
  name: string;
  firstName?: string | null;
  email?: string | null;
  company?: string | null;
  companyName?: string | null;
};
function FieldBox({
  field,
  color,
  selected,
  onSelect,
  onMove,
}: {
  field: Field;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(
    null,
  );
  return (
    <button
      type="button"
      aria-label={`${field.type} · ${field.label || field.id}`}
      className="absolute flex touch-none items-center justify-center overflow-hidden border-2 text-xs font-semibold text-slate-950"
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.width * 100}%`,
        height: `${field.height * 100}%`,
        borderColor: color,
        backgroundColor: `${color}55`,
        outline: selected ? "2px solid #172033" : undefined,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          fx: field.x,
          fy: field.y,
        };
        onSelect();
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const rect = event.currentTarget.parentElement!.getBoundingClientRect();
        onMove(
          Math.max(
            0,
            Math.min(
              1 - field.width,
              drag.current.fx + (event.clientX - drag.current.x) / rect.width,
            ),
          ),
          Math.max(
            0,
            Math.min(
              1 - field.height,
              drag.current.fy + (event.clientY - drag.current.y) / rect.height,
            ),
          ),
        );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {field.label || field.type}
      {field.required ? " *" : ""}
    </button>
  );
}
export function SignatureWorkspace({
  templates,
}: {
  templates: { title: string; href: string }[];
}) {
  const { token, user } = useAuth();
  const api = useApi(token);
  const { language } = useI18n();
  const l = signatureLabels(language);
  const [items, setItems] = useState<Envelope[]>([]);
  const [mail, setMail] = useState<{
    configured: boolean;
    fromEmail: string | null;
  } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [doc, setDoc] = useState<Envelope | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [creating, setCreating] = useState(false);
  const [source, setSource] = useState<"text" | "upload">("text");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [fieldType, setFieldType] = useState<Field["type"]>("signature");
  const [recipientId, setRecipientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const vars = useMemo(
    () => [
      ...new Set(
        [...body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1]),
      ),
    ],
    [body],
  );
  const field = fields.find((f) => f.id === selected);
  const activeToken = useRef(token);
  activeToken.current = token;
  const load = async () => {
    if (!token) return;
    const [docs, config, clients] = await Promise.allSettled([
      signatureApi<Envelope[]>("", { token }),
      signatureApi<{ configured: boolean; fromEmail: string | null }>(
        "/settings",
        { token },
      ),
      api<Contact[]>("/clients"),
    ]);
    if (activeToken.current !== token) return;
    if (docs.status === "fulfilled") setItems(docs.value);
    else setError(docs.reason.message);
    if (config.status === "fulfilled") setMail(config.value);
    if (clients.status === "fulfilled") setContacts(clients.value);
  };
  useEffect(() => {
    setDoc(null);
    setBlob(null);
    setCreating(false);
    setItems([]);
    setMail(null);
    setContacts([]);
    void load();
  }, [token, user?.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    if (!token) return;
    const [e, pdf] = await Promise.all([
      signatureApi<Envelope>(`/${id}`, { token }),
      signatureApi<Blob>(`/${id}/pdf`, { token, blob: true }),
    ]);
    setDoc(e);
    setTitle(e.title);
    setRecipients(e.recipients);
    setFields(e.fields);
    setRecipientId(e.recipients[0]?.id || "");
    setSelected(null);
    setBlob(
      e.status === "COMPLETED"
        ? await signatureApi<Blob>(`/${id}/pdf?signed=true`, {
            token,
            blob: true,
          })
        : pdf,
    );
    setCreating(false);
  };
  const start = () => {
    setDoc(null);
    setBlob(null);
    setCreating(true);
    setTitle("");
    setBody("");
    const now = new Date();
    setVariables({
      tenant_name: user?.tenantName || "",
      sender_name: user?.name || "",
      sender_email: user?.email || "",
      service_start_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    });
    setError("");
  };
  const create = () =>
    run(async () => {
      if (!token) return;
      let e: Envelope;
      if (source === "upload") {
        if (!file) throw new Error(l.upload);
        const form = new FormData();
        form.append("file", file);
        form.append("title", title);
        form.append("language", language);
        e = await signatureApi<Envelope>("/upload", {
          token,
          method: "POST",
          body: form,
        });
      } else {
        if (vars.some((key) => !variables[key]?.trim()))
          throw new Error(l.variables);
        e = await signatureApi<Envelope>("", {
          token,
          method: "POST",
          body: { title, text: body, variables, language },
        });
      }
      await open(e.id);
      await load();
    });
  const patchField = (id: string, update: Partial<Field>) =>
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...update } : f)),
    );
  const save = async () => {
    if (!token || !doc) return;
    const e = await signatureApi<Envelope>(`/${doc.id}`, {
      token,
      method: "PATCH",
      body: {
        title,
        recipients: recipients.map(({ id, name, email }) => ({
          id,
          name,
          email,
        })),
        fields,
      },
    });
    setDoc(e);
    setRecipients(e.recipients);
    setFields(e.fields);
    await load();
  };
  const action = (path: string) =>
    run(async () => {
      if (!token || !doc) return;
      if (path === "send") await save();
      const e = await signatureApi<Envelope>(`/${doc.id}/${path}`, {
        token,
        method: "POST",
      });
      setDoc(e);
      setRecipients(e.recipients);
      setFields(e.fields);
      if (e.recipients.some((r) => r.delivery === "FAILED"))
        setError(l.deliveryFailed);
      if (e.completionDelivery === "FAILED") setError(l.mailFailed);
      await load();
    });
  const download = (signed: boolean) =>
    run(async () => {
      if (!token || !doc) return;
      saveBlob(
        await signatureApi<Blob>(
          `/${doc.id}/pdf${signed ? "?signed=true" : ""}`,
          { token, blob: true },
        ),
        signed ? "signed-document.pdf" : "document.pdf",
      );
    });
  const addRecipient = () => {
    const id = crypto.randomUUID();
    setRecipients((prev) => [...prev, { id, name: "", email: "" }]);
    setRecipientId(id);
  };
  const editable = doc?.status === "DRAFT";
  const statusLabel = (status: Envelope["status"]) =>
    ({ DRAFT: l.draft, SENT: l.sent, COMPLETED: l.completed, VOID: l.void })[
      status
    ];
  return (
    <section aria-label={l.title} className="mb-8 space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{l.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{l.hint}</p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={start}
            disabled={busy}
          >
            {l.new}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {l.mail}: {mail?.fromEmail || "—"}
        </p>
        {mail && !mail.configured && (
          <div className="mt-3 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200">
            {l.notConfigured}{" "}
            <Link className="underline" href="/admin/benchmarking">
              {l.configure}
            </Link>
          </div>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded bg-red-500/15 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-300">
          {notice}
        </p>
      )}
      {creating && (
        <div className="card space-y-4 p-5">
          <label className="block text-sm">
            {l.document}
            <input
              aria-label={l.document}
              className={input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={source === "text" ? "btn-primary" : "btn-secondary"}
              onClick={() => setSource("text")}
            >
              {l.new}
            </button>
            <button
              type="button"
              className={source === "upload" ? "btn-primary" : "btn-secondary"}
              onClick={() => setSource("upload")}
            >
              {l.upload}
            </button>
          </div>
          {source === "upload" ? (
            <input
              type="file"
              accept="application/pdf,.pdf"
              aria-label={l.upload}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  {l.template}
                  <select
                    className={input}
                    defaultValue=""
                    onChange={(e) =>
                      void run(async () => {
                        if (!e.target.value) return;
                        const res = await fetch(e.target.value);
                        if (!res.ok) throw new Error("Template unavailable");
                        setBody(await res.text());
                      })
                    }
                  >
                    <option value="">—</option>
                    {templates
                      .filter((t) => t.href.startsWith("/contracts/"))
                      .map((tpl, i) => (
                        <option key={i} value={tpl.href}>
                          {tpl.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm">
                  {l.client}
                  <select
                    className={input}
                    defaultValue=""
                    onChange={(e) => {
                      const client = contacts.find(
                        (c) => c.id === e.target.value,
                      );
                      if (client)
                        setVariables((prev) => ({
                          ...prev,
                          customer_legal_name:
                            client.company || client.companyName || getClientDisplayName(client),
                          customer_contact_name: getClientDisplayName(client),
                          customer_contact_email: client.email || "",
                        }));
                    }}
                  >
                    <option value="">{l.none}</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getClientDisplayName(c)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                {l.text}
                <textarea
                  aria-label={l.text}
                  className={input + " min-h-64 font-mono"}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={60000}
                  placeholder="{{customer_legal_name}}\n{{customer_contact_email}}\n…"
                />
              </label>
              {vars.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">{l.variables}</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {vars.map((key) => (
                      <label key={key} className="text-xs">
                        {key}
                        <input
                          className={input}
                          value={variables[key] || ""}
                          onChange={(e) =>
                            setVariables((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <button
            type="button"
            className="btn-primary disabled:opacity-40"
            onClick={create}
            disabled={
              busy ||
              !title.trim() ||
              (source === "text" ? !body.trim() : !file)
            }
          >
            {busy ? l.busy : l.generate}
          </button>
        </div>
      )}
      {doc && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h3 className="font-semibold">{doc.title}</h3>
              <p className="text-sm text-cyan-300">{statusLabel(doc.status)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setDoc(null);
                  setBlob(null);
                }}
              >
                {l.back}
              </button>
              {editable && (
                <>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => void run(save)}
                  >
                    {l.save}
                  </button>
                  <button
                    className="btn-primary disabled:opacity-40"
                    disabled={busy || !mail?.configured}
                    onClick={() => action("send")}
                  >
                    {busy ? l.busy : l.send}
                  </button>
                </>
              )}
              {doc.status === "SENT" && (
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => action("resend")}
                >
                  {l.resend}
                </button>
              )}
              {doc.status !== "VOID" && doc.status !== "COMPLETED" && (
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => action("void")}
                >
                  {l.cancel}
                </button>
              )}
              {doc.status === "COMPLETED" && (
                <>
                  <button
                    className="btn-primary"
                    onClick={() => download(true)}
                    disabled={busy}
                  >
                    {l.download}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => action("resend-completed")}
                    disabled={busy}
                  >
                    {l.resendCompleted}
                  </button>
                </>
              )}
              <button
                className="btn-secondary"
                onClick={() => download(false)}
                disabled={busy}
              >
                {l.downloadOriginal}
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  void run(async () => {
                    if (token)
                      saveBlob(
                        new Blob(
                          [
                            JSON.stringify(
                              await signatureApi(`/${doc.id}/audit`, { token }),
                              null,
                              2,
                            ),
                          ],
                          { type: "application/json" },
                        ),
                        "signature-event-record.json",
                      );
                  })
                }
                disabled={busy}
              >
                {l.audit}
              </button>
            </div>
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
            <aside className="card space-y-4 p-4">
              {editable && (
                <label className="block text-sm">
                  {l.document}
                  <input
                    className={input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
              )}
              <h3 className="font-semibold">{l.recipient}</h3>
              {recipients.map((r, i) => (
                <div
                  key={r.id}
                  className="rounded border p-3"
                  style={{ borderColor: colors[i] }}
                >
                  {editable ? (
                    <>
                      <label className="block text-xs">
                        {l.name}
                        <input
                          className={input}
                          value={r.name}
                          onChange={(e) =>
                            setRecipients((prev) =>
                              prev.map((x) =>
                                x.id === r.id
                                  ? { ...x, name: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="mt-2 block text-xs">
                        {l.email}
                        <input
                          type="email"
                          className={input}
                          value={r.email}
                          onChange={(e) =>
                            setRecipients((prev) =>
                              prev.map((x) =>
                                x.id === r.id
                                  ? { ...x, email: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        className="mt-2 text-xs text-red-300"
                        onClick={() => {
                          setRecipients((prev) =>
                            prev.filter((x) => x.id !== r.id),
                          );
                          setFields((prev) =>
                            prev.filter((f) => f.recipientId !== r.id),
                          );
                          if (recipientId === r.id)
                            setRecipientId(
                              recipients.find((x) => x.id !== r.id)?.id || "",
                            );
                        }}
                      >
                        {l.remove}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="break-all text-xs text-slate-400">
                        {r.email}
                      </p>
                      <p className="mt-2 text-xs">
                        {r.signedAt
                          ? `${l.completed} · ${new Date(r.signedAt).toLocaleString()}`
                          : l.notSigned}
                      </p>
                      <p
                        className={
                          "mt-1 text-xs " +
                          (r.delivery === "FAILED"
                            ? "text-red-300"
                            : "text-slate-400")
                        }
                      >
                        {r.delivery === "SENT"
                          ? l.mailAccepted
                          : r.delivery === "FAILED"
                            ? l.mailError
                            : l.mailPending}
                      </p>
                    </>
                  )}
                </div>
              ))}
              {editable && (
                <>
                  <button
                    className="btn-secondary w-full text-sm"
                    onClick={addRecipient}
                    disabled={recipients.length >= 5}
                  >
                    {l.addRecipient}
                  </button>
                  <label className="block text-sm">
                    {l.recipient}
                    <select
                      className={input}
                      value={recipientId}
                      onChange={(e) => setRecipientId(e.target.value)}
                    >
                      <option value="">—</option>
                      {recipients.map((r, i) => (
                        <option key={r.id} value={r.id}>
                          {r.name || `${l.recipient} ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    {l.fieldType}
                    <select
                      className={input}
                      value={fieldType}
                      onChange={(e) =>
                        setFieldType(e.target.value as Field["type"])
                      }
                    >
                      <option value="signature">{l.signature}</option>
                      <option value="initials">{l.initials}</option>
                      <option value="date">{l.date}</option>
                      <option value="text">{l.fieldText}</option>
                    </select>
                  </label>
                  <p className="text-xs text-slate-400">{l.place}</p>
                  {field && (
                    <div className="space-y-3 border-t border-white/10 pt-3">
                      <h4 className="text-sm font-semibold">{l.selected}</h4>
                      <input
                        aria-label="Field label"
                        className={input}
                        value={field.label}
                        onChange={(e) =>
                          patchField(field.id, { label: e.target.value })
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        {(["x", "y", "width", "height"] as const).map((key) => (
                          <label key={key} className="text-xs">
                            {l[key]}
                            <input
                              className={input}
                              type="number"
                              step="0.5"
                              min={
                                key === "width" ? 4 : key === "height" ? 1.5 : 0
                              }
                              max={100}
                              value={Number((field[key] * 100).toFixed(1))}
                              onChange={(e) => {
                                const n = Math.max(
                                  key === "width"
                                    ? 0.04
                                    : key === "height"
                                      ? 0.015
                                      : 0,
                                  Math.min(1, Number(e.target.value) / 100),
                                );
                                const update =
                                  key === "x"
                                    ? { x: Math.min(n, 1 - field.width) }
                                    : key === "y"
                                      ? { y: Math.min(n, 1 - field.height) }
                                      : key === "width"
                                        ? { width: Math.min(n, 1 - field.x) }
                                        : { height: Math.min(n, 1 - field.y) };
                                patchField(field.id, update);
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            patchField(field.id, { required: e.target.checked })
                          }
                        />
                        {l.required}
                      </label>
                      {field.type === "text" && (
                        <label className="block text-xs">
                          {l.preset}
                          <input
                            className={input}
                            value={field.preset || ""}
                            onChange={(e) =>
                              patchField(field.id, {
                                preset: e.target.value || undefined,
                              })
                            }
                          />
                        </label>
                      )}
                      <button
                        className="text-sm text-red-300"
                        onClick={() => {
                          setFields((prev) =>
                            prev.filter((f) => f.id !== field.id),
                          );
                          setSelected(null);
                        }}
                      >
                        {l.remove}
                      </button>
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-slate-500">
                {fields.length} · {l.fields}
              </p>
            </aside>
            <div className="min-w-0">
              {blob && (
                <PdfPages
                  blob={blob}
                  onPlace={
                    editable
                      ? (page, x, y) => {
                          if (!recipientId) return;
                          const id = crypto.randomUUID(),
                            width = fieldType === "initials" ? 0.12 : 0.28,
                            height = fieldType === "signature" ? 0.065 : 0.035;
                          setFields((prev) => [
                            ...prev,
                            {
                              id,
                              page,
                              x: Math.min(x, 1 - width),
                              y: Math.min(y, 1 - height),
                              width,
                              height,
                              type: fieldType,
                              recipientId,
                              label:
                                fieldType === "text"
                                  ? l.fieldText
                                  : l[fieldType],
                              required: true,
                            },
                          ]);
                          setSelected(id);
                        }
                      : undefined
                  }
                  overlay={(page) =>
                    fields
                      .filter((f) => doc.status !== "COMPLETED" && f.page === page)
                      .map((f) => (
                        <FieldBox
                          key={f.id}
                          field={f}
                          selected={selected === f.id}
                          color={
                            colors[
                              Math.max(
                                0,
                                recipients.findIndex(
                                  (r) => r.id === f.recipientId,
                                ),
                              )
                            ]
                          }
                          onSelect={() => editable && setSelected(f.id)}
                          onMove={(x, y) =>
                            editable && patchField(f.id, { x, y })
                          }
                        />
                      ))
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}
      {!doc && !creating && (
        <div className="card overflow-x-auto p-5">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">{l.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="p-2">{l.document}</th>
                  <th className="p-2">{l.status}</th>
                  <th className="p-2">{l.recipient}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-t border-white/10">
                    <td className="p-2">{e.title}</td>
                    <td className="p-2">
                      {statusLabel(e.status)}
                      {e.recipients.some((r) => r.delivery === "FAILED") && (
                        <p className="text-xs text-red-300">{l.mailError}</p>
                      )}
                    </td>
                    <td className="p-2">
                      {e.recipients.filter((r) => r.signedAt).length} /{" "}
                      {e.recipients.length}
                    </td>
                    <td className="p-2">
                      <button
                        className="btn-secondary text-sm"
                        disabled={busy}
                        onClick={() => void run(() => open(e.id))}
                      >
                        {l.open}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
