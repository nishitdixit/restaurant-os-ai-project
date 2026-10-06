"use client";
// Owner analytics (PRD 5.11). Every figure is computed from paid orders and refunds, so it reconciles
// with the order list; definitions are shown on hover/focus of each tile.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { ORDER_STATUS_LABELS } from "@restaurant-os/domain";
import type { AnalyticsDashboard } from "@restaurant-os/types";
import { Card, CardHeader, ErrorState, PageHeader, Skeleton, Stat, Tabs, formatMoney } from "@restaurant-os/ui";
import { BarList, DailyColumns } from "@/components/charts";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

const RANGES = [{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }];
const CHANNELS: Record<string, string> = { DIRECT_WEB: "Direct website", DIRECT: "Direct (legacy)", WHATSAPP: "WhatsApp", PHONE: "Phone", SWIGGY: "Swiggy", ZOMATO: "Zomato" };

function delta(current: number, previous: number, label: string) {
  if (!previous) return current ? { value: 1, label: `new vs previous ${label}` } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: pct, label: `${pct > 0 ? "+" : ""}${pct}% vs previous ${label}` };
}

function Definition({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" className="rounded text-faint hover:text-muted" aria-label={text}><Info className="size-3.5" /></button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-5 z-10 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-surface p-2 text-xs font-normal text-muted shadow-[var(--ros-shadow-md)] group-focus-within:block group-hover:block">{text}</span>
    </span>
  );
}

export default function AnalyticsPage() {
  const { request } = useSession();
  const [range, setRange] = useState("30d");
  const q = useQuery({ queryKey: useTenantKey("analytics", range), queryFn: () => request<AnalyticsDashboard>(`/v1/admin/analytics?range=${range}`) });
  const d = q.data;
  const periodLabel = RANGES.find((r) => r.value === range)!.label.toLowerCase();
  return (
    <>
      <PageHeader title="Analytics" description="Sales from paid orders. Unpaid and cancelled orders are excluded from sales." />
      <Tabs value={range} onValueChange={setRange} items={RANGES} className="mb-5" />
      {q.isLoading ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>
        : q.error || !d ? <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : (
          <div className="space-y-6">
            <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={<>Gross sales <Definition text={d.definitions.grossSalesMinor!} /></>} value={formatMoney(d.summary.grossSalesMinor, d.currency)} delta={range === "today" ? null : delta(d.summary.grossSalesMinor, d.previous.grossSalesMinor, periodLabel)} />
              <Stat label={<>Paid orders <Definition text={d.definitions.paidOrders!} /></>} value={d.summary.paidOrders} delta={range === "today" ? null : delta(d.summary.paidOrders, d.previous.paidOrders, periodLabel)} />
              <Stat label={<>Average order <Definition text={d.definitions.averageOrderValueMinor!} /></>} value={formatMoney(d.summary.averageOrderValueMinor, d.currency)} />
              <Stat label={<>Net sales <Definition text={d.definitions.netSalesMinor!} /></>} value={formatMoney(d.summary.netSalesMinor, d.currency)} hint={d.summary.refundsMinor ? `after ${formatMoney(d.summary.refundsMinor, d.currency)} refunds` : undefined} />
              <Stat label="Completed" value={d.summary.completedOrders} />
              <Stat label={<>Cancelled <Definition text={d.definitions.cancelledOrders!} /></>} value={d.summary.cancelledOrders} />
              <Stat label={<>New customers <Definition text={d.definitions.newCustomers!} /></>} value={d.summary.newCustomers} />
              <Stat label={<>Repeat customers <Definition text={d.definitions.repeatCustomers!} /></>} value={d.summary.repeatCustomers} />
            </section>

            {range !== "today" && (
              <Card>
                <DailyColumns data={d.daily} currency={d.currency} title="Daily sales" />
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Top items" description="By quantity sold in paid orders" />
                <BarList valueLabel="Quantity" rows={d.topProducts.map((p) => ({ label: p.name, value: p.quantity, display: `${p.quantity} · ${formatMoney(p.revenueMinor, d.currency)}` }))} />
              </Card>
              <Card>
                <CardHeader title="Order outcomes" description="Paid and cancelled orders placed in this period" />
                <BarList valueLabel="Orders" rows={d.statusBreakdown.map((s) => ({ label: ORDER_STATUS_LABELS[s.status], value: s.count, display: String(s.count) }))} />
              </Card>
              <Card>
                <CardHeader title="Channels" description="Where paid orders came from" />
                <BarList valueLabel="Orders" rows={d.channelMix.map((c) => ({ label: CHANNELS[c.channel] ?? c.channel, value: c.orders, display: `${c.orders} · ${formatMoney(c.grossSalesMinor, d.currency)}` }))} />
              </Card>
              <Card>
                <CardHeader title="Delivery vs pickup" />
                <BarList valueLabel="Orders" rows={d.fulfillmentMix.map((f) => ({ label: f.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup", value: f.orders, display: String(f.orders) }))} />
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                  <div><dt className="text-muted">Delivery fees collected</dt><dd className="font-medium">{formatMoney(d.summary.feesMinor, d.currency)}</dd></div>
                  <div><dt className="text-muted">Discounts given</dt><dd className="font-medium">{formatMoney(d.summary.discountsMinor, d.currency)}</dd></div>
                </dl>
              </Card>
            </div>
            <p className="text-xs text-muted">Times are in {d.range.timezone}. {d.summary.awaitingPaymentOrders} order(s) currently awaiting payment are not counted.</p>
          </div>
        )}
    </>
  );
}
