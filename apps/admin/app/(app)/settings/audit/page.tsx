"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { AuditEntry } from "@restaurant-os/types";
import { Card, EmptyState, ErrorState, LoadMore, Skeleton, formatDateTime } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

/** "ProductPriceChanged" -> "Product price changed" */
function humanize(name: string) {
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function describe(a: AuditEntry): string | null {
  const m = a.metadata as Record<string, unknown>;
  if (a.eventName === "ProductPriceChanged") return `${m.name}: ₹${Number(m.fromMinor) / 100} → ₹${Number(m.toMinor) / 100}`;
  if (a.eventName === "ProductAvailabilityChanged") return `${m.name}: ${m.available ? "back in stock" : `out of stock${m.reason ? ` (${m.reason})` : ""}`}`;
  if (a.eventName === "OrderStatusChanged") return `Order #${m.orderNumber}: ${m.from} → ${m.to}${m.reasonCode ? ` (${m.reasonCode})` : ""}`;
  if (a.eventName === "PaymentRefunded") return `₹${Number(m.amountMinor) / 100} — ${m.reason}`;
  if (a.eventName === "TeamMemberInvited") return `${m.email} as ${m.role}`;
  if (a.eventName === "TeamMemberUpdated") return `${m.fromRole} → ${m.toRole}${m.active === false ? " (removed)" : ""}`;
  if (typeof m.name === "string") return m.name;
  if (typeof m.code === "string") return m.code;
  return null;
}

export default function AuditPage() {
  const { request } = useSession();
  const query = useInfiniteQuery({
    queryKey: useTenantKey("audit"),
    queryFn: ({ pageParam }) => request<{ items: AuditEntry[]; nextCursor: string | null }>(`/v1/admin/audit?limit=50${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (query.isLoading) return <Skeleton className="h-96" />;
  if (query.error) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card padded={false}>
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">Audit log</h2>
        <p className="text-sm text-muted">Price changes, stock changes, refunds, cancellations, team and settings changes — who did what, and when.</p>
      </div>
      {rows.length === 0 ? <div className="p-5"><EmptyState title="Nothing recorded yet" /></div> : (
        <ol className="divide-y divide-border">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <time className="w-36 shrink-0 text-muted" dateTime={a.createdAt}>{formatDateTime(a.createdAt, { dateStyle: "medium", timeStyle: "short" })}</time>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{humanize(a.eventName)}</p>
                {describe(a) && <p className="text-muted">{describe(a)}</p>}
              </div>
              <span className="text-muted">{a.actor ?? "System"}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="pb-4"><LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} /></div>
    </Card>
  );
}
