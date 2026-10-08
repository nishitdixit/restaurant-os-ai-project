"use client";
// Order detail + every operational action (PRD 5.4): status changes, dispatch, delivery updates,
// cancellation with reason/refund, partial refunds, staff notes and the full audit timeline.
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, MapPin, MessageSquare, Phone, Store } from "lucide-react";
import { CANCEL_REASON_CODES, CANCEL_REASON_LABELS, ORDER_STATUS_LABELS } from "@restaurant-os/domain";
import type { AdminOrderDetail, OrderStatus } from "@restaurant-os/types";
import {
  Alert, Badge, Button, Card, CartLine, Checkbox, ConfirmDialog, ErrorState, Field, Input, Modal, Select, Skeleton, StatusPill, Textarea,
  formatDateTime, formatMoney, toast,
} from "@restaurant-os/ui";
import { ApiError, errorMessage, fromMinor, toMinor } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";
import { CHANNEL_LABELS, PAYMENT_LABELS } from "@/lib/order-labels";
import { OrderSourceBadges } from "./order-badges";

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "Accept order", PREPARING: "Start preparing", READY: "Mark ready", PACKED: "Mark packed", DELIVERED: "Mark completed",
};

export function nextAction(order: { status: OrderStatus; fulfillmentType: "DELIVERY" | "PICKUP"; paymentStatus: string }): { to: OrderStatus | "DISPATCH"; label: string } | null {
  switch (order.status) {
    case "NEW": return order.paymentStatus === "CAPTURED" ? { to: "ACCEPTED", label: "Accept" } : null;
    case "ACCEPTED": return { to: "PREPARING", label: "Start preparing" };
    case "PREPARING": return { to: "READY", label: "Mark ready" };
    case "READY":
    case "PACKED": return order.fulfillmentType === "DELIVERY" ? { to: "DISPATCH", label: "Dispatch" } : { to: "DELIVERED", label: "Collected" };
    case "DISPATCHED": return { to: "DELIVERED", label: "Delivered" };
    default: return null;
  }
}

export function useOrderMutations(orderId: string) {
  const { request } = useSession();
  const qc = useQueryClient();
  const detailKey = useTenantKey("order", orderId);
  const ordersKey = useTenantKey("orders");
  const done = (data: AdminOrderDetail, message: string) => {
    qc.setQueryData(detailKey, data);
    void qc.invalidateQueries({ queryKey: ordersKey });
    toast.success(message);
  };
  const onError = (e: unknown) => toast.error(errorMessage(e));
  return {
    transition: useMutation({
      mutationFn: (to: OrderStatus) => request<AdminOrderDetail>(`/v1/admin/orders/${orderId}/transition`, { body: { to } }),
      onSuccess: (d) => done(d, `Order #${d.number}: ${ORDER_STATUS_LABELS[d.status]}`), onError,
    }),
    dispatch: useMutation({
      mutationFn: (body: { riderName: string; riderPhone: string; trackingReference: string; notes: string }) => request<AdminOrderDetail>(`/v1/admin/orders/${orderId}/dispatch`, { body: { ...body, provider: "MANUAL" } }),
      onSuccess: (d) => done(d, `Order #${d.number} dispatched with ${d.delivery?.riderName}`), onError,
    }),
    delivery: useMutation({
      mutationFn: (body: { status: "PICKED_UP" | "DELIVERED" | "FAILED"; note: string }) => request<AdminOrderDetail>(`/v1/admin/orders/${orderId}/delivery`, { body }),
      onSuccess: (d) => done(d, `Delivery updated`), onError,
    }),
    markPaid: useMutation({
      mutationFn: (method: "CASH" | "UPI" | "CARD") => request<AdminOrderDetail>(`/v1/admin/orders/${orderId}/mark-paid`, { body: { method } }),
      onSuccess: (d) => done(d, `Order #${d.number}: payment received (${PAYMENT_LABELS[d.paymentMethod ?? "CASH"]})`), onError,
    }),
  };
}

