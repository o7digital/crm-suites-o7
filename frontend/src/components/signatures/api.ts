import { apiBaseForRequests } from "@/lib/apiBase";
export async function signatureApi<T>(
  path: string,
  options: {
    token?: string;
    session?: string;
    method?: string;
    body?: unknown;
    blob?: boolean;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.session) headers["X-Signing-Session"] = options.session;
  const form = options.body instanceof FormData;
  if (options.body !== undefined && !form)
    headers["Content-Type"] = "application/json";
  const res = await fetch(`${apiBaseForRequests()}/signatures${path}`, {
    method: options.method || "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : form
          ? (options.body as FormData)
          : JSON.stringify(options.body),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const error = await res.json();
      message = Array.isArray(error.message)
        ? error.message.join(" · ")
        : error.message || message;
    } catch {}
    throw new Error(message);
  }
  return (options.blob ? await res.blob() : await res.json()) as T;
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
