"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { apiBaseForRequests } from "../../../lib/apiBase";

type Preview = { email: string; workspace: string; scopes: string[] };
type Connection = {
  id: string;
  scopes: string[];
  timeZone: string;
  createdAt: string;
  revokedAt: string | null;
};
export default function PulseConnectPage() {
  const { token, loading, isImpersonating } = useAuth();
  const [request, setRequest] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [zone, setZone] = useState("");
  const [confirmedZone, setConfirmedZone] = useState(false);
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setRequest(
      new URLSearchParams(window.location.search).get("request") || "",
    );
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  useEffect(() => {
    if (!token) return;
    const id = new URLSearchParams(window.location.search).get("request");
    fetch(
      `${apiBaseForRequests()}/oauth/${id ? `requests/${encodeURIComponent(id)}` : "connections"}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(
            typeof data.message === "string"
              ? data.message
              : "No se pudo cargar la conexión",
          );
        return data;
      })
      .then((data) => (id ? setPreview(data) : setConnections(data)))
      .catch((e) => setError(e.message));
  }, [token]);
  async function decide(allow: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `${apiBaseForRequests()}/oauth/requests/${encodeURIComponent(request)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ allow, write, timeZone: zone }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "No se pudo autorizar");
      window.location.assign(data.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `${apiBaseForRequests()}/oauth/connections/${id}/revoke`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) throw new Error("No se pudo revocar");
      setConnections((cs) =>
        cs.map((c) =>
          c.id === id ? { ...c, revokedAt: new Date().toISOString() } : c,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setBusy(false);
  }
  return (
    <main className="mx-auto max-w-xl p-8 space-y-5">
      <h1 className="text-2xl font-semibold">Conectar Pulse con ChatGPT</h1>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {loading ? (
        <p>Cargando sesión…</p>
      ) : !token ? (
        <>
          <p>
            Inicia sesión con tu propia cuenta Pulse. Después vuelve a esta
            pestaña para revisar y autorizar la conexión.
          </p>
          <Link
            href={`/login?returnTo=${encodeURIComponent("/connect/pulse" + (request ? `?request=${request}` : ""))}`}
            className="btn-primary"
          >
            Iniciar sesión en Pulse
          </Link>
        </>
      ) : isImpersonating ? (
        <p>
          Sal del acceso de soporte e inicia sesión con tu propia cuenta para
          conectar ChatGPT.
        </p>
      ) : request ? (
        preview && (
          <>
            <p>
              ChatGPT accederá a <strong>{preview.workspace}</strong> como{" "}
              <strong>{preview.email}</strong>.
            </p>
            <p>
              Permites consultar tus contactos, oportunidades, pipelines y
              tareas visibles. Puedes revocar el acceso en cualquier momento
              desde tu cuenta Pulse.
            </p>
            {preview.scopes.includes("pulse:write") && (
              <label className="block">
                <input
                  type="checkbox"
                  checked={write}
                  onChange={(e) => setWrite(e.target.checked)}
                />{" "}
                Permitir crear y modificar contactos, oportunidades y tareas con
                mis permisos.
              </label>
            )}
            <label className="block">
              Zona horaria para fechas como «el martes»
              <input
                aria-label="Zona horaria"
                className="block w-full bg-slate-800 p-2 rounded"
                value={zone}
                onChange={(e) => {
                  setZone(e.target.value);
                  setConfirmedZone(false);
                }}
              />
            </label>
            <label className="block">
              <input
                type="checkbox"
                checked={confirmedZone}
                onChange={(e) => setConfirmedZone(e.target.checked)}
              />{" "}
              Confirmo que esta zona horaria es la que quiero usar para mis
              relances.
            </label>
            {preview.scopes.includes("offline_access") && (
              <p>
                La conexión podrá renovar el acceso durante un máximo de 30 días
                por renovación, hasta que la revoques.
              </p>
            )}
            <div className="flex gap-3">
              <button
                className="btn-primary"
                disabled={busy || !confirmedZone || !zone}
                onClick={() => decide(true)}
              >
                Autorizar conexión
              </button>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Cancelar
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <p>Mis conexiones individuales</p>
          {connections.length === 0 && <p>No hay conexiones autorizadas.</p>}
          {connections.map((c) => (
            <div className="card p-4 space-y-2" key={c.id}>
              <p>ChatGPT · {c.timeZone}</p>
              <p>{c.scopes.join(", ")}</p>
              <p>{new Date(c.createdAt).toLocaleString()}</p>
              {c.revokedAt ? (
                <p>Revocada</p>
              ) : (
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => revoke(c.id)}
                >
                  Revocar acceso
                </button>
              )}
            </div>
          ))}
        </>
      )}
      <Link href="/account" className="block underline">
        Mi cuenta Pulse
      </Link>
    </main>
  );
}
