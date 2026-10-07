"use client";
// Signed merchant preview links (ADR-013): the storefront shows the unpublished store and the draft look only with a
// short-lived token the API issues to signed-in staff.
import { useQuery } from "@tanstack/react-query";
import { STOREFRONT_URL } from "./api";
import { useSession, useTenantKey } from "./session";

export function usePreviewToken() {
  const { request, can } = useSession();
  return useQuery({
    queryKey: useTenantKey("preview-token"),
    queryFn: () => request<{ token: string; expiresAt: string; brandSlug: string }>("/v1/admin/preview-token", { method: "POST" }),
    enabled: can("tenant.read"),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
  });
}

/** Storefront URL for `path` in merchant preview (null until the token is ready). */
export function usePreviewUrl(path = "/"): string | null {
  const token = usePreviewToken().data?.token;
  if (!token) return null;
  return `${STOREFRONT_URL}${path}${path.includes("?") ? "&" : "?"}preview=${encodeURIComponent(token)}`;
}

export function previewUrl(token: string, path = "/"): string {
  return `${STOREFRONT_URL}${path}${path.includes("?") ? "&" : "?"}preview=${encodeURIComponent(token)}`;
}
