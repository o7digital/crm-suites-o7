"use client";
import { useEffect, useState } from "react";
import { signatureApi, saveBlob } from "./api";
import { signatureLabels } from "./labels";
import { PdfPages } from "./PdfPages";
import { SignaturePad } from "./SignaturePad";
import type { Envelope, Value, Field } from "./types";

type Landing = {
  title: string;
  tenantName: string;
  name: string;
  email: string;
  signed: boolean;
  language: string;
  status: string;
};
type SigningDocument = Envelope & { recipientId: string };
const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950";
export function SigningPage({ token }: { token: string }) {
  const [landing, setLanding] = useState<Landing | null>(null);
  const [session, setSession] = useState("");
  const [doc, setDoc] = useState<SigningDocument | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [values, setValues] = useState<Record<string, Value>>({});
  const [modes, setModes] = useState<Record<string, "type" | "draw">>({});
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const l = signatureLabels(landing?.language || "en");
  useEffect(() => {
    let active = true;
    setLanding(null);
    setDoc(null);
    setPdf(null);
    setSession("");
    setValues({});
    setConsent(false);
    signatureApi<Landing>(`/public/${token}`)
      .then((v) => {
        if (active) setLanding(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  useEffect(() => {
    if (doc?.status !== "COMPLETED" || !session) return;
    let active = true;
    signatureApi<Blob>(`/public/${token}/pdf?signed=true`, {
      session,
      blob: true,
    })
      .then((blob) => {
        if (active) setPdf(blob);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [doc?.status, session, token]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };
  const verified = async (signingSession: string) => {
    const [metadata, blob] = await Promise.all([
      signatureApi<SigningDocument>(`/public/${token}/document`, {
        session: signingSession,
      }),
      signatureApi<Blob>(`/public/${token}/pdf`, {
        session: signingSession,
        blob: true,
      }),
    ]);
    setSession(signingSession);
    setDoc(metadata);
    setPdf(blob);
  };
  const mine = doc?.recipients.find((r) => r.id === doc.recipientId);
  const signed = !!mine?.signedAt;
  const missing = doc?.fields.some(
    (f) =>
      f.required &&
      f.type !== "date" &&
      f.preset === undefined &&
      !values[f.id]?.text?.trim() &&
      !values[f.id]?.image,
  );
  const update = (id: string, value: Value) =>
    setValues((prev) => ({ ...prev, [id]: value }));
  const fieldLabel = (f: Field) =>
    f.label || (f.type === "text" ? l.fieldText : l[f.type]);
  const download = () =>
    run(async () =>
      saveBlob(
        await signatureApi<Blob>(`/public/${token}/pdf?signed=true`, {
          session,
          blob: true,
        }),
        "signed-document.pdf",
      ),
    );
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-2xl bg-slate-950 p-6 text-white">
          <p className="text-sm font-semibold text-lime-300">
            o7 PulseCRM · {l.title}
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            {landing?.title || l.title}
          </h1>
          {landing && (
            <p className="mt-2 text-sm text-slate-300">
              {landing.tenantName} · {landing.name} · {landing.email}
            </p>
          )}
        </header>
        {error && (
          <p role="alert" className="rounded-lg bg-red-100 p-4 text-red-900">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-emerald-100 p-4 text-emerald-900"
          >
            {notice}
          </p>
        )}
        {landing && !doc && (
          <section className="mx-auto max-w-xl space-y-5 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{l.verifyTitle}</h2>
            <p className="text-sm text-slate-600">
              {l.verifyHint} {l.password}
            </p>
            <button
              className="rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-40"
              disabled={busy || wait > 0}
              onClick={() =>
                void run(async () => {
                  await signatureApi(`/public/${token}/code`, {
                    method: "POST",
                  });
                  setWait(60);
                  setNotice(l.codeSent);
                })
              }
            >
              {l.requestCode}
              {wait > 0 ? ` (${wait}s)` : ""}
            </button>
            <label className="block text-sm">
              {l.code}
              <input
                className={input}
                aria-label={l.code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <button
              className="rounded-lg bg-lime-300 px-4 py-3 font-semibold disabled:opacity-40"
              disabled={busy || code.length !== 6}
              onClick={() =>
                void run(async () => {
                  const result = await signatureApi<{ session: string }>(
                    `/public/${token}/verify`,
                    { method: "POST", body: { code } },
                  );
                  await verified(result.session);
                  setCode("");
                })
              }
            >
              {busy ? l.busy : l.verify}
            </button>
          </section>
        )}
        {doc && (
          <>
            {signed && (
              <section className="rounded-xl bg-emerald-100 p-5">
                <h2 className="font-semibold">{l.signed}</h2>
                <p className="mt-2 text-sm">
                  {doc.status === "COMPLETED" ? l.allSigned : l.waiting}
                </p>
                {doc.status === "COMPLETED" ? (
                  <button
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
                    disabled={busy}
                    onClick={download}
                  >
                    {l.download}
                  </button>
                ) : (
                  <button
                    className="mt-4 rounded-lg border border-emerald-700 px-4 py-2"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        setDoc(
                          await signatureApi<SigningDocument>(
                            `/public/${token}/document`,
                            { session },
                          ),
                        ),
                      )
                    }
                  >
                    {landing?.language === "fr"
                      ? "Actualiser"
                      : landing?.language === "es"
                        ? "Actualizar"
                        : "Refresh"}
                  </button>
                )}
              </section>
            )}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                {pdf && (
                  <PdfPages
                    blob={pdf}
                    overlay={(page) =>
                      !signed &&
                      doc.fields
                        .filter((f) => f.page === page)
                        .map((f) => (
                          <button
                            key={f.id}
                            className="absolute flex items-center justify-center overflow-hidden border border-cyan-600 bg-cyan-100/70 text-xs text-slate-950"
                            style={{
                              left: `${f.x * 100}%`,
                              top: `${f.y * 100}%`,
                              width: `${f.width * 100}%`,
                              height: `${f.height * 100}%`,
                            }}
                            onClick={() =>
                              document
                                .getElementById(`field-${f.id}`)
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                })
                            }
                          >
                            {values[f.id]?.image ? (
                              <img
                                alt={l.signature}
                                src={values[f.id].image}
                                className="h-full w-full object-contain"
                              />
                            ) : f.type === "date" ? (
                              new Date().toISOString().slice(0, 10)
                            ) : (
                              (f.preset ?? values[f.id]?.text ?? fieldLabel(f))
                            )}
                          </button>
                        ))
                    }
                  />
                )}
              </div>
              {!signed && (
                <aside className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
                  <h2 className="font-semibold">{l.fields}</h2>
                  {doc.fields.map((f) => (
                    <div
                      id={`field-${f.id}`}
                      key={f.id}
                      className="border-b border-slate-100 pb-4"
                    >
                      <label className="block text-sm font-medium">
                        {fieldLabel(f)}
                        {f.required ? " *" : ""}
                      </label>
                      {f.type === "date" ? (
                        <p className="mt-2 text-sm text-slate-600">
                          {new Date().toISOString().slice(0, 10)}
                        </p>
                      ) : f.preset !== undefined ? (
                        <p className="mt-2 text-sm">{f.preset}</p>
                      ) : (
                        <>
                          {f.type === "signature" && (
                            <div className="my-2 flex gap-2">
                              {(["type", "draw"] as const).map((mode) => (
                                <button
                                  key={mode}
                                  className={
                                    "rounded border px-3 py-1 text-sm " +
                                    ((modes[f.id] || "type") === mode
                                      ? "border-cyan-700 bg-cyan-50"
                                      : "border-slate-200")
                                  }
                                  onClick={() => {
                                    setModes((prev) => ({
                                      ...prev,
                                      [f.id]: mode,
                                    }));
                                    update(f.id, {});
                                  }}
                                >
                                  {l[mode]}
                                </button>
                              ))}
                            </div>
                          )}
                          {f.type === "signature" && modes[f.id] === "draw" ? (
                            <SignaturePad
                              clearLabel={l.clear}
                              onChange={(image) =>
                                update(f.id, image ? { image } : {})
                              }
                            />
                          ) : (
                            <input
                              aria-label={fieldLabel(f)}
                              className={input}
                              value={values[f.id]?.text || ""}
                              placeholder={
                                f.type === "initials"
                                  ? landing?.name
                                      .split(/\s+/)
                                      .map((w) => w[0])
                                      .join("")
                                      .toUpperCase()
                                  : f.type === "signature"
                                    ? landing?.name
                                    : ""
                              }
                              maxLength={f.type === "initials" ? 12 : 300}
                              onChange={(e) =>
                                update(f.id, {
                                  text:
                                    f.type === "initials"
                                      ? e.target.value
                                          .replace(/[^\p{L}]/gu, "")
                                          .toUpperCase()
                                      : e.target.value,
                                })
                              }
                            />
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  <label className="flex gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    {l.consent}
                  </label>
                  <button
                    className="w-full rounded-lg bg-lime-300 px-4 py-3 font-semibold disabled:opacity-40"
                    disabled={busy || !consent || missing}
                    onClick={() =>
                      void run(async () => {
                        await signatureApi(`/public/${token}/sign`, {
                          session,
                          method: "POST",
                          body: { consent, values },
                        });
                        setDoc(
                          await signatureApi<SigningDocument>(
                            `/public/${token}/document`,
                            { session },
                          ),
                        );
                        setNotice(l.signed);
                      })
                    }
                  >
                    {busy ? l.busy : l.sign}
                  </button>
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
