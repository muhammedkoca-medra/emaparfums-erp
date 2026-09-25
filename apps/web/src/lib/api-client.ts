/** Tarayıcıdan API çağrısı: aynı kökteki /api yolu Next rewrite ile API'ye gider. */
export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

async function send<T>(method: "POST" | "PUT" | "PATCH", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new ClientApiError(res.status, data.message ?? "", data);
  return data as T;
}

export const apiPost = <T>(path: string, body?: unknown) => send<T>("POST", path, body);
export const apiPut = <T>(path: string, body?: unknown) => send<T>("PUT", path, body);
export const apiPatch = <T>(path: string, body?: unknown) => send<T>("PATCH", path, body);

/** API hatasından kullanıcıya gösterilecek metin (alan hatası varsa onu). */
export function errorText(err: unknown, fallback: string): string {
  if (!(err instanceof ClientApiError)) return fallback;
  const issue = (err.body as { issues?: { message: string }[] }).issues?.[0];
  return issue?.message ?? (err.message || fallback);
}
