"use client";
// Authenticated API client: Clerk session token + the selected tenant on every request.
import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import type { ApiErrorBody } from "@restaurant-os/types";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const STOREFRONT_URL = (process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}, readonly requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
  }
  /** Field errors from VALIDATION_FAILED or domain errors, keyed by the last path segment. */
  get fields(): Record<string, string> {
    const f = (this.details.fields ?? {}) as Record<string, string>;
    return Object.fromEntries(Object.entries(f).map(([k, v]) => [k.split(".").pop() ?? k, v]));
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  tenant?: string | null;
}

export function useApiRequest(tenantId: string | null) {
  const { getToken } = useAuth();
  return useCallback(async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
    const token = await getToken();
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const tenant = options.tenant === undefined ? tenantId : options.tenant;
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: options.method ?? (options.body ? "POST" : "GET"),
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { "x-tenant-id": tenant } : {}),
          ...(options.body && !isForm ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
        body: options.body ? (isForm ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
        cache: "no-store",
      });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection.");
    }
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    let body: ApiErrorBody | null = null;
    try { body = (await res.json()) as ApiErrorBody; } catch { /* non-JSON */ }
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? `Request failed (${res.status}).`, e?.details ?? {}, e?.requestId ?? res.headers.get("x-request-id"));
  }, [getToken, tenantId]);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Rupees typed by a merchant -> paise. Accepts "249", "249.5", "₹1,299.00". */
export function toMinor(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function fromMinor(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2);
}
