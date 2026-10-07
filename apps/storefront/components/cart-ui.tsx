"use client";
// Cart button, cart drawer and the mobile sticky cart bar. The drawer previews the delivery fee (a live server
// quote when the customer's pincode is known from a previous order on this device), shows how close the cart is to
// free delivery and to the restaurant's offers, and lets every line be changed or removed. Every number the
// customer commits to is still the checkout's server quote.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingBag, Tag, Trash2, Truck, UtensilsCrossed } from "lucide-react";
import type { PublicOffer, Quote } from "@restaurant-os/types";
import { Button, Drawer, EmptyState, formatMoney, QuantityStepper, buttonClass, cx } from "@restaurant-os/ui";
import { clientRequest } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useStore } from "./providers";

export function CartButton() {
  const { count, setOpen, ready } = useCart();
  const previous = useRef(count);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (ready && count > previous.current) setBump((b) => b + 1);
    previous.current = count;
  }, [count, ready]);
  return (
    <button type="button" onClick={() => setOpen(true)} className="ros-press relative inline-flex h-10 items-center gap-2 rounded-chip border border-header-border bg-header px-3 text-sm font-medium text-header-fg hover:bg-header-chip"
      aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}>
      <ShoppingBag className="size-5" aria-hidden />
      <span className="hidden sm:inline">Cart</span>
      {ready && count > 0 && <span key={bump} className={cx("flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-contrast", bump > 0 && "ros-bump")}>{count}</span>}
    </button>
  );
}

interface SavedDetails { address?: { postalCode?: string; city?: string }; fulfillment?: "DELIVERY" | "PICKUP" }

function savedDetails(): SavedDetails | null {
  try { return JSON.parse(localStorage.getItem("ros-checkout-details") ?? "null") as SavedDetails | null; } catch { return null; }
}

/** Live fee for the saved pincode (only while the drawer is open). */
function useDeliveryPreview(open: boolean) {
  const { items } = useCart();
  const { slug, delivery } = useStore();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pincode, setPincode] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !items.length || !delivery.enabled) return;
    const saved = savedDetails();
    const pin = saved?.fulfillment !== "PICKUP" ? saved?.address?.postalCode : undefined;
    if (!pin || !/^[1-9][0-9]{5}$/.test(pin)) { setPincode(null); setQuote(null); return; }
    setPincode(pin);
    const controller = new AbortController();
    const t = setTimeout(() => {
      clientRequest<Quote>(`/v1/storefront/${slug}/checkout/quote`, {
        signal: controller.signal,
        body: {
          lines: items.map((i) => ({ productId: i.productId, quantity: i.quantity, modifierIds: i.modifierIds })), fulfillmentType: "DELIVERY",
          address: { line1: "pending", line2: "", landmark: "", city: saved?.address?.city || "pending", region: "", postalCode: pin, location: null }, promotionCode: "", customerPhone: "",
        },
      }).then(setQuote).catch(() => setQuote(null));
    }, 350);
    return () => { clearTimeout(t); controller.abort(); };
  }, [open, items, slug, delivery.enabled]);
  return { quote, pincode };
}

