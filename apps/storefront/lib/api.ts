// API access. Server components call the API directly (short revalidation for public catalog
// content); anything that authorises a purchase (quote, order) is always fetched live.
import type { ApiErrorBody } from "@restaurant-os/types";

export const PUBLIC_API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const SERVER_API = (process.env.API_INTERNAL_URL ?? PUBLIC_API).replace(/\/$/, "");

export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}, readonly requestId: string | null = null) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  let body: ApiErrorBody | null = null;
  try { body = (await res.json()) as ApiErrorBody; } catch { /* non-JSON error */ }
  const e = body?.error;
  throw new ApiRequestError(res.status, e?.code ?? "NETWORK_ERROR", e?.message ?? "Something went wrong. Please try again.", e?.details ?? {}, e?.requestId ?? res.headers.get("x-request-id"));
}

/** Server-side GET with incremental revalidation (seconds). Returns null for 404. */
export async function serverGet<T>(path: string, revalidate = 30): Promise<T | null> {
  const res = await fetch(`${SERVER_API}${path}`, { next: { revalidate } });
  if (res.status === 404) return null;
  return parse<T>(res);
}

/** Browser request to the public API. */
export async function clientRequest<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PUBLIC_API}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiRequestError(0, "NETWORK_ERROR", "We couldn't reach the restaurant. Check your connection and try again.");
  }
  return parse<T>(res);
}