function DispatchDialog({ order, open, onOpenChange }: { order: AdminOrderDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { dispatch } = useOrderMutations(order.id);
  const [form, setForm] = useState({ riderName: order.delivery?.riderName ?? "", riderPhone: order.delivery?.riderPhone ?? "", trackingReference: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Dispatch order #${order.number}`} description="Record who is delivering it. The customer is told it's on the way."
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button loading={dispatch.isPending} onClick={() => {
          if (!form.riderName.trim()) { setError("Enter the rider's name."); return; }
          dispatch.mutate(form, { onSuccess: () => onOpenChange(false) });
        }}>Dispatch</Button>
      </>}>
      <div className="space-y-4">
        {order.address && <Alert tone="neutral" title="Deliver to">{[order.address.line1, order.address.line2, order.address.landmark, order.address.city, order.address.postalCode].filter(Boolean).join(", ")}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rider name" required error={error}>{(p) => <Input {...p} autoFocus value={form.riderName} onChange={(e) => setForm({ ...form, riderName: e.target.value })} />}</Field>
          <Field label="Rider phone">{(p) => <Input {...p} type="tel" value={form.riderPhone} onChange={(e) => setForm({ ...form, riderPhone: e.target.value })} />}</Field>
        </div>
        <Field label="Booking / tracking reference" hint="e.g. a Porter or Dunzo booking ID, if you used one">{(p) => <Input {...p} value={form.trackingReference} onChange={(e) => setForm({ ...form, trackingReference: e.target.value })} />}</Field>
        <Field label="Notes for the rider">{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}

function CancelDialog({ order, open, onOpenChange }: { order: AdminOrderDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { request } = useSession();
  const qc = useQueryClient();
  const detailKey = useTenantKey("order", order.id);
  const ordersKey = useTenantKey("orders");
  const [reasonCode, setReason] = useState<(typeof CANCEL_REASON_CODES)[number]>("CUSTOMER_REQUEST");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState(true);
  const paid = order.refundableMinor > 0;
  const cancel = useMutation({
    mutationFn: () => request<{ order: AdminOrderDetail; refundError: string | null }>(`/v1/admin/orders/${order.id}/cancel`, { body: { reasonCode, note, refund: paid && refund } }),
    onSuccess: (res) => {
      qc.setQueryData(detailKey, res.order);
      void qc.invalidateQueries({ queryKey: ordersKey });
      onOpenChange(false);
      if (res.refundError) toast.warning(`Order cancelled, but the refund failed: ${res.refundError}. Retry it from the order.`);
      else toast.success(`Order #${order.number} cancelled${paid && refund ? " and refunded" : ""}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} title={`Cancel order #${order.number}?`} description="The customer is notified with the reason." tone="danger"
      confirmLabel="Cancel order" loading={cancel.isPending} onConfirm={() => cancel.mutate()}>
      <div className="space-y-4">
        <Field label="Reason" required>{(p) => (
          <Select {...p} value={reasonCode} onChange={(e) => setReason(e.target.value as typeof reasonCode)}>
            {CANCEL_REASON_CODES.filter((c) => c !== "PAYMENT_NOT_COMPLETED").map((c) => <option key={c} value={c}>{CANCEL_REASON_LABELS[c]}</option>)}
          </Select>
        )}</Field>
        <Field label={reasonCode === "OTHER" ? "Note" : "Note (optional)"} required={reasonCode === "OTHER"}>{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {paid && <Checkbox checked={refund} onChange={(e) => setRefund(e.target.checked)} label={`Refund ${formatMoney(order.refundableMinor, order.currency)} to the customer`}
          description={order.paymentMethod ? "Paid to you directly, so you return the money yourself (cash / UPI); this records the refund." : "Recommended. Turn off only if you'll settle it another way."} />}
      </div>
    </ConfirmDialog>
  );
}

function RefundDialog({ order, open, onOpenChange }: { order: AdminOrderDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { request } = useSession();
  const qc = useQueryClient();
  const detailKey = useTenantKey("order", order.id);
  const [amount, setAmount] = useState(fromMinor(order.refundableMinor));
  const [reason, setReason] = useState("");
  const [key] = useState(() => `refund-${crypto.randomUUID()}`);
  const [error, setError] = useState<string | null>(null);
  const refund = useMutation({
    mutationFn: (amountMinor: number) => request<{ order: AdminOrderDetail }>(`/v1/admin/orders/${order.id}/refunds`, { body: { amountMinor, reason }, headers: { "idempotency-key": key } }),
    onSuccess: (res) => { qc.setQueryData(detailKey, res.order); onOpenChange(false); toast.success("Refund issued"); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Issue a refund" description={`Up to ${formatMoney(order.refundableMinor, order.currency)} can be refunded.`} size="sm"
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Back</Button>
        <Button loading={refund.isPending} onClick={() => {
          const minor = toMinor(amount);
          if (!minor || minor > order.refundableMinor) { setError(`Enter an amount up to ${formatMoney(order.refundableMinor, order.currency)}.`); return; }
          if (!reason.trim()) { setError("Add a reason."); return; }
          refund.mutate(minor);
        }}>Refund</Button>
      </>}>
      <div className="space-y-4">
        <Field label="Amount" required>{(p) => <Input {...p} inputMode="decimal" prefix="₹" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label="Reason" required>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item missing" />}</Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { request, can, membership } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("order", orderId);
  const { data: order, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => request<AdminOrderDetail>(`/v1/admin/orders/${orderId}`), refetchInterval: 20_000 });
  const { transition, delivery, markPaid } = useOrderMutations(orderId);
  const [dialog, setDialog] = useState<null | "dispatch" | "cancel" | "refund" | "fail">(null);
  const [note, setNote] = useState("");
  const [failNote, setFailNote] = useState("");
  const addNote = useMutation({
    mutationFn: () => request<AdminOrderDetail>(`/v1/admin/orders/${orderId}/notes`, { body: { body: note } }),
    onSuccess: (d) => { qc.setQueryData(key, d); setNote(""); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  if (error || !order) return <ErrorState description={errorMessage(error)} requestId={error instanceof ApiError ? error.requestId : null} onRetry={() => void refetch()} />;

  const manage = can("order.manage");
  const isManager = ["OWNER", "MANAGER", "PLATFORM_ADMIN"].includes(membership?.role ?? "");
  const next = nextAction(order);
  const transitions = order.allowedTransitions.filter((t) => t !== "CANCELLED" && t !== "DISPATCHED" && t !== next?.to);
  const busy = transition.isPending || delivery.isPending || markPaid.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill kind="order" status={order.status} />
        <StatusPill kind="payment" status={order.paymentStatus} />
        {order.delivery && <StatusPill kind="delivery" status={order.delivery.status} />}
        <Badge>{order.fulfillmentType === "DELIVERY" ? <><Bike className="size-3" aria-hidden /> Delivery</> : <><Store className="size-3" aria-hidden /> Pickup</>}</Badge>
        <OrderSourceBadges order={order} />
        <span className="ml-auto text-xs text-muted">Placed {formatDateTime(order.createdAt)}</span>
      </div>
      {order.createdBy && (
        <p className="-mt-3 text-sm text-muted">
          Entered by {order.createdBy} · {CHANNEL_LABELS[order.channel] ?? order.channel} order{order.paymentMethod && !order.paymentDue ? ` · paid by ${PAYMENT_LABELS[order.paymentMethod].toLowerCase()}` : ""}
        </p>
      )}

      {order.paymentDue && (
        <Alert tone="warning" title={`Collect ${formatMoney(order.totalMinor, order.currency)} on ${order.fulfillmentType === "DELIVERY" ? "delivery" : "pickup"}`}
          action={manage ? (
            <span className="flex flex-wrap gap-1.5">
              {(["CASH", "UPI", "CARD"] as const).map((m) => <Button key={m} size="sm" variant="outline" disabled={busy} loading={markPaid.isPending && markPaid.variables === m} onClick={() => markPaid.mutate(m)}>Paid · {PAYMENT_LABELS[m]}</Button>)}
            </span>
          ) : undefined}>
          This order isn&apos;t counted in sales until it&apos;s marked paid.
        </Alert>
      )}

      {order.status === "NEW" && order.paymentStatus !== "CAPTURED" && (
        <Alert tone="warning" title="Waiting for payment">Don&apos;t start cooking yet. Unpaid orders cancel themselves when the payment window closes.</Alert>
      )}
      {order.status === "CANCELLED" && order.refundableMinor > 0 && isManager && (
        <Alert tone="danger" title="Paid order is cancelled" action={<Button size="sm" onClick={() => setDialog("refund")}>Refund now</Button>}>
          {formatMoney(order.refundableMinor, order.currency)} has not been refunded yet.
        </Alert>
      )}
      {order.delivery?.status === "FAILED" && <Alert tone="danger" title="Delivery failed">{order.delivery.failureReason} — dispatch again or cancel the order.</Alert>}

      {manage && order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
        <div className="flex flex-wrap gap-2">
          {next && (next.to === "DISPATCH"
            ? can("delivery.manage") && <Button size="lg" onClick={() => setDialog("dispatch")}>Dispatch</Button>
            : <Button size="lg" loading={transition.isPending} disabled={busy} onClick={() => transition.mutate(next.to as OrderStatus)}>{ACTION_LABEL[next.to as OrderStatus] ?? next.label}</Button>)}
          {order.status === "DISPATCHED" && order.delivery?.status === "ASSIGNED" && <Button variant="outline" disabled={busy} onClick={() => delivery.mutate({ status: "PICKED_UP", note: "" })}>Rider picked up</Button>}
          {order.status === "DISPATCHED" && order.delivery?.status === "FAILED" && can("delivery.manage") && <Button onClick={() => setDialog("dispatch")}>Reassign rider</Button>}
          {order.status === "DISPATCHED" && order.delivery && order.delivery.status !== "FAILED" && <Button variant="outline" disabled={busy} onClick={() => setDialog("fail")}>Delivery failed</Button>}
          {transitions.map((t) => <Button key={t} variant="outline" disabled={busy} onClick={() => transition.mutate(t)}>{ACTION_LABEL[t] ?? ORDER_STATUS_LABELS[t]}</Button>)}
          {order.allowedTransitions.includes("CANCELLED") && <Button variant="ghost" className="text-danger" onClick={() => setDialog("cancel")}>Cancel order</Button>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold">Customer</h3>
          <p className="mt-2 font-medium">{order.customerName}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {order.customerPhone && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${order.customerPhone}`}><Phone className="size-3.5" aria-hidden />{order.customerPhone}</a>}
            {order.customerPhone && <a className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${order.customerPhone.replace(/\D/g, "")}`}><MessageSquare className="size-3.5" aria-hidden />WhatsApp</a>}
            {order.customerId && can("customer.read") && <Link className="text-muted hover:underline" href={`/customers/${order.customerId}`}>Customer history</Link>}
          </div>
          {order.address && (
            <div className="mt-3 text-sm">
              <p className="text-muted">{[order.address.line1, order.address.line2, order.address.landmark, order.address.city, order.address.postalCode].filter(Boolean).join(", ")}</p>
              <a className="mt-1 inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.address.line1, order.address.city, order.address.postalCode].join(", "))}`}><MapPin className="size-3.5" aria-hidden />Open in Maps</a>
            </div>
          )}
          {order.customerNote && <p className="mt-3 rounded-[var(--ros-radius-md)] bg-warning-soft p-2.5 text-sm"><span className="font-semibold">Customer note:</span> {order.customerNote}</p>}
          {!order.notifyCustomer && <p className="mt-3 text-xs text-muted">Order updates are not sent to this customer.</p>}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold">{order.delivery ? "Delivery" : order.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup"}</h3>
          {order.delivery ? (
            <dl className="mt-2 space-y-1 text-sm">
              <div><dt className="inline text-muted">Rider: </dt><dd className="inline font-medium">{order.delivery.riderName}{order.delivery.riderPhone && <> · <a className="text-primary hover:underline" href={`tel:${order.delivery.riderPhone}`}>{order.delivery.riderPhone}</a></>}</dd></div>
              {order.delivery.trackingReference && <div><dt className="inline text-muted">Reference: </dt><dd className="inline">{order.delivery.trackingReference}</dd></div>}
              {order.delivery.assignedAt && <div><dt className="inline text-muted">Assigned: </dt><dd className="inline">{formatDateTime(order.delivery.assignedAt, { timeStyle: "short" })}</dd></div>}
              {order.delivery.pickedUpAt && <div><dt className="inline text-muted">Picked up: </dt><dd className="inline">{formatDateTime(order.delivery.pickedUpAt, { timeStyle: "short" })}</dd></div>}
              {order.delivery.deliveredAt && <div><dt className="inline text-muted">Delivered: </dt><dd className="inline">{formatDateTime(order.delivery.deliveredAt, { timeStyle: "short" })}</dd></div>}
            </dl>
          ) : <p className="mt-2 text-sm text-muted">{order.etaMax ? `Promised within ${order.etaMax} min of acceptance.` : "Not dispatched yet."}</p>}
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold">Items</h3>
        <ul className="divide-y divide-border">
          {order.items.map((item, i) => <li key={i}><CartLine name={`${item.quantity} × ${item.name}`} options={item.modifiers.map((m) => m.name)} quantity={item.quantity} unitPriceMinor={item.unitPriceMinor} lineTotalMinor={item.lineTotalMinor} currency={order.currency} /></li>)}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(order.subtotalMinor, order.currency)}</dd></div>
          {order.discountMinor > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Discount {order.promotionCode && <Badge>{order.promotionCode}</Badge>} {order.promotionStaffOnly && <Badge tone="info">Staff only</Badge>}
                {order.promotionAppliedBy && <span className="block text-xs">Applied by {order.promotionAppliedBy}</span>}</dt>
              <dd>−{formatMoney(order.discountMinor, order.currency)}</dd>
            </div>
          )}
          {order.feeMinor > 0 && <div className="flex justify-between"><dt className="text-muted">Delivery fee</dt><dd>{formatMoney(order.feeMinor, order.currency)}</dd></div>}
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatMoney(order.totalMinor, order.currency)}</dd></div>
          {order.refunds.length > 0 && <div className="flex justify-between text-muted"><dt>Refunded</dt><dd>−{formatMoney(order.refunds.reduce((s, r) => s + r.amountMinor, 0), order.currency)}</dd></div>}
        </dl>
        {isManager && order.refundableMinor > 0 && order.status !== "CANCELLED" && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDialog("refund")}>Issue partial refund</Button>}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">Activity</h3>
        <ol className="mt-3 space-y-3">
          {order.timeline.map((t, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 text-xs text-muted">{formatDateTime(t.at, { timeStyle: "short" })}</span>
              <div className="min-w-0">
                <p className="font-medium">{t.label}{t.actor && <span className="font-normal text-muted"> · {t.actor}</span>}</p>
                {t.detail && <p className="text-muted">{t.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" aria-label="Internal note" />
          <Button type="submit" variant="outline" loading={addNote.isPending} disabled={!note.trim()}>Add</Button>
        </form>
      </Card>

      {dialog === "dispatch" && <DispatchDialog order={order} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "cancel" && <CancelDialog order={order} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "refund" && <RefundDialog order={order} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "fail" && (
        <ConfirmDialog open onOpenChange={(o) => !o && setDialog(null)} title="Mark delivery as failed?" tone="danger" confirmLabel="Mark failed" loading={delivery.isPending}
          onConfirm={() => { if (failNote.trim()) delivery.mutate({ status: "FAILED", note: failNote }, { onSuccess: () => setDialog(null) }); }}>
          <Field label="What happened?" required>{(p) => <Textarea {...p} rows={2} value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="e.g. Customer unreachable at the door" />}</Field>
        </ConfirmDialog>
      )}
    </div>
  );
}
