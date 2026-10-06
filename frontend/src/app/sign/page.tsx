"use client";
import { useEffect, useState } from "react";
import { SigningPage } from "@/components/signatures/SigningPage";

// The legacy Vercel multi-build router forwards /sign/<token> to this static
// entry point. Read the original browser path so bearer tokens stay out of
// server-rendered HTML and do not rely on dynamic function routing.
export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(
      window.location.pathname.match(/^\/sign\/([a-f0-9]{64})\/?$/)?.[1] || "",
    );
  }, []);
  if (token === null)
    return (
      <main className="min-h-screen bg-slate-100 p-8 text-slate-900">
        o7 · Signature…
      </main>
    );
  if (!token)
    return (
      <main className="min-h-screen bg-slate-100 p-8 text-slate-900">
        o7 · Signature link unavailable
      </main>
    );
  return <SigningPage key={token} token={token} />;
}
