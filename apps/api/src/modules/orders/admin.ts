// Admin order operations (PRD 5.4, specs/orders, specs/delivery, docs/KITCHEN.md).
import {
  allowedTransitions, assertOrderTransitionAllowed, CANCEL_REASON_LABELS, ORDER_STATUS_LABELS, timestampColumnFor,
  type CancelReasonCode, type OrderStatus,
} from "@restaurant-os/domain";
import type { AdminOrderDetail, AdminOrderSummary, DeliveryStatus } from "@restaurant-os/types";
import { pool, withTransaction, type Tx } from "../../db/pool.ts";
import { ApiError, notFound } from "../../lib/errors.ts";
import { audit, emitEvent, type AuditActor } from "../../lib/events.ts";
import { decodeCursor, encodeCursor, iso } from "../../lib/format.ts";
import type { Role } from "../../auth/types.ts";
import { releasePromotion, refundOrder } from "../payments/service.ts";
import { ORDER_COLUMNS, orderItems, refundedTotal, cancelReasonLabel, type OrderRow } from "./read.ts";

interface SummaryRow extends OrderRow {
  item_count: number;
  items_preview: string;
  delivery_status: DeliveryStatus | null;
}

const SUMMARY_SELECT = `SELECT ${ORDER_COLUMNS},
  (SELECT coalesce(sum(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count,
  (SELECT string_agg(i.quantity || '× ' || i.product_name_snapshot, ', ' ORDER BY i.position) FROM order_items i WHERE i.order_id = o.id) AS items_preview,
  (SELECT d.status FROM delivery_orders d WHERE d.order_id = o.id) AS delivery_status
  FROM orders o`;

function toSummary(o: SummaryRow): AdminOrderSummary {
  return {
    id: o.id, number: o.order_number, status: o.status, paymentStatus: o.payment_status, fulfillmentType: o.fulfillment_type, channel: o.channel,
    customerName: o.customer_snapshot?.name ?? "Guest", customerPhone: o.customer_snapshot?.phone ?? null, totalMinor: o.total_minor, currency: o.currency,
    itemCount: o.item_count, itemsPreview: o.items_preview ?? "", createdAt: iso(o.created_at)!, paidAt: iso(o.paid_at), acceptedAt: iso(o.accepted_at),
    etaMax: o.eta_max, postalCode: o.address_snapshot?.postalCode ?? null, deliveryStatus: o.delivery_status,
  };
}

const VIEWS: Record<string, string> = {
  // The board shows paid orders that still need work; unpaid orders wait in their own view.
  active: `o.status IN ('NEW','ACCEPTED','PREPARING','READY','PACKED','DISPATCHED') AND o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED')`,
  awaiting_payment: `o.status = 'NEW' AND o.payment_status NOT IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')`,
  completed: `o.status = 'DELIVERED'`,
  cancelled: `o.status = 'CANCELLED'`,
  all: `true`,
};

