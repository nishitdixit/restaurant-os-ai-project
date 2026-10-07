"use client";
// Phone navigation: one "Menu" button in the header opens a sheet with the store's pages and other ways to order,
// instead of a second sticky row of links eating the top of the screen.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu as MenuIcon } from "lucide-react";
import { Drawer, cx } from "@restaurant-os/ui";
import { OrderChannelsButton, type Channel } from "./order-channels";

export function MobileNav({ items, extra, channels, storeName }: { items: { href: string; label: string }[]; extra: { href: string; label: string }[]; channels: Channel[]; storeName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-haspopup="dialog"
        className="inline-flex size-10 items-center justify-center rounded-button text-header-muted hover:bg-header-chip hover:text-header-fg md:hidden">
        <MenuIcon className="size-5" aria-hidden />
      </button>
      <Drawer open={open} onOpenChange={setOpen} title={storeName}>
        <nav aria-label="Pages">
          <ul className="divide-y divide-border">
            {[{ href: "/", label: "Home" }, ...items].map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)} aria-current={pathname === item.href ? "page" : undefined}
                  className={cx("flex min-h-12 items-center justify-between py-3 text-base font-medium", pathname === item.href && "text-link")}>
                  {item.label}<ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {channels.length > 0 && (
          <OrderChannelsButton channels={channels} storeName={storeName} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-button border border-border-strong px-4 text-sm font-medium" />
        )}
        {extra.length > 0 && (
          <ul className="mt-6 space-y-2 text-sm text-muted">
            {extra.map((item) => <li key={item.href}><Link href={item.href} onClick={() => setOpen(false)} className="hover:underline">{item.label}</Link></li>)}
          </ul>
        )}
      </Drawer>
    </>
  );
}
