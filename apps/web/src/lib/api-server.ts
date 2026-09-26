import "server-only";
import { type MeResponse } from "@atelier/shared";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Sunucu bileşenlerinden API çağrısı: kullanıcının oturum çerezi API'ye iletilir.
 * 401 → giriş ekranına yönlendirir.
 */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const ua = (await headers()).get("user-agent") ?? "";
  const res = await fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieHeader, "user-agent": ua, accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/giris");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  return (await res.json()) as T;
}

/** Oturumsuz (herkese açık) API çağrısı: çerez göndermez, 401'de yönlendirmez. Vitrin için. */
export async function apiPublicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  return (await res.json()) as T;
}

/** Oturumdaki kullanıcı; oturum yoksa giriş ekranına yönlendirir. */
export async function getMe(): Promise<MeResponse> {
  return apiGet<MeResponse>("/auth/me");
}

/** API'ye erişilemiyorsa hata fırlatmak yerine null döner (sağlık göstergesi için). */
export async function apiTry<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (e) {
    if (e instanceof Error && "digest" in e) throw e; // Next redirect/notFound
    return null;
  }
}
