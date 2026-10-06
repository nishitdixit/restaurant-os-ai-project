"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Phone } from "lucide-react";
import type { AdminCustomerDetail } from "@restaurant-os/types";
import { Button, Card, CardHeader, DataTable, ErrorState, PageHeader, Skeleton, Stat, StatusPill, Switch, Textarea, formatDateTime, formatMoney, toast } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { request, can } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const key = useTenantKey("customer", id);
  const { data: c, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => request<AdminCustomerDetail>(`/v1/admin/customers/${id}`) });
  const [notes, setNotes] = useState("");
  useEffect(() => { if (c) setNotes(c.notes); }, [c]);
  const update = useMutation({
    mutationFn: (body: { notes?: string; marketingConsent?: boolean }) => request(`/v1/admin/customers/${id}`, { method: "PATCH", body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); toast.success("Saved"); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  if (error || !c) return <ErrorState description={errorMessage(error)} onRetry={() => void refetch()} />;
  const manage = can("customer.manage");
  return (
    <>
      <PageHeader title={c.name} description={`Customer since ${formatDateTime(c.createdAt, { dateStyle: "medium" })}`}
        back={<Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />Customers</Link>}
        actions={c.phone && <>
          <a href={`tel:${c.phone}`} className="inline-flex h-10 items-center gap-2 rounded-[var(--ros-radius-md)] border border-border-strong px-3 text-sm font-medium hover:bg-subtle"><Phone className="size-4" aria-hidden />{c.phone}</a>
          <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[var(--ros-radius-md)] border border-border-strong px-3 text-sm font-medium hover:bg-subtle"><MessageSquare className="size-4" aria-hidden />WhatsApp</a>
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paid orders" value={c.orderCount} />
        <Stat label="Total spent" value={formatMoney(c.totalSpentMinor)} />
        <Stat label="Average order" value={formatMoney(c.orderCount ? Math.round(c.totalSpentMinor / c.orderCount) : 0)} />
        <Stat label="Last order" value={c.lastOrderAt ? formatDateTime(c.lastOrderAt, { dateStyle: "medium" }) : "—"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Orders" />
          <DataTable rows={c.orders} rowKey={(o) => o.id} caption="Orders" empty={<p className="text-sm text-muted">No orders yet.</p>}
            onRowClick={(o) => router.push(`/orders?view=all&order=${o.id}`)}
            columns={[
              { key: "n", header: "Order", cell: (o) => <span className="font-semibold">#{o.number}</span> },
              { key: "s", header: "Status", cell: (o) => <StatusPill kind="order" status={o.status} /> },
              { key: "i", header: "Items", hideOnMobile: true, cell: (o) => <span className="line-clamp-1 text-muted">{o.itemsPreview}</span> },
              { key: "t", header: "Total", align: "right", cell: (o) => formatMoney(o.totalMinor, o.currency) },
              { key: "d", header: "Date", align: "right", cell: (o) => <span className="text-muted">{formatDateTime(o.createdAt, { dateStyle: "short" })}</span> },
            ]} />
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Favourites" />
            {c.favouriteProducts.length ? <ul className="space-y-1.5 text-sm">{c.favouriteProducts.map((f) => <li key={f.name} className="flex justify-between"><span>{f.name}</span><span className="text-muted">× {f.quantity}</span></li>)}</ul> : <p className="text-sm text-muted">Nothing yet.</p>}
          </Card>
          <Card>
            <CardHeader title="Addresses" />
            {c.addresses.length ? <ul className="space-y-2 text-sm">{c.addresses.map((a) => <li key={a.id} className="text-muted">{[a.line1, a.line2, a.city, a.postalCode].filter(Boolean).join(", ")}</li>)}</ul> : <p className="text-sm text-muted">Pickup only so far.</p>}
          </Card>
          {c.couponsUsed.length > 0 && (
            <Card>
              <CardHeader title="Coupons used" />
              <ul className="space-y-1.5 text-sm">{c.couponsUsed.map((x, i) => <li key={i} className="flex justify-between"><span className="font-mono">{x.code}</span><span className="text-muted">−{formatMoney(x.discountMinor)}</span></li>)}</ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Preferences & notes" />
            <Switch checked={c.marketingConsent} disabled={!manage || update.isPending} onCheckedChange={(v) => update.mutate({ marketingConsent: v })} label="Agreed to receive offers" description="Change only when the customer asks you to" />
            <Textarea className="mt-4" rows={3} value={notes} disabled={!manage} onChange={(e) => setNotes(e.target.value)} placeholder="Private notes (e.g. prefers less spicy)" aria-label="Customer notes" />
            {manage && <Button size="sm" variant="outline" className="mt-2" disabled={notes === c.notes} loading={update.isPending} onClick={() => update.mutate({ notes })}>Save notes</Button>}
          </Card>
        </div>
      </div>
    </>
  );
}
