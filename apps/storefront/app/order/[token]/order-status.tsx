"use client";
// Order confirmation + live status (PRD 5.2 "order confirmation", "order status page").
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, MessageCircle, Phone, RotateCcw, XCircle } from "lucide-react";
import type { OrderStatus as Status, PaymentAction, PublicOrder } from "@restaurant-os/types";
import { Alert, Button, Card, CartLine, OrderTimeline, buttonClass, formatDateTime, formatMoney, toast, type TimelineItem } from "@restaurant-os/ui";
import { ApiRequestError, clientRequest } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useStore } from "@/components/providers";

const DELIVERY_STEPS: [Status, string][] = [["NEW", "Order received"], ["ACCEPTED", "Accepted by the restaurant"], ["PREPARING", "Being prepared"], ["READY", "Ready"], ["DISPATCHED", "Out for delivery"], ["DELIVERED", "Delivered"]];
const PICKUP_STEPS: [Status, string][] = [["NEW", "Order received"], ["ACCEPTED", "Accepted by the restaurant"], ["PREPARING", "Being prepared"], ["READY", "Ready for pickup"], ["DELIVERED", "Collected"]];
const RANK: Record<Status, number> = { NEW: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, PACKED: 3, DISPATCHED: 4, DELIVERED: 5, CANCELLED: -1 };

function timeline(order: PublicOrder): TimelineItem[] {
  const steps = order.fulfillmentType === "PICKUP" ? PICKUP_STEPS : DELIVERY_STEPS;
  const reached = (s: Status) => order.timeline.find((t) => t.status === s || (s === "READY" && t.status === "PACKED"))?.at ?? null;
  const current = RANK[order.status];
  return steps.map(([status, label]) => {
    const rank = RANK[status];
    const state: TimelineItem["state"] = rank < current || order.status === "DELIVERED" ? "done" : rank === current ? (status === "DELIVERED" ? "done" : "current") : "upcoming";
    const detail = status === "DISPATCHED" && order.delivery?.riderName ? `With ${order.delivery.riderName}${order.delivery.riderPhone ? ` · ${order.delivery.riderPhone}` : ""}` : null;
    return { label, at: reached(status), state, detail };
  });
}