export async function listOrders(tenantId: string, query: { view: string; q?: string; limit: number; cursor?: string }) {
  const params: unknown[] = [tenantId];
  const where = [`o.tenant_id = $1`, VIEWS[query.view] ?? VIEWS.all!];
  if (query.q) {
    const digits = query.q.replace(/\D/g, "");
    params.push(`%${query.q.toLowerCase()}%`);
    const like = `$${params.length}`;
    const parts = [`lower(o.customer_snapshot->>'name') LIKE ${like}`];
    if (digits) {
      params.push(Number(digits.slice(0, 9)));
      parts.push(`o.order_number = $${params.length}`);
      params.push(`%${digits}%`);
      parts.push(`(o.customer_snapshot->>'phone') LIKE $${params.length}`);
    }
    where.push(`(${parts.join(" OR ")})`);
  }
  const cursor = decodeCursor(query.cursor);
  const ascending = query.view === "active";
  if (cursor) {
    params.push(cursor.at, cursor.id);
    where.push(ascending ? `(o.created_at, o.id) > ($${params.length - 1}::timestamptz, $${params.length}::uuid)` : `(o.created_at, o.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(query.limit + 1);
  const r = await pool().query<SummaryRow>(
    `${SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.created_at ${ascending ? "ASC" : "DESC"}, o.id ${ascending ? "ASC" : "DESC"} LIMIT $${params.length}`, params);
  const rows = r.rows.slice(0, query.limit);
  const last = rows[rows.length - 1];
  const counts = await pool().query<{ view: string; n: number }>(
    `SELECT 'active' AS view, count(*) AS n FROM orders o WHERE o.tenant_id = $1 AND ${VIEWS.active}
     UNION ALL SELECT 'awaiting_payment', count(*) FROM orders o WHERE o.tenant_id = $1 AND ${VIEWS.awaiting_payment}`, [tenantId]);
  return {
    items: rows.map(toSummary),
    nextCursor: r.rows.length > query.limit && last ? encodeCursor(last.created_at, last.id) : null,
    counts: Object.fromEntries(counts.rows.map((c) => [c.view, c.n])),
  };
}

export async function listCustomerOrders(tenantId: string, customerId: string, limit = 50): Promise<AdminOrderSummary[]> {
  const r = await pool().query<SummaryRow>(`${SUMMARY_SELECT} WHERE o.tenant_id = $1 AND o.customer_id = $2 ORDER BY o.created_at DESC LIMIT $3`, [tenantId, customerId, limit]);
  return r.rows.map(toSummary);
}

async function lockOrder(tx: Tx, tenantId: string, orderId: string): Promise<OrderRow> {
  const r = await tx.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1 AND o.tenant_id = $2 FOR UPDATE`, [orderId, tenantId]);
  if (!r.rowCount) throw notFound("Order", "ORDER_NOT_FOUND");
  return r.rows[0]!;
}

export async function orderDetail(tenantId: string, orderId: string, role: Role): Promise<AdminOrderDetail> {
  const db = pool();
  const r = await db.query<SummaryRow>(`${SUMMARY_SELECT} WHERE o.tenant_id = $1 AND o.id = $2`, [tenantId, orderId]);
  const o = r.rows[0];
  if (!o) throw notFound("Order", "ORDER_NOT_FOUND");
  const [items, payments, refunds, delivery, statusEvents, deliveryEvents, notes, auditEvents] = await Promise.all([
    orderItems(db, o.id),
    db.query<{ id: string; provider: string; provider_payment_id: string | null; status: AdminOrderDetail["paymentStatus"]; amount_minor: number; created_at: Date; captured_at: Date | null }>(
      `SELECT id, provider, provider_payment_id, status, amount_minor, created_at, captured_at FROM payments WHERE order_id = $1 ORDER BY created_at`, [o.id]),
    db.query<{ id: string; amount_minor: number; status: string; reason: string | null; created_at: Date }>(
      `SELECT r.id, r.amount_minor, r.status, r.reason, r.created_at FROM payment_refunds r JOIN payments p ON p.id = r.payment_id WHERE p.order_id = $1 ORDER BY r.created_at`, [o.id]),
    db.query<{ id: string; status: DeliveryStatus; provider: string; rider_name: string | null; rider_phone: string | null; tracking_reference: string | null; notes: string | null; assigned_at: Date | null; picked_up_at: Date | null; delivered_at: Date | null; failure_reason: string | null }>(
      `SELECT id, status, provider, rider_name, rider_phone, tracking_reference, notes, assigned_at, picked_up_at, delivered_at, failure_reason FROM delivery_orders WHERE order_id = $1`, [o.id]),
    db.query<{ from_status: OrderStatus | null; to_status: OrderStatus; reason_code: string | null; note: string | null; actor: string | null; created_at: Date }>(
      `SELECT e.from_status, e.to_status, e.reason_code, e.note, u.email AS actor, e.created_at FROM order_status_events e LEFT JOIN users u ON u.id = e.actor_user_id WHERE e.order_id = $1 ORDER BY e.created_at`, [o.id]),
    db.query<{ to_status: DeliveryStatus; note: string | null; actor: string | null; created_at: Date }>(
      `SELECT e.to_status, e.note, u.email AS actor, e.created_at FROM delivery_status_events e JOIN delivery_orders d ON d.id = e.delivery_order_id LEFT JOIN users u ON u.id = e.actor_user_id WHERE d.order_id = $1 ORDER BY e.created_at`, [o.id]),
    db.query<{ id: string; body: string; author: string | null; created_at: Date }>(
      `SELECT n.id, n.body, u.email AS author, n.created_at FROM order_notes n LEFT JOIN users u ON u.id = n.author_user_id WHERE n.order_id = $1 AND n.tenant_id = $2 ORDER BY n.created_at`, [o.id, tenantId]),
    db.query<{ event_name: string; metadata: Record<string, unknown>; actor: string | null; created_at: Date }>(
      `SELECT a.event_name, a.metadata, u.email AS actor, a.created_at FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.tenant_id = $1 AND a.entity_type = 'Order' AND a.entity_id = $2 AND a.event_name IN ('PaymentRefunded','PaymentCapturedForCancelledOrder') ORDER BY a.created_at`, [tenantId, o.id]),
  ]);
  const refunded = await refundedTotal(db, o.id);
  const captured = payments.rows.filter((p) => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status)).reduce((s, p) => s + p.amount_minor, 0);
  const timeline: AdminOrderDetail["timeline"] = [
    ...statusEvents.rows.map((e) => ({
      kind: "status" as const,
      label: e.to_status === "NEW" ? "Order placed" : ORDER_STATUS_LABELS[e.to_status],
      detail: [e.reason_code ? CANCEL_REASON_LABELS[e.reason_code as CancelReasonCode] ?? e.reason_code : null, e.note && e.note !== "Order placed" ? e.note : null].filter(Boolean).join(" — ") || null,
      actor: e.actor, at: iso(e.created_at)!,
    })),
    ...payments.rows.flatMap((p) => [
      { kind: "payment" as const, label: "Payment started", detail: `${p.provider} · ${p.provider_payment_id ?? ""}`, actor: null, at: iso(p.created_at)! },
      ...(p.captured_at ? [{ kind: "payment" as const, label: "Payment received", detail: null, actor: null, at: iso(p.captured_at)! }] : []),
      ...(["FAILED", "CANCELLED"].includes(p.status) ? [{ kind: "payment" as const, label: p.status === "FAILED" ? "Payment failed" : "Payment cancelled", detail: null, actor: null, at: iso(p.created_at)! }] : []),
    ]),
    ...deliveryEvents.rows.map((e) => ({ kind: "delivery" as const, label: `Delivery ${e.to_status.toLowerCase().replace("_", " ")}`, detail: e.note, actor: e.actor, at: iso(e.created_at)! })),
    ...notes.rows.map((n) => ({ kind: "note" as const, label: "Note", detail: n.body, actor: n.author, at: iso(n.created_at)! })),
    ...auditEvents.rows.map((a) => ({
      kind: "audit" as const,
      label: a.event_name === "PaymentRefunded" ? "Refund issued" : "Payment arrived after cancellation — refund needed",
      detail: a.event_name === "PaymentRefunded" ? `${Number(a.metadata.amountMinor) / 100} ${o.currency}${a.metadata.reason ? ` · ${String(a.metadata.reason)}` : ""}` : null,
      actor: a.actor, at: iso(a.created_at)!,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const d = delivery.rows[0];
  const transitions = allowedTransitions(o.status, o.fulfillment_type).filter((to) => {
    if (to === "ACCEPTED") return o.payment_status === "CAPTURED";
    if (to === "CANCELLED" && !["NEW", "ACCEPTED"].includes(o.status)) return ["OWNER", "MANAGER", "PLATFORM_ADMIN"].includes(role);
    return true;
  });
  return {
    ...toSummary(o),
    token: o.public_token, subtotalMinor: o.subtotal_minor, discountMinor: o.discount_minor, feeMinor: o.fee_minor, taxMinor: o.tax_minor,
    promotionCode: o.promotion_code, customerId: o.customer_id, customerEmail: o.customer_snapshot?.email ?? null, customerNote: o.customer_note,
    address: o.address_snapshot ? { line1: o.address_snapshot.line1 ?? "", line2: o.address_snapshot.line2 ?? "", landmark: o.address_snapshot.landmark ?? "", city: o.address_snapshot.city ?? "", postalCode: o.address_snapshot.postalCode ?? "" } : null,
    items,
    payments: payments.rows.map((p) => ({ id: p.id, provider: p.provider, providerPaymentId: p.provider_payment_id, status: p.status, amountMinor: p.amount_minor, createdAt: iso(p.created_at)!, capturedAt: iso(p.captured_at) })),
    refunds: refunds.rows.map((x) => ({ id: x.id, amountMinor: x.amount_minor, status: x.status, reason: x.reason, createdAt: iso(x.created_at)! })),
    refundableMinor: Math.max(0, captured - refunded),
    delivery: d ? { id: d.id, status: d.status, provider: d.provider, riderName: d.rider_name, riderPhone: d.rider_phone, trackingReference: d.tracking_reference, notes: d.notes, assignedAt: iso(d.assigned_at), pickedUpAt: iso(d.picked_up_at), deliveredAt: iso(d.delivered_at), failureReason: d.failure_reason } : null,
    timeline,
    notes: notes.rows.map((n) => ({ id: n.id, body: n.body, author: n.author, createdAt: iso(n.created_at)! })),
    allowedTransitions: transitions,
    cancelReasonCode: o.cancel_reason_code,
    cancelNote: o.cancel_note,
  };
}

async function recordTransition(tx: Tx, actor: AuditActor, order: OrderRow, to: OrderStatus, extra: { reasonCode?: string; note?: string } = {}) {
  const column = timestampColumnFor(to);
  await tx.query(`UPDATE orders SET status = $2::order_status, ${column ? `${column} = coalesce(${column}, now()),` : ""} updated_at = now() WHERE id = $1`, [order.id, to]);
  await tx.query(`INSERT INTO order_status_events (tenant_id, order_id, from_status, to_status, actor_user_id, reason_code, note) VALUES ($1, $2, $3::order_status, $4::order_status, $5, $6, $7)`,
    [actor.tenantId, order.id, order.status, to, actor.userId, extra.reasonCode ?? null, extra.note ?? null]);
  await audit(tx, actor, "OrderStatusChanged", { type: "Order", id: order.id }, { from: order.status, to, orderNumber: order.order_number, ...extra });
  await emitEvent(tx, { tenantId: actor.tenantId, type: "OrderStatusChanged", aggregateType: "Order", aggregateId: order.id, payload: { from: order.status, to } });
}

export async function transitionOrder(actor: AuditActor, role: Role, orderId: string, to: OrderStatus) {
  await withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.tenantId, orderId);
    if (order.status === to) return;
    if (to === "DISPATCHED") throw new ApiError(422, "USE_DISPATCH", "Use Dispatch to hand the order to a rider.");
    if (to === "CANCELLED") throw new ApiError(422, "USE_CANCEL", "Use Cancel to cancel an order with a reason.");
    assertOrderTransitionAllowed({ from: order.status, to, fulfillment: order.fulfillment_type, paymentStatus: order.payment_status, role });
    await recordTransition(tx, actor, order, to);
    if (to === "DELIVERED" && order.fulfillment_type === "DELIVERY") await markDelivery(tx, actor, order.id, "DELIVERED", "Marked delivered from the order");
  });
  return orderDetail(actor.tenantId, orderId, role);
}

export async function cancelOrder(actor: AuditActor, role: Role, orderId: string, input: { reasonCode: CancelReasonCode; note: string; refund: boolean }) {
  const paid = await withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.tenantId, orderId);
    if (order.status === "CANCELLED") return null;
    if (input.reasonCode === "OTHER" && !input.note) throw new ApiError(422, "NOTE_REQUIRED", "Add a short note explaining the cancellation.", { fields: { note: "Required for 'Other'." } });
    assertOrderTransitionAllowed({ from: order.status, to: "CANCELLED", fulfillment: order.fulfillment_type, paymentStatus: order.payment_status, role });
    await tx.query(`UPDATE orders SET cancel_reason_code = $2, cancel_note = nullif($3, ''), cancelled_by = $4 WHERE id = $1`, [order.id, input.reasonCode, input.note, actor.userId]);
    await recordTransition(tx, actor, order, "CANCELLED", { reasonCode: input.reasonCode, note: input.note || undefined });
    await tx.query(`UPDATE payments SET status = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE order_id = $1 AND status IN ('CREATED','PENDING')`, [order.id]);
    await tx.query(`UPDATE delivery_orders SET status = 'CANCELLED', updated_at = now() WHERE order_id = $1 AND status NOT IN ('DELIVERED','CANCELLED')`, [order.id]);
    await releasePromotion(tx, actor.tenantId, order.id);
    await emitEvent(tx, { tenantId: actor.tenantId, type: "OrderCancelled", aggregateType: "Order", aggregateId: order.id, payload: { reasonCode: input.reasonCode, willRefund: input.refund && order.payment_status === "CAPTURED" } });
    return order.payment_status === "CAPTURED" || order.payment_status === "PARTIALLY_REFUNDED";
  });
  // The refund runs after the cancellation commits: a provider failure leaves the order cancelled with
  // the refundable amount visible, and the refund can be retried from the order screen.
  let refundError: string | null = null;
  if (paid && input.refund) {
    try {
      await refundOrder(actor, orderId, { reason: `Cancelled: ${CANCEL_REASON_LABELS[input.reasonCode]}`, idempotencyKey: `cancel:${orderId}` });
    } catch (error) {
      refundError = error instanceof ApiError ? error.message : "The refund could not be processed.";
    }
  }
  return { order: await orderDetail(actor.tenantId, orderId, role), refundError };
}

