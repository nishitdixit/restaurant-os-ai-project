"use client";
// Order board (docs/KITCHEN.md): New | Accepted | Preparing | Ready | Out for delivery, live-updating,
// with an audible alert for new paid orders and one primary action per card.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Bike, Search, Store, Timer } from "lucide-react";
import type { AdminOrderSummary, OrderStatus } from "@restaurant-os/types";
import {
  Button, DataTable, Drawer, EmptyState, ErrorState, Input, LoadMore, PageHeader, RelativeTime, Skeleton, StatusPill, Tabs, cx, formatDateTime, formatMoney, toast,
} from "@restaurant-os/ui";
import { OrderDetailView, nextAction, useOrderMutations } from "@/components/order-detail";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

const COLUMNS: { key: string; title: string; statuses: OrderStatus[] }[] = [
  { key: "new", title: "New", statuses: ["NEW"] },
  { key: "accepted", title: "Accepted", statuses: ["ACCEPTED"] },
  { key: "preparing", title: "Preparing", statuses: ["PREPARING"] },
  { key: "ready", title: "Ready / packed", statuses: ["READY", "PACKED"] },
  { key: "dispatched", title: "Out for delivery", statuses: ["DISPATCHED"] },
];

type ListResponse = { items: AdminOrderSummary[]; nextCursor: string | null; counts: Record<string, number> };

/** Short two-tone chime via Web Audio (no asset to load). */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
  } catch { /* audio unavailable */ }
}

function minutesSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function BoardCard({ order, onOpen }: { order: AdminOrderSummary; onOpen: () => void }) {
  const { can } = useSession();
  const { transition } = useOrderMutations(order.id);
  const next = nextAction(order);
  const since = order.acceptedAt ?? order.paidAt ?? order.createdAt;
  const late = order.etaMax !== null && order.acceptedAt && !["DELIVERED"].includes(order.status) && minutesSince(order.acceptedAt) > order.etaMax;
  const waiting = order.status === "NEW" && minutesSince(order.paidAt ?? order.createdAt) > 5;
  return (
    <article className={cx("rounded-[var(--ros-radius-lg)] border bg-surface p-3 shadow-[var(--ros-shadow-sm)]", order.status === "NEW" ? "border-info/50 ring-1 ring-info/20" : "border-border")}>
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open order ${order.number}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">#{order.number}</span>
          <span className={cx("inline-flex items-center gap-1 text-xs", late || waiting ? "font-semibold text-danger" : "text-muted")}>
            {(late || waiting) && <Timer className="size-3.5" aria-hidden />}<RelativeTime iso={since} />
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          {order.fulfillmentType === "DELIVERY" ? <Bike className="size-3.5" aria-label="Delivery" /> : <Store className="size-3.5" aria-label="Pickup" />}
          <span className="truncate">{order.customerName}{order.postalCode ? ` · ${order.postalCode}` : ""}</span>
        </p>
        <p className="mt-1.5 line-clamp-3 text-sm">{order.itemsPreview}</p>
        <p className="mt-1.5 text-sm font-medium">{formatMoney(order.totalMinor, order.currency)}</p>
        {late && <p className="mt-1 text-xs font-medium text-danger">Past the promised time</p>}
      </button>
      {next && can("order.manage") && next.to !== "DISPATCH" && (
        <Button size="sm" block className="mt-3" loading={transition.isPending} onClick={() => transition.mutate(next.to as OrderStatus)}>{next.label}</Button>
      )}
      {next?.to === "DISPATCH" && can("delivery.manage") && <Button size="sm" variant="outline" block className="mt-3" onClick={onOpen}>Dispatch…</Button>}
    </article>
  );
}