export function OrderStatus({ initial }: { initial: PublicOrder }) {
  const [order, setOrder] = useState(initial);
  const [retrying, setRetrying] = useState(false);
  const { slug } = useStore();
  const { add, setOpen } = useCart();
  const router = useRouter();
  const params = useSearchParams();
  const paid = order.paymentStatus === "CAPTURED" || order.paymentStatus === "PARTIALLY_REFUNDED";
  const live = order.status !== "DELIVERED" && order.status !== "CANCELLED";

  useEffect(() => {
    if (params.get("paid") === "1" && paid) toast.success("Payment received — your order is confirmed!");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!live) return;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try { setOrder(await clientRequest<PublicOrder>(`/v1/storefront/${slug}/orders/${order.token}`)); } catch { /* keep last known state */ }
    };
    const t = setInterval(poll, 15_000);
    document.addEventListener("visibilitychange", poll);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", poll); };
  }, [live, slug, order.token]);

  const retryPayment = async () => {
    setRetrying(true);
    try {
      const res = await clientRequest<{ action: PaymentAction }>(`/v1/storefront/${slug}/orders/${order.token}/payments`, { method: "POST", body: {} });
      router.push(res.action.url ?? `/order/${order.token}/pay`);
    } catch (e) {
      setRetrying(false);
      toast.error(e instanceof ApiRequestError ? e.message : "Couldn't restart the payment.");
    }
  };

  // Re-adds the same dishes and options; checkout re-prices them and flags anything now unavailable.
  const reorder = () => {
    let added = 0;
    for (const item of order.items) {
      if (!item.productId) continue;
      add({ productId: item.productId, slug: "", name: item.name, modifierIds: item.modifierIds, optionLabels: item.modifiers.map((m) => m.name), unitPriceMinor: item.unitPriceMinor, imageUrl: null }, item.quantity);
      added++;
    }
    if (added) { toast.success("Added to your cart — prices are confirmed again at checkout."); setOpen(true); }
    else router.push("/menu");
  };

  const whatsapp = order.store.whatsapp.replace(/\D/g, "");
  const waUrl = whatsapp.length >= 10 ? `https://wa.me/${whatsapp.length === 10 ? `91${whatsapp}` : whatsapp}?text=${encodeURIComponent(`Hi, about my order #${order.number}`)}` : null;

  return (
    <div className="mx-auto max-w-3xl">
      {order.status === "CANCELLED" ? (
        <Header icon={<XCircle className="size-8 text-danger" aria-hidden />} title={`Order #${order.number} was cancelled`}
          subtitle={[order.cancelReason, order.refundedMinor > 0 ? `${formatMoney(order.refundedMinor, order.currency)} refunded — it usually reaches your account in 5–7 working days.` : null].filter(Boolean).join(". ")} />
      ) : !paid ? (
        <Header icon={<AlertTriangle className="size-8 text-warning" aria-hidden />} title={order.paymentStatus === "FAILED" ? "Payment didn't go through" : "Waiting for payment"}
          subtitle={order.canRetryPayment ? `No money was taken. Your order is held${order.paymentExpiresAt ? ` until ${formatDateTime(order.paymentExpiresAt, { timeStyle: "short" })}` : ""}.` : "The payment window has closed."} />
      ) : order.status === "DELIVERED" ? (
        <Header icon={<CheckCircle2 className="size-8 text-success" aria-hidden />} title={order.fulfillmentType === "PICKUP" ? "Collected — enjoy!" : "Delivered — enjoy your meal!"} subtitle={`Order #${order.number}`} />
      ) : (
        <Header icon={<CheckCircle2 className="size-8 text-success" aria-hidden />} title={`Order #${order.number} confirmed`}
          subtitle={order.etaMin !== null && order.etaMax !== null ? `${order.fulfillmentType === "PICKUP" ? "Ready for pickup" : "Arriving"} in about ${order.etaMin}–${order.etaMax} min after the restaurant accepts.` : "We'll keep this page updated."} />
      )}

      {!paid && order.status !== "CANCELLED" && order.canRetryPayment && (
        <Alert tone="warning" className="mt-4" title="Complete your payment to confirm the order"
          action={<Button loading={retrying} onClick={() => void retryPayment()}>{order.paymentStatus === "FAILED" ? "Try again" : "Pay now"}</Button>}>
          {formatMoney(order.totalMinor, order.currency)} via UPI, card or netbanking.
        </Alert>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base ros-heading">Progress</h2>
            {live && paid && <span className="text-xs text-muted" aria-live="polite">Updates automatically</span>}
          </div>
          <div className="mt-4">
            {order.status === "CANCELLED" || !paid
              ? <OrderTimeline items={[{ label: "Order placed", at: order.createdAt, state: "done" }, order.status === "CANCELLED" ? { label: "Cancelled", state: "error", detail: order.cancelReason } : { label: "Payment pending", state: "current" }]} />
              : <OrderTimeline items={timeline(order)} />}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-base ros-heading">Need help?</h2>
            <div className="mt-3 flex flex-col gap-2">
              {order.store.phone && <a href={`tel:${order.store.phone}`} className={buttonClass("outline", "md", "justify-start")}><Phone className="size-4" aria-hidden />Call {order.store.name}</a>}
              {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "md", "justify-start")}><MessageCircle className="size-4" aria-hidden />WhatsApp us</a>}
            </div>
          </Card>
          {order.address && (
            <Card>
              <h2 className="text-base ros-heading">Delivering to</h2>
              <address className="mt-2 text-sm not-italic text-muted">{[order.address.line1, order.address.line2, order.address.landmark, order.address.city, order.address.postalCode].filter(Boolean).join(", ")}</address>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-6">
        <h2 className="text-base ros-heading">Your order</h2>
        <ul className="mt-1 divide-y divide-border">
          {order.items.map((item, i) => (
            <li key={i}><CartLine name={item.name} options={item.modifiers.map((m) => m.name)} quantity={item.quantity} unitPriceMinor={item.unitPriceMinor} lineTotalMinor={item.lineTotalMinor} currency={order.currency} /></li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Item total</dt><dd>{formatMoney(order.subtotalMinor, order.currency)}</dd></div>
          {order.discountMinor > 0 && <div className="flex justify-between text-success"><dt>Discount{order.promotionCode ? ` (${order.promotionCode})` : ""}</dt><dd>−{formatMoney(order.discountMinor, order.currency)}</dd></div>}
          {order.feeMinor > 0 && <div className="flex justify-between"><dt className="text-muted">Delivery fee</dt><dd>{formatMoney(order.feeMinor, order.currency)}</dd></div>}
          <div className="flex justify-between text-base font-semibold"><dt>{paid ? "Paid" : "Total"}</dt><dd>{formatMoney(order.totalMinor, order.currency)}</dd></div>
          {order.refundedMinor > 0 && <div className="flex justify-between text-muted"><dt>Refunded</dt><dd>−{formatMoney(order.refundedMinor, order.currency)}</dd></div>}
        </dl>
        {order.customerNote && <p className="mt-3 rounded-[var(--ros-radius-md)] bg-subtle p-3 text-sm"><span className="font-medium">Your note:</span> {order.customerNote}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={reorder} icon={<RotateCcw className="size-4" aria-hidden />}>Order again</Button>
          <Link href="/menu" className={buttonClass("ghost")}>Back to menu</Link>
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-muted">Placed {formatDateTime(order.createdAt)} · Keep this link to check your order.</p>
    </div>
  );
}

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div>
        <h1 className="text-2xl ros-heading">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
