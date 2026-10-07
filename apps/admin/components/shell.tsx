"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Bike, BookOpen, ClipboardList, ExternalLink, Home, Menu as MenuIcon, MessageSquare, Palette, Settings, Tag, Users, X,
} from "lucide-react";
import type { SetupStatus } from "@restaurant-os/types";
import { Badge, Switch, cx, toast } from "@restaurant-os/ui";
import { errorMessage, STOREFRONT_URL } from "@/lib/api";
import { usePreviewUrl } from "@/lib/preview";
import { useSession, useTenantKey } from "@/lib/session";

const NAV = [
  { href: "/", label: "Home", icon: Home, permission: "tenant.read" },
  { href: "/orders", label: "Orders", icon: ClipboardList, permission: "order.read" },
  { href: "/catalog", label: "Menu", icon: BookOpen, permission: "catalog.read" },
  { href: "/offers", label: "Offers", icon: Tag, permission: "promotion.manage" },
  { href: "/delivery", label: "Delivery areas", icon: Bike, permission: "delivery.manage" },
  { href: "/customers", label: "Customers", icon: Users, permission: "customer.read" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.read" },
  { href: "/messages", label: "Messages", icon: MessageSquare, permission: "order.read" },
  { href: "/appearance", label: "Appearance", icon: Palette, permission: "tenant.read" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "tenant.read" },
];

function OrderingToggle() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const settingsKey = useTenantKey("settings");
  const { data } = useQuery({ queryKey: settingsKey, queryFn: () => request<{ outlet: { acceptingOrders: boolean } | null }>("/v1/admin/settings"), enabled: can("tenant.read") });
  const mutation = useMutation({
    mutationFn: (acceptingOrders: boolean) => request("/v1/admin/settings/accepting-orders", { body: { acceptingOrders } }),
    onSuccess: (_d, accepting) => {
      toast.success(accepting ? "Online ordering resumed" : "Online ordering paused — customers can still browse");
      void qc.invalidateQueries({ queryKey: settingsKey });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const accepting = data?.outlet?.acceptingOrders;
  if (accepting === undefined || !can("order.manage")) return null;
  return (
    <div className={cx("flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium", accepting ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
      <span className="hidden sm:inline">{accepting ? "Taking orders" : "Orders paused"}</span>
      <Switch size="sm" checked={accepting} disabled={mutation.isPending} onCheckedChange={(v) => mutation.mutate(v)} ariaLabel="Accepting online orders" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, membership, selectTenant, can, request } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const setupKey = useTenantKey("setup");
  const setup = useQuery({ queryKey: setupKey, queryFn: () => request<SetupStatus>("/v1/admin/setup"), enabled: can("tenant.read"), staleTime: 60_000 });
  const previewHref = usePreviewUrl("/");
  const storefront = setup.data?.published ? STOREFRONT_URL : previewHref ?? STOREFRONT_URL;

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.filter((n) => can(n.permission)).map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined}
            className={cx("flex h-10 items-center gap-3 rounded-[var(--ros-radius-md)] px-3 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-text")}>
            <Icon className="size-4.5" aria-hidden />{n.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="px-3 pb-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">Restaurant OS</p>
      {session && session.memberships.length > 1 ? (
        <select aria-label="Switch restaurant" value={membership?.tenantId ?? ""} onChange={(e) => selectTenant(e.target.value)}
          className="mt-1 w-full truncate rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-semibold">
          {session.memberships.map((m) => <option key={m.tenantId} value={m.tenantId}>{m.tenantName}</option>)}
        </select>
      ) : <p className="mt-1 truncate font-semibold">{membership?.tenantName}</p>}
      {membership && <Badge className="mt-2">{membership.role.toLowerCase()}</Badge>}
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        {brand}
        {nav}
        {setup.data && !setup.data.published && (
          <Link href="/" className="mt-auto rounded-[var(--ros-radius-md)] bg-warning-soft p-3 text-xs text-warning">
            <span className="font-semibold">Storefront not live yet.</span> Finish setup ({setup.data.progress}%) and publish.
          </Link>
        )}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="ros-drawer-right absolute inset-y-0 left-0 w-72 bg-surface px-3 py-5 shadow-[var(--ros-shadow-lg)]">
            <button className="absolute right-3 top-3 rounded p-1 hover:bg-subtle" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            {brand}
            {nav}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
          <button className="-ml-1 rounded p-1.5 hover:bg-subtle lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><MenuIcon className="size-5" /></button>
          <p className="truncate font-semibold lg:hidden">{membership?.tenantName}</p>
          <div className="ml-auto flex items-center gap-2">
            <OrderingToggle />
            <a href={storefront} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-subtle hover:text-text sm:inline-flex">
              {setup.data?.published ? "View storefront" : "Preview storefront"}<ExternalLink className="size-3.5" aria-hidden />
            </a>
            <UserButton />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
