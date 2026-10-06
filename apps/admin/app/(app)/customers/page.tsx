"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import type { AdminCustomerSummary, Page } from "@restaurant-os/types";
import { Badge, DataTable, EmptyState, ErrorState, Input, LoadMore, PageHeader, Select, Skeleton, formatDateTime, formatMoney } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

export default function CustomersPage() {
  const { request } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [segment, setSegment] = useState("all");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const query = useInfiniteQuery({
    queryKey: useTenantKey("customers", term, segment),
    queryFn: ({ pageParam }) => request<Page<AdminCustomerSummary>>(`/v1/admin/customers?limit=50&segment=${segment}${term ? `&q=${encodeURIComponent(term)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader title="Customers" description="Everyone who has ordered direct. Repeat customers are matched by mobile number." />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email" aria-label="Search customers" className="pl-9" />
        </div>
        <Select aria-label="Segment" value={segment} onChange={(e) => setSegment(e.target.value)} className="w-auto">
          <option value="all">All customers</option><option value="new">New (1 order)</option><option value="repeat">Repeat (2+ orders)</option><option value="inactive_30">Not ordered in 30 days</option>
        </Select>
      </div>
      {query.isLoading ? <Skeleton className="h-96" /> : query.error ? <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} /> : (
        <>
          <DataTable rows={rows} rowKey={(c) => c.id} onRowClick={(c) => router.push(`/customers/${c.id}`)} caption="Customers"
            empty={<EmptyState icon={<Users className="size-6" />} title={term || segment !== "all" ? "No customers match" : "No customers yet"} description="Customers are created automatically when they order from your storefront." />}
            columns={[
              { key: "n", header: "Customer", cell: (c) => <span className="font-medium">{c.name}<span className="block text-xs font-normal text-muted">{c.phone}{c.email ? ` · ${c.email}` : ""}</span></span> },
              { key: "o", header: "Paid orders", align: "right", cell: (c) => <span>{c.orderCount}{c.orderCount >= 2 && <Badge tone="success" className="ml-2">Repeat</Badge>}</span> },
              { key: "s", header: "Spent", align: "right", cell: (c) => formatMoney(c.totalSpentMinor) },
              { key: "l", header: "Last order", align: "right", hideOnMobile: true, cell: (c) => <span className="text-muted">{c.lastOrderAt ? formatDateTime(c.lastOrderAt, { dateStyle: "medium" }) : "—"}</span> },
              { key: "m", header: "Offers", hideOnMobile: true, cell: (c) => c.marketingConsent ? <Badge tone="success">Opted in</Badge> : <span className="text-xs text-muted">—</span> },
            ]} />
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
        </>
      )}
    </>
  );
}
