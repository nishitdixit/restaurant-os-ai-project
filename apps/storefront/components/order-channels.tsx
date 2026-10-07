"use client";
// "More ways to order": the restaurant's other channels (WhatsApp, Swiggy, Zomato, call) in one sheet, instead of a
// row of competing buttons next to "Order direct".
import { useState, type ReactNode } from "react";
import { ExternalLink, MessageCircle, Phone, ShoppingBag } from "lucide-react";
import { Drawer, cx } from "@restaurant-os/ui";

export interface Channel {
  kind: "whatsapp" | "swiggy" | "zomato" | "call";
  href: string;
  detail: string;
}

const META: Record<Channel["kind"], { label: string; icon: ReactNode }> = {
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="size-5" aria-hidden /> },
  swiggy: { label: "Swiggy", icon: <ShoppingBag className="size-5" aria-hidden /> },
  zomato: { label: "Zomato", icon: <ShoppingBag className="size-5" aria-hidden /> },
  call: { label: "Call the restaurant", icon: <Phone className="size-5" aria-hidden /> },
};

export function OrderChannelsButton({ channels, label = "More ways to order", className, storeName }: { channels: Channel[]; label?: string; className?: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  if (!channels.length) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("ros-press", className)} aria-haspopup="dialog">{label}</button>
      <Drawer open={open} onOpenChange={setOpen} title="More ways to order" description={`Ordering direct on this site is best for ${storeName} — but you can also use these.`}>
        <ul className="space-y-2">
          {channels.map((c) => (
            <li key={c.kind}>
              <a href={c.href} target={c.kind === "call" ? undefined : "_blank"} rel={c.kind === "call" ? undefined : "noopener noreferrer"}
                className="flex min-h-14 items-center gap-3 rounded-[var(--ros-radius-md)] border border-border bg-surface px-4 py-3 hover:bg-subtle">
                <span className="text-link">{META[c.kind].icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{META[c.kind].label}</span>
                  <span className="block truncate text-sm text-muted">{c.detail}</span>
                </span>
                {c.kind !== "call" && <ExternalLink className="size-4 text-muted" aria-hidden />}
              </a>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}
