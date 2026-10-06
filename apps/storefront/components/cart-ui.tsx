"use client";
// Cart button, cart drawer and the mobile sticky cart bar.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { Button, Drawer, EmptyState, formatMoney, QuantityStepper, buttonClass } from "@restaurant-os/ui";
import { useCart } from "@/lib/cart";
import { useStore } from "./providers";

export function CartButton() {
  const { count, setOpen, ready } = useCart();
  return (
    <button type="button" onClick={() => setOpen(true)} className="relative inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-surface px-3 text-sm font-medium hover:bg-subtle"
      aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}>
      <ShoppingBag className="size-5" aria-hidden />
      <span className="hidden sm:inline">Cart</span>
      {ready && count > 0 && <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-contrast">{count}</span>}
    </button>
  );
}

export function CartDrawer() {
  const { items, open, setOpen, setQuantity, subtotalMinor, count } = useCart();
  const { currency } = useStore();
  const router = useRouter();
  return (
    <Drawer open={open} onOpenChange={setOpen} title="Your order" description={count ? `${count} item${count === 1 ? "" : "s"}` : undefined}
      footer={items.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Item total</span>
            <span className="font-semibold">{formatMoney(subtotalMinor, currency)}</span>
          </div>
          <p className="text-xs text-muted">Delivery fee and offers are calculated at checkout.</p>
          <Button size="lg" block onClick={() => { setOpen(false); router.push("/checkout"); }}>Go to checkout</Button>
        </div>
      ) : undefined}>
      {items.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="size-6" />} title="Your cart is empty" description="Add something tasty from the menu."
          action={<Link href="/menu" onClick={() => setOpen(false)} className={buttonClass("primary")}>Browse the menu</Link>} />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.name}</p>
                {item.optionLabels.length > 0 && <p className="mt-0.5 text-sm text-muted">{item.optionLabels.join(" · ")}</p>}
                <p className="mt-1 text-sm font-medium">{formatMoney(item.unitPriceMinor * item.quantity, currency)}</p>
              </div>
              <QuantityStepper value={item.quantity} onChange={(q) => setQuantity(item.key, q)} label={item.name} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

/** Thumb-reachable "View cart" bar on phones (docs/WEBSTORE.md sticky direct-order CTA). */
export function StickyCartBar() {
  const { count, subtotalMinor, setOpen, ready } = useCart();
  const { currency } = useStore();
  const pathname = usePathname();
  if (!ready || count === 0 || pathname.startsWith("/checkout") || pathname.startsWith("/order")) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "lg", "w-full justify-between")}>
        <span>{count} item{count === 1 ? "" : "s"} · {formatMoney(subtotalMinor, currency)}</span>
        <span>View cart →</span>
      </button>
    </div>
  );
}
