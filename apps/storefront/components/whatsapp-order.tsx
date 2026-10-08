"use client";
// "Order on WhatsApp" (ADR-014). The prefilled message says exactly what the customer picked: from a dish, that
// dish with its quantity, portion and add-ons; from anywhere else (cart, checkout, header, homepage, footer), the
// whole cart. The text is built when the link is clicked, so it always matches the current selection and cart.
import { useEffect, type MouseEvent } from "react";
import { MessageCircle } from "lucide-react";
import { whatsappOrderMessage, type MessageDetails, type MessageLine } from "@restaurant-os/domain";
import { buttonClass, cx } from "@restaurant-os/ui";
import { useCart, type CartItem } from "@/lib/cart";
import { useStore } from "./providers";

export function cartMessageLines(items: CartItem[]): MessageLine[] {
  return items.map((i) => ({ name: i.name, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, options: i.options ?? [], optionLabels: i.optionLabels }));
}

function waHref(number: string, text: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export interface WhatsAppOrderLinkProps {
  /** The lines to send; defaults to the whole cart. */
  lines?: MessageLine[];
  details?: MessageDetails | null;
  /** Single-dish messages link back to the dish. */
  dishSlug?: string;
  /** Required options are missing: the click shows the problem instead of opening WhatsApp. */
  blocked?: boolean;
  onBlocked?: () => void;
  variant?: "button" | "text";
  label?: string;
  className?: string;
}

/** Shown only when the restaurant has a WhatsApp number and "Order on WhatsApp" buttons switched on. */
export function WhatsAppOrderLink({ lines, details, dishSlug, blocked, onBlocked, variant = "button", label = "Order on WhatsApp", className }: WhatsAppOrderLinkProps) {
  const { whatsapp, name, currency } = useStore();
  const { items } = useCart();
  if (!whatsapp) return null;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (blocked) { e.preventDefault(); onBlocked?.(); return; }
    const link = dishSlug ? `${window.location.origin}/menu/${dishSlug}` : null;
    e.currentTarget.href = waHref(whatsapp, whatsappOrderMessage({ storeName: name, currency, lines: lines ?? cartMessageLines(items), link, details }));
  };
  return (
    <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" onClick={onClick} data-testid="whatsapp-order"
      className={cx(variant === "button" ? buttonClass("outline", "lg", "w-full ros-press") : "inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline", className)}>
      <MessageCircle className={variant === "button" ? "size-5" : "size-4"} aria-hidden />{label}
    </a>
  );
}

/**
 * The restaurant's general "order on WhatsApp" links (header sheet, homepage buttons, footer) are rendered on the
 * server with a plain greeting and marked `data-wa-cart`. When the cart has items, a click rewrites the message to
 * list the cart; with an empty cart the greeting is kept.
 */
export function WhatsAppCartLinks() {
  const { items } = useCart();
  const { name, currency } = useStore();
  useEffect(() => {
    const onClick = (e: globalThis.MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[data-wa-cart]") as HTMLAnchorElement | null;
      if (!a) return;
      const original = a.dataset.waHref ?? a.href;
      a.dataset.waHref = original;
      if (!items.length) { a.href = original; return; }
      const url = new URL(original);
      url.searchParams.set("text", whatsappOrderMessage({ storeName: name, currency, lines: cartMessageLines(items) }));
      a.href = url.toString().replace(/\+/g, "%20");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [items, name, currency]);
  return null;
}