function useOffers(open: boolean) {
  const { slug } = useStore();
  const [offers, setOffers] = useState<PublicOffer[] | null>(null);
  useEffect(() => {
    if (!open || offers) return;
    clientRequest<{ items: PublicOffer[] }>(`/v1/storefront/${slug}/offers`).then((r) => setOffers(r.items)).catch(() => setOffers([]));
  }, [open, offers, slug]);
  return offers ?? [];
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CartDrawer() {
  const { items, open, setOpen, setQuantity, remove, subtotalMinor, count } = useCart();
  const { currency, delivery } = useStore();
  const router = useRouter();
  const { quote, pincode } = useDeliveryPreview(open);
  const offers = useOffers(open);
  const subtotal = quote?.subtotalMinor ?? subtotalMinor;
  const money = (m: number) => formatMoney(m, currency);

  // Free delivery: the customer's own area when we know it, else the restaurant-wide threshold when every area shares it.
  const freeFrom = quote?.delivery ? quote.delivery.freeDeliveryMinimumMinor : delivery.sameFreeThresholdEverywhere ? delivery.freeFromMinor : null;
  // The nearest offer: the best one already unlocked, or the one closest to unlocking.
  const unlocked = offers.filter((o) => subtotal >= o.minimumOrderMinor).sort((a, b) => b.minimumOrderMinor - a.minimumOrderMinor)[0];
  const next = offers.filter((o) => subtotal < o.minimumOrderMinor).sort((a, b) => a.minimumOrderMinor - b.minimumOrderMinor)[0];

  const deliveryLine = !delivery.enabled ? null
    : quote?.delivery ? { label: `Delivery to ${pincode}`, value: quote.feeMinor ? money(quote.feeMinor) : "Free" }
      : quote && quote.issues.some((i) => i.code === "ADDRESS_NOT_SERVICEABLE") ? { label: `Delivery to ${pincode}`, value: "Not available" }
        : delivery.lowestFeeMinor !== null ? { label: "Delivery", value: delivery.lowestFeeMinor ? `from ${money(delivery.lowestFeeMinor)}` : "Free" } : null;

  return (
    <Drawer open={open} onOpenChange={setOpen} title="Your order" description={count ? `${count} item${count === 1 ? "" : "s"}` : undefined}
      footer={items.length > 0 ? (
        <div className="space-y-3">
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between"><dt className="text-muted">Item total</dt><dd className="font-semibold tabular-nums">{money(subtotal)}</dd></div>
            {deliveryLine && <div className="flex items-center justify-between"><dt className="text-muted">{deliveryLine.label}</dt><dd className="tabular-nums">{deliveryLine.value}</dd></div>}
          </dl>
          <p className="text-xs text-muted">{unlocked ? "Apply your code at checkout — the final total is confirmed there." : "Offers and the final total are confirmed at checkout."}</p>
          <Button size="lg" block className="ros-press" onClick={() => { setOpen(false); router.push("/checkout"); }}>Go to checkout · {money(subtotal + (quote?.delivery ? quote.feeMinor : 0))}</Button>
        </div>
      ) : undefined}>
      {items.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="size-6" />} title="Your cart is empty" description="Add something tasty from the menu."
          action={<Link href="/menu" onClick={() => setOpen(false)} className={buttonClass("primary")}>Browse the menu</Link>} />
      ) : (
        <>
          {(freeFrom || unlocked || next) && (
            <div className="mb-3 space-y-2">
              {freeFrom !== null && freeFrom !== undefined && (
                <div className="rounded-[var(--ros-radius-md)] bg-subtle p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium"><Truck className="size-4 text-success" aria-hidden />
                    {subtotal >= freeFrom ? "You've got free delivery!" : `Add ${money(freeFrom - subtotal)} more for free delivery`}
                  </p>
                  <div className="mt-2"><Progress value={subtotal} max={freeFrom} label="Progress to free delivery" /></div>
                </div>
              )}
              {unlocked && (
                <p className="flex items-start gap-2 rounded-[var(--ros-radius-md)] bg-success-soft p-3 text-sm text-success">
                  <Tag className="mt-0.5 size-4 shrink-0" aria-hidden /><span>Use <span className="font-mono font-semibold">{unlocked.code}</span> at checkout — {unlocked.summary}</span>
                </p>
              )}
              {!unlocked && next && (
                <p className="flex items-start gap-2 rounded-[var(--ros-radius-md)] bg-primary-soft p-3 text-sm text-text">
                  <Tag className="mt-0.5 size-4 shrink-0 text-link" aria-hidden /><span>Add {money(next.minimumOrderMinor - subtotal)} more to use <span className="font-mono font-semibold">{next.code}</span> ({next.summary})</span>
                </p>
              )}
            </div>
          )}
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.key} className="flex items-start gap-3 py-3">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-image bg-subtle">
                  {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : <UtensilsCrossed className="m-auto mt-4 size-5 text-faint" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{item.name}</p>
                  {item.optionLabels.length > 0 && <p className="mt-0.5 text-sm text-muted">{item.optionLabels.join(" · ")}</p>}
                  <p className="mt-1 text-sm"><span className="font-medium tabular-nums">{money(item.unitPriceMinor * item.quantity)}</span>{item.quantity > 1 && <span className="text-muted"> · {money(item.unitPriceMinor)} each</span>}</p>
                  <button type="button" onClick={() => remove(item.key)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline" aria-label={`Remove ${item.name}`}>
                    <Trash2 className="size-3.5" aria-hidden />Remove
                  </button>
                </div>
                <QuantityStepper value={item.quantity} onChange={(q) => setQuantity(item.key, q)} label={item.name} size="sm" />
              </li>
            ))}
          </ul>
        </>
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
    <div className="ros-fade-up fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "lg", "ros-press w-full justify-between")}>
        <span>{count} item{count === 1 ? "" : "s"} · {formatMoney(subtotalMinor, currency)}</span>
        <span>View cart →</span>
      </button>
    </div>
  );
}