async function markDelivery(tx: Tx, actor: AuditActor, orderId: string, to: DeliveryStatus, note: string | null) {
  const d = await tx.query<{ id: string; status: DeliveryStatus }>(`SELECT id, status FROM delivery_orders WHERE order_id = $1 FOR UPDATE`, [orderId]);
  const row = d.rows[0];
  if (!row || row.status === to) return;
  const column = to === "PICKED_UP" ? "picked_up_at" : to === "DELIVERED" ? "delivered_at" : to === "FAILED" ? "failed_at" : null;
  await tx.query(`UPDATE delivery_orders SET status = $2::delivery_status, ${column ? `${column} = now(),` : ""} failure_reason = CASE WHEN $2::delivery_status = 'FAILED' THEN $3 ELSE failure_reason END, updated_at = now() WHERE id = $1`, [row.id, to, note]);
  await tx.query(`INSERT INTO delivery_status_events (tenant_id, delivery_order_id, from_status, to_status, actor_user_id, note) VALUES ($1, $2, $3::delivery_status, $4::delivery_status, $5, $6)`,
    [actor.tenantId, row.id, row.status, to, actor.userId, note]);
}

export async function dispatchOrder(actor: AuditActor, role: Role, orderId: string, input: { riderName: string; riderPhone: string; provider: string; trackingReference: string; notes: string }) {
  await withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.tenantId, orderId);
    if (order.fulfillment_type !== "DELIVERY") throw new ApiError(422, "NOT_A_DELIVERY", "Pickup orders are not dispatched.");
    const existing = await tx.query<{ id: string; status: DeliveryStatus }>(`SELECT id, status FROM delivery_orders WHERE order_id = $1 FOR UPDATE`, [order.id]);
    const current = existing.rows[0];
    const reassign = order.status === "DISPATCHED" && current?.status === "FAILED";
    if (!reassign) assertOrderTransitionAllowed({ from: order.status, to: "DISPATCHED", fulfillment: order.fulfillment_type, paymentStatus: order.payment_status, role });
    const pickup = await tx.query<{ name: string; phone: string | null; address: unknown }>(`SELECT name, phone, address FROM outlets WHERE id = $1`, [order.outlet_id]);
    let deliveryId: string;
    if (current) {
      deliveryId = current.id;
      await tx.query(
        `UPDATE delivery_orders SET status = 'ASSIGNED', provider = $2, rider_name = $3, rider_phone = nullif($4, ''), tracking_reference = nullif($5, ''), notes = nullif($6, ''),
           assigned_at = now(), picked_up_at = NULL, failed_at = NULL, failure_reason = NULL, updated_at = now() WHERE id = $1`,
        [deliveryId, input.provider || "MANUAL", input.riderName, input.riderPhone, input.trackingReference, input.notes]);
    } else {
      deliveryId = (await tx.query<{ id: string }>(
        `INSERT INTO delivery_orders (tenant_id, order_id, provider, status, rider_name, rider_phone, tracking_reference, notes, assigned_at, pickup_snapshot, dropoff_snapshot, fee_minor)
         VALUES ($1, $2, $3, 'ASSIGNED', $4, nullif($5, ''), nullif($6, ''), nullif($7, ''), now(), $8, $9, $10) RETURNING id`,
        [actor.tenantId, order.id, input.provider || "MANUAL", input.riderName, input.riderPhone, input.trackingReference, input.notes,
          JSON.stringify(pickup.rows[0] ?? {}), JSON.stringify({ ...(order.address_snapshot ?? {}), name: order.customer_snapshot?.name, phone: order.customer_snapshot?.phone }), order.fee_minor])).rows[0]!.id;
    }
    await tx.query(`INSERT INTO delivery_status_events (tenant_id, delivery_order_id, from_status, to_status, actor_user_id, note) VALUES ($1, $2, $3::delivery_status, 'ASSIGNED', $4, $5)`,
      [actor.tenantId, deliveryId, current?.status ?? null, actor.userId, `Rider: ${input.riderName}${input.riderPhone ? ` (${input.riderPhone})` : ""}`]);
    if (reassign) {
      await audit(tx, actor, "DeliveryReassigned", { type: "Order", id: order.id }, { riderName: input.riderName });
      await emitEvent(tx, { tenantId: actor.tenantId, type: "DeliveryUpdated", aggregateType: "Order", aggregateId: order.id, payload: { status: "ASSIGNED" } });
    } else {
      await recordTransition(tx, actor, order, "DISPATCHED", { note: `Rider: ${input.riderName}` });
    }
  });
  return orderDetail(actor.tenantId, orderId, role);
}