function Board({ onOpen }: { onOpen: (id: string) => void }) {
  const { request } = useSession();
  const [soundOn, setSoundOn] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const query = useQuery({
    queryKey: useTenantKey("orders", "board"),
    queryFn: () => request<ListResponse>("/v1/admin/orders?view=active&limit=200"),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    try { setSoundOn(localStorage.getItem("ros-sound") === "1"); } catch { /* ignore */ }
  }, []);

  // Alert on newly arrived paid orders (not on first load).
  useEffect(() => {
    const items = query.data?.items;
    if (!items) return;
    const fresh = items.filter((o) => o.status === "NEW" && !seen.current?.has(o.id));
    if (seen.current && fresh.length) {
      if (soundOn) chime();
      for (const o of fresh) toast.info(`New order #${o.number} · ${formatMoney(o.totalMinor, o.currency)}`, { action: { label: "Open", onClick: () => onOpen(o.id) } });
    }
    seen.current = new Set(items.map((o) => o.id));
    const newCount = items.filter((o) => o.status === "NEW").length;
    document.title = newCount ? `(${newCount}) New orders · Restaurant OS` : "Orders · Restaurant OS";
  }, [query.data, soundOn, onOpen]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try { localStorage.setItem("ros-sound", next ? "1" : "0"); } catch { /* ignore */ }
    if (next) chime();
  };

  if (query.isLoading) return <div className="grid gap-3 lg:grid-cols-5">{COLUMNS.map((c) => <Skeleton key={c.key} className="h-64" />)}</div>;
  if (query.error) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">{items.length ? `${items.length} active order${items.length === 1 ? "" : "s"}` : "No active orders"} · refreshes every 10 s</p>
        <Button variant={soundOn ? "secondary" : "outline"} size="sm" onClick={toggleSound} icon={soundOn ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}>
          {soundOn ? "Sound on" : "Turn on sound"}
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState title="All caught up" description="New paid orders appear here instantly, with a sound if you turn it on. Unpaid orders wait in “Awaiting payment”." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {COLUMNS.map((col) => {
            const orders = items.filter((o) => col.statuses.includes(o.status));
            return (
              <section key={col.key} aria-labelledby={`col-${col.key}`} className="flex w-72 shrink-0 flex-col rounded-[var(--ros-radius-lg)] bg-subtle p-2 lg:w-auto">
                <h2 id={`col-${col.key}`} className="flex items-center justify-between px-1.5 pb-2 pt-1 text-sm font-semibold">
                  {col.title}<span className="rounded-full bg-surface px-2 text-xs text-muted">{orders.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {orders.map((o) => <BoardCard key={o.id} order={o} onOpen={() => onOpen(o.id)} />)}
                  {orders.length === 0 && <p className="px-1.5 py-4 text-center text-xs text-faint">Nothing here</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function OrderList({ view, onOpen }: { view: string; onOpen: (id: string) => void }) {
  const { request } = useSession();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const query = useInfiniteQuery({
    queryKey: useTenantKey("orders", "list", view, term),
    queryFn: ({ pageParam }) => request<ListResponse>(`/v1/admin/orders?view=${view}&limit=50${term ? `&q=${encodeURIComponent(term)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: view === "awaiting_payment" ? 15_000 : false,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, name or phone" aria-label="Search orders" className="pl-9" />
      </div>
      {view === "awaiting_payment" && <p className="mb-3 text-sm text-muted">These customers haven&apos;t completed payment. Don&apos;t prepare them yet — they cancel automatically when the payment window closes.</p>}
      {query.isLoading ? <Skeleton className="h-64" /> : query.error ? <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} /> : (
        <>
          <DataTable rows={rows} rowKey={(o) => o.id} onRowClick={(o) => onOpen(o.id)} caption="Orders"
            empty={<EmptyState title={term ? "No matching orders" : "No orders here yet"} />}
            columns={[
              { key: "n", header: "Order", cell: (o) => <span className="font-semibold">#{o.number}</span> },
              { key: "s", header: "Status", cell: (o) => <span className="flex flex-wrap gap-1"><StatusPill kind="order" status={o.status} />{o.paymentStatus !== "CAPTURED" && <StatusPill kind="payment" status={o.paymentStatus} />}</span> },
              { key: "c", header: "Customer", cell: (o) => <span>{o.customerName}<span className="block text-xs text-muted">{o.customerPhone}</span></span> },
              { key: "i", header: "Items", cell: (o) => <span className="line-clamp-1 text-muted">{o.itemsPreview}</span>, hideOnMobile: true },
              { key: "t", header: "Total", align: "right", cell: (o) => formatMoney(o.totalMinor, o.currency) },
              { key: "d", header: "Placed", align: "right", cell: (o) => <span className="text-muted">{formatDateTime(o.createdAt, { dateStyle: "short", timeStyle: "short" })}</span>, hideOnMobile: true },
            ]} />
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
        </>
      )}
    </>
  );
}

function OrdersPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { request } = useSession();
  const view = params.get("view") ?? "board";
  const openId = params.get("order");
  const counts = useQuery({ queryKey: useTenantKey("orders", "counts"), queryFn: () => request<ListResponse>("/v1/admin/orders?view=active&limit=1"), refetchInterval: 15_000 });
  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`/orders${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, router]);
  const open = useCallback((id: string) => setParam("order", id), [setParam]);
  const detail = useQuery({ queryKey: useTenantKey("order", openId), queryFn: () => request<{ number: number }>(`/v1/admin/orders/${openId}`), enabled: !!openId });
  const tabs = useMemo(() => [
    { value: "board", label: "Board", count: counts.data?.counts.active },
    { value: "awaiting_payment", label: "Awaiting payment", count: counts.data?.counts.awaiting_payment },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "all", label: "All orders" },
  ], [counts.data]);

  return (
    <>
      <PageHeader title="Orders" description="Accept, prepare and dispatch direct orders." />
      <Tabs value={view} onValueChange={(v) => setParam("view", v === "board" ? null : v)} items={tabs} className="mb-4" />
      {view === "board" ? <Board onOpen={open} /> : <OrderList key={view} view={view} onOpen={open} />}
      <Drawer open={!!openId} onOpenChange={(o) => !o && setParam("order", null)} title={detail.data ? `Order #${detail.data.number}` : "Order"} width="lg">
        {openId && <OrderDetailView orderId={openId} />}
      </Drawer>
    </>
  );
}

export default function OrdersPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><OrdersPageInner /></Suspense>;
}
