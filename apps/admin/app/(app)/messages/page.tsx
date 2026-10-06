"use client";
// Outbound message log (specs/notifications "admin visibility for failures"). In this deployment the
// development provider records messages instead of sending them.
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import type { NotificationEntry } from "@restaurant-os/types";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadMore, PageHeader, Skeleton, Tabs, formatDateTime, toast, type Tone } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

const STATUS: Record<NotificationEntry["status"], [string, Tone]> = { PENDING: ["Sending", "info"], SENT: ["Sent", "success"], FAILED: ["Failed", "danger"], CANCELLED: ["Cancelled", "neutral"] };
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", sms: "SMS", in_app: "Alert" };

export default function MessagesPage() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const key = useTenantKey("notifications", status);
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => request<{ items: NotificationEntry[]; nextCursor: string | null; failedCount: number }>(`/v1/admin/notifications?limit=50&status=${status}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 15_000,
  });
  const retry = useMutation({
    mutationFn: (id: string) => request(`/v1/admin/notifications/${id}/retry`, { method: "POST" }),
    onSuccess: () => { toast.success("Queued to send again"); void qc.invalidateQueries({ queryKey: prefixKey(key) }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const failed = query.data?.pages[0]?.failedCount ?? 0;
  return (
    <>
      <PageHeader title="Messages" description="Order updates sent to customers and alerts for your team." />
      <Alert tone="info" className="mb-4" title="Test mode">Messages are recorded here instead of being delivered by WhatsApp, SMS or email. Connecting a messaging provider later needs no changes to your workflow.</Alert>
      {failed > 0 && status !== "FAILED" && <Alert tone="danger" className="mb-4" title={`${failed} message${failed === 1 ? "" : "s"} failed after several retries`} action={<Button size="sm" variant="outline" onClick={() => setStatus("FAILED")}>Review</Button>} />}
      <Tabs value={status} onValueChange={setStatus} className="mb-4" items={[{ value: "all", label: "All" }, { value: "FAILED", label: "Failed", count: failed }, { value: "SENT", label: "Sent" }, { value: "PENDING", label: "Sending" }]} />
      {query.isLoading ? <Skeleton className="h-96" /> : query.error ? <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} /> :
        rows.length === 0 ? <EmptyState icon={<MessageSquare className="size-6" />} title="No messages yet" description="Customers get a message when their order is confirmed, accepted, ready, on the way, delivered or cancelled." /> : (
          <div className="space-y-2">
            {rows.map((n) => {
              const [label, tone] = STATUS[n.status];
              return (
                <Card key={n.id}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={tone} dot>{label}</Badge>
                    <Badge>{CHANNEL[n.channel] ?? n.channel}</Badge>
                    <span className="font-medium">{n.audience === "MERCHANT" ? "Your team" : n.recipient}</span>
                    {n.orderNumber && <a className="text-primary hover:underline" href={`/orders?view=all&order=${n.orderId}`}>Order #{n.orderNumber}</a>}
                    <span className="ml-auto text-xs text-muted">{formatDateTime(n.sentAt ?? n.createdAt, { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  {n.subject && <p className="mt-2 text-sm font-semibold">{n.subject}</p>}
                  <p className="mt-1 whitespace-pre-line text-sm text-muted">{n.body}</p>
                  {n.status === "FAILED" && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className="text-xs text-danger">{n.attemptCount} attempt{n.attemptCount === 1 ? "" : "s"} · {n.lastError}</p>
                      {can("order.manage") && <Button size="sm" variant="outline" loading={retry.isPending} onClick={() => retry.mutate(n.id)}>Retry</Button>}
                    </div>
                  )}
                </Card>
              );
            })}
            <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
          </div>
        )}
    </>
  );
}

function prefixKey(key: readonly unknown[]) {
  return [key[0], key[1]];
}
