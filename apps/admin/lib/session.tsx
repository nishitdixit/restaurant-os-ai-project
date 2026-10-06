"use client";
// Session + tenant context for the admin. The UI hides what a role can't do, but every check is
// enforced again by the API (docs/SECURITY.md).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { Session, SessionMembership } from "@restaurant-os/types";
import { ApiError, useApiRequest, type RequestOptions } from "./api";

interface SessionContextValue {
  session: Session | undefined;
  loading: boolean;
  error: unknown;
  membership: SessionMembership | null;
  tenantId: string | null;
  selectTenant: (tenantId: string) => void;
  can: (permission: string) => boolean;
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  refresh: () => Promise<unknown>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const TENANT_KEY = "ros-admin-tenant";

export function SessionProvider({ children }: { children: ReactNode }) {
  const bare = useApiRequest(null);
  const { isLoaded, isSignedIn, userId } = useAuth();
  // Only ask for the session once Clerk has a signed-in user, and key it by that user so a sign-out/sign-in never
  // reuses the previous answer. Right after sign-in the first token can be rejected while Clerk finishes
  // activating the session, so a 401 is retried a few times (with backoff) before it is treated as real.
  const query = useQuery({
    queryKey: ["session", userId ?? null],
    queryFn: () => bare<Session>("/v1/session"),
    enabled: isLoaded && !!isSignedIn,
    staleTime: 60_000,
    retry: (failureCount, error) => failureCount < (error instanceof ApiError && error.status === 401 ? 4 : 1),
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    try { setSelected(localStorage.getItem(TENANT_KEY)); } catch { /* ignore */ }
  }, []);

  const memberships = query.data?.memberships ?? [];
  const membership = memberships.find((m) => m.tenantId === selected) ?? memberships[0] ?? null;
  const tenantId = membership?.tenantId ?? null;
  const request = useApiRequest(tenantId);

  const selectTenant = useCallback((id: string) => {
    setSelected(id);
    try { localStorage.setItem(TENANT_KEY, id); } catch { /* ignore */ }
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "session" });
  }, [qc]);

  const value = useMemo<SessionContextValue>(() => ({
    session: query.data,
    loading: !isLoaded || !isSignedIn || query.isLoading,
    error: query.error,
    membership,
    tenantId,
    selectTenant,
    can: (permission) => !!membership?.permissions.includes(permission),
    request,
    refresh: () => query.refetch(),
  }), [query.data, query.isLoading, query.error, isLoaded, isSignedIn, membership, tenantId, selectTenant, request, query]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** Tenant-scoped query key so switching restaurants never shows another tenant's cached data. */
export function useTenantKey(...parts: unknown[]): QueryKey {
  const { tenantId } = useSession();
  return [tenantId, ...parts];
}
