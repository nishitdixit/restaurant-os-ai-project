"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader, cx } from "@restaurant-os/ui";
import { useSession } from "@/lib/session";

const TABS = [
  { href: "/settings", label: "Business", permission: "tenant.read" },
  { href: "/settings/brand", label: "Brand & storefront", permission: "tenant.read" },
  { href: "/settings/outlet", label: "Kitchen & hours", permission: "tenant.read" },
  { href: "/settings/policies", label: "Policies", permission: "tenant.read" },
  { href: "/settings/team", label: "Team", permission: "tenant.read" },
  { href: "/settings/audit", label: "Audit log", permission: "audit.read" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can } = useSession();
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.filter((t) => can(t.permission)).map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", active ? "border-primary text-text" : "border-transparent text-muted hover:text-text")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="max-w-3xl">{children}</div>
    </>
  );
}
