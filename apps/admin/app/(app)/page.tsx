"use client";
// Home: setup checklist with blockers until the storefront is live (specs/onboarding "Completion"),
// then today's snapshot and the orders that need attention.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, ExternalLink, Rocket } from "lucide-react";
import type { AdminOrderSummary, AnalyticsDashboard, SetupStatus } from "@restaurant-os/types";
import { Alert, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, RelativeTime, Skeleton, Stat, StatusPill, buttonClass, cx, formatMoney, toast } from "@restaurant-os/ui";
import { ApiError, errorMessage, STOREFRONT_URL } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

function SetupChecklist({ setup }: { setup: SetupStatus }) {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("setup");
  const publish = useMutation({
    mutationFn: () => request<SetupStatus>("/v1/admin/publish", { body: { published: true } }),
    onSuccess: (data) => { qc.setQueryData(key, data); toast.success("Your storefront is live!"); },
    onError: (e) => toast.error(e instanceof ApiError && e.code === "SETUP_INCOMPLETE" ? "Finish the remaining steps first." : errorMessage(e)),
  });
  const remaining = setup.steps.filter((s) => s.key !== "publish" && !s.complete);
  return (
    <Card>
      <CardHeader title="Get your storefront live" description={`${setup.progress}% done — customers can order once you publish.`}
        action={<a href={`${STOREFRONT_URL}?preview=1`} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}>Preview<ExternalLink className="size-3.5" aria-hidden /></a>} />
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={setup.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${setup.progress}%` }} />
      </div>
      <ol className="divide-y divide-border">
        {setup.steps.filter((s) => s.key !== "publish").map((step) => (
          <li key={step.key} className="flex items-center gap-3 py-3">
            {step.complete ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="size-5 shrink-0 text-border-strong" aria-label="To do" />}
            <div className="min-w-0 flex-1">
              <p className={cx("text-sm font-medium", step.complete && "text-muted")}>{step.label}</p>
              {!step.complete && step.blocker && <p className="text-xs text-muted">{step.blocker}</p>}
            </div>
            {!step.complete && <Link href={step.href} className={buttonClass("ghost", "sm")}>Set up<ArrowRight className="size-3.5" aria-hidden /></Link>}
          </li>
        ))}
      </ol>
      {can("tenant.manage") && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--ros-radius-md)] bg-subtle p-4">
          <p className="text-sm">{remaining.length ? `${remaining.length} step${remaining.length === 1 ? "" : "s"} left before you can publish.` : "Everything is ready."}</p>
          <Button icon={<Rocket className="size-4" aria-hidden />} disabled={remaining.length > 0} loading={publish.isPending} onClick={() => publish.mutate()}>Publish storefront</Button>
        </div>
      )}
    </Card>
  );
}

export default function HomePage() {
  const { request, can, membership } = useSession();
  const router = useRouter();
  // Home is the owner/manager dashboard; roles without it (e.g. Kitchen) start on the order board instead.
  const hasHome = can("tenant.read");
  useEffect(() => {
    if (!hasHome) router.replace("/orders");
  }, [hasHome, router]);
  const setupKey = useTenantKey("setup");
  const setup = useQuery({ queryKey: setupKey, queryFn: () => request<SetupStatus>("/v1/admin/setup"), enabled: hasHome });
  const stats = useQuery({ queryKey: useTenantKey("analytics", "today"), queryFn: () => request<AnalyticsDashboard>("/v1/admin/analytics?range=today"), enabled: can("analytics.read") });
  const active = useQuery({
    queryKey: useTenantKey("orders", "active"),
    queryFn: () => request<{ items: AdminOrderSummary[]; counts: Record<string, number> }>("/v1/admin/orders?view=active&limit=8"),
    enabled: can("order.read"),
    refetchInterval: 15_000,
  });

  if (!hasHome || setup.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-72" /></div>;
  if (setup.error) return <ErrorState description={errorMessage(setup.error)} onRetry={() => void setup.refetch()} />;
  const s = stats.data?.summary;
  const newOrders = active.data?.items.filter((o) => o.status === "NEW").length ?? 0;

  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}`} description={membership?.tenantName} />
      {setup.data && !setup.data.published && <div className="mb-6"><SetupChecklist setup={setup.data} /></div>}
      {newOrders > 0 && (
        <Alert tone="info" className="mb-6" title={`${newOrders} new order${newOrders === 1 ? "" : "s"} waiting to be accepted`}
          action={<Link href="/orders" className={buttonClass("primary", "sm")}>Open order board</Link>} />
      )}
      {can("analytics.read") && (
        <section aria-label="Today" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.isLoading || !s ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />) : (
            <>
              <Stat label="Sales today" value={formatMoney(s.grossSalesMinor, stats.data!.currency)} />
              <Stat label="Paid orders" value={s.paidOrders} />
              <Stat label="Average order" value={formatMoney(s.averageOrderValueMinor, stats.data!.currency)} />
              <Stat label="Awaiting payment" value={s.awaitingPaymentOrders} hint="Unpaid orders expire automatically" />
            </>
          )}
        </section>
      )}
      {can("order.read") && (
        <Card>
          <CardHeader title="In progress" description="Paid orders that still need work" action={<Link href="/orders" className={buttonClass("outline", "sm")}>Order board</Link>} />
          {active.isLoading ? <Skeleton className="h-32" /> : !active.data?.items.length ? (
            <EmptyState title="No orders in progress" description="New paid orders appear here and on the order board, with a sound alert." />
          ) : (
            <ul className="divide-y divide-border">
              {active.data.items.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders?order=${o.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-subtle/60">
                    <span className="w-16 font-semibold">#{o.number}</span>
                    <StatusPill kind="order" status={o.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">{o.customerName} · {o.itemsPreview}</span>
                    <span className="text-sm font-medium">{formatMoney(o.totalMinor, o.currency)}</span>
                    <RelativeTime iso={o.paidAt ?? o.createdAt} className="w-20 text-right text-xs text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