export async function updateDelivery(actor: AuditActor, role: Role, orderId: string, input: { status: "PICKED_UP" | "DELIVERED" | "FAILED"; note: string }) {
  await withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.tenantId, orderId);
    const d = await tx.query<{ status: DeliveryStatus }>(`SELECT status FROM delivery_orders WHERE order_id = $1`, [order.id]);
    const current = d.rows[0]?.status;
    if (!current || order.status !== "DISPATCHED") throw new ApiError(409, "NOT_DISPATCHED", "This order has not been dispatched.");
    const allowed: Record<string, DeliveryStatus[]> = { ASSIGNED: ["PICKED_UP", "DELIVERED", "FAILED"], PICKED_UP: ["DELIVERED", "FAILED"] };
    if (!(allowed[current] ?? []).includes(input.status)) throw new ApiError(409, "INVALID_DELIVERY_TRANSITION", `Delivery is ${current.toLowerCase().replace("_", " ")}; it cannot be marked ${input.status.toLowerCase().replace("_", " ")}.`);
    if (input.status === "FAILED" && !input.note) throw new ApiError(422, "NOTE_REQUIRED", "Say what went wrong so the team can follow up.", { fields: { note: "Required." } });
    await markDelivery(tx, actor, order.id, input.status, input.note || null);
    if (input.status === "DELIVERED") await recordTransition(tx, actor, order, "DELIVERED");
    else {
      await audit(tx, actor, "DeliveryStatusChanged", { type: "Order", id: order.id }, { to: input.status, note: input.note });
      await emitEvent(tx, { tenantId: actor.tenantId, type: "DeliveryUpdated", aggregateType: "Order", aggregateId: order.id, payload: { status: input.status } });
    }
  });
  return orderDetail(actor.tenantId, orderId, role);
}

export async function addNote(actor: AuditActor, orderId: string, body: string) {
  await withTransaction(async (tx) => {
    await lockOrder(tx, actor.tenantId, orderId);
    await tx.query(`INSERT INTO order_notes (tenant_id, order_id, author_user_id, body) VALUES ($1, $2, $3, $4)`, [actor.tenantId, orderId, actor.userId, body]);
  });
}

export { cancelReasonLabel };
