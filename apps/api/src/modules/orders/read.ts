// Order read models shared by the storefront (public, token-addressed) and the admin.
import { CANCEL_REASON_LABELS, type CancelReasonCode } from "@restaurant-os/domain";
import type { DeliveryStatus, OrderStatus, PaymentStatus, PublicOrder, PublicOrderItem } from "@restaurant-os/types";
import type { Db } from "../../db/pool.ts";
import { env } from "../../config/env.ts";
import { iso } from "../../lib/format.ts";

export interface OrderRow {
  id: string;
  tenant_id: string;
  order_number: number;
  public_token: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_type: "DELIVERY" | "PICKUP";
  channel: string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  fee_minor: number;
  tax_minor: number;
  total_minor: number;
  customer_id: string | null;
  customer_snapshot: { name?: string; phone?: string; email?: string };
  address_snapshot: { line1?: string; line2?: string; landmark?: string; city?: string; postalCode?: string } | null;
  customer_note: string | null;
  promotion_code: string | null;
  eta_min: number | null;
  eta_max: number | null;
  created_at: Date;
  paid_at: Date | null;
  accepted_at: Date | null;
  cancel_reason_code: string | null;
  cancel_note: string | null;
  outlet_id: string;
  created_by_user_id: string | null;
  payment_method: "CASH" | "UPI" | "CARD" | "PAY_LATER" | null;
  notify_customer: boolean;
}

export const ORDER_COLUMNS = `o.id, o.tenant_id, o.order_number, o.public_token, o.status, o.payment_status, o.fulfillment_type, o.channel, trim(o.currency) AS currency,
  o.subtotal_minor, o.discount_minor, o.fee_minor, o.tax_minor, o.total_minor, o.customer_id, o.customer_snapshot, o.address_snapshot,
  o.customer_note, o.promotion_code, o.eta_min, o.eta_max, o.created_at, o.paid_at, o.accepted_at, o.cancel_reason_code, o.cancel_note, o.outlet_id,
  o.created_by_user_id, o.payment_method, o.notify_customer`;

export async function orderItems(db: Db, orderId: string): Promise<PublicOrderItem[]> {
  const r = await db.query<{ product_id: string | null; product_name_snapshot: string; quantity: number; unit_price_minor: number; line_total_minor: number; modifiers_snapshot: { groupName: string; name: string; priceDeltaMinor: number; modifierId?: string }[] }>(
    `SELECT product_id, product_name_snapshot, quantity, unit_price_minor, line_total_minor, modifiers_snapshot FROM order_items WHERE order_id = $1 ORDER BY position, id`,
    [orderId],
  );
  return r.rows.map((i) => ({
    productId: i.product_id,
    modifierIds: (i.modifiers_snapshot ?? []).flatMap((m) => (m.modifierId ? [m.modifierId] : [])),
    name: i.product_name_snapshot,
    quantity: i.quantity,
    unitPriceMinor: i.unit_price_minor,
    lineTotalMinor: i.line_total_minor,
    modifiers: (i.modifiers_snapshot ?? []).map((m) => ({ groupName: m.groupName, name: m.name, priceDeltaMinor: Number(m.priceDeltaMinor) })),
  }));
}

export async function refundedTotal(db: Db, orderId: string): Promise<number> {
  const r = await db.query<{ total: number }>(
    `SELECT coalesce(sum(r.amount_minor), 0) AS total FROM payment_refunds r JOIN payments p ON p.id = r.payment_id WHERE p.order_id = $1 AND r.status IN ('REFUNDED','PARTIALLY_REFUNDED','PENDING')`,
    [orderId],
  );
  return r.rows[0]!.total;
}

export function paymentExpiresAt(order: Pick<OrderRow, "created_at">): Date {
  return new Date(new Date(order.created_at).getTime() + env().PAYMENT_WINDOW_MINUTES * 60_000);
}

export function canRetryPayment(order: Pick<OrderRow, "status" | "payment_status" | "created_at">, now = new Date()): boolean {
  return order.status === "NEW" && !["CAPTURED", "AUTHORIZED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.payment_status) && paymentExpiresAt(order) > now;
}

export function cancelReasonLabel(code: string | null): string | null {
  return code ? CANCEL_REASON_LABELS[code as CancelReasonCode] ?? code : null;
}

export async function toPublicOrder(db: Db, order: OrderRow, store: { name: string; phone: string | null; whatsapp: string }): Promise<PublicOrder> {
  const [items, timeline, delivery, refunded] = await Promise.all([
    orderItems(db, order.id),
    db.query<{ to_status: OrderStatus; created_at: Date }>(`SELECT to_status, created_at FROM order_status_events WHERE order_id = $1 ORDER BY created_at, id`, [order.id]),
    db.query<{ status: DeliveryStatus; rider_name: string | null; rider_phone: string | null; tracking_reference: string | null }>(
      `SELECT status, rider_name, rider_phone, tracking_reference FROM delivery_orders WHERE order_id = $1`, [order.id]),
    refundedTotal(db, order.id),
  ]);
  const a = order.address_snapshot;
  const d = delivery.rows[0];
  return {
    token: order.public_token,
    number: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentType: order.fulfillment_type,
    currency: order.currency,
    subtotalMinor: order.subtotal_minor,
    discountMinor: order.discount_minor,
    feeMinor: order.fee_minor,
    taxMinor: order.tax_minor,
    totalMinor: order.total_minor,
    promotionCode: order.promotion_code,
    items,
    customerName: order.customer_snapshot?.name ?? "",
    address: a ? { line1: a.line1 ?? "", line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city ?? "", postalCode: a.postalCode ?? "" } : null,
    customerNote: order.customer_note,
    etaMin: order.eta_min,
    etaMax: order.eta_max,
    createdAt: iso(order.created_at)!,
    paidAt: iso(order.paid_at),
    timeline: timeline.rows.map((t) => ({ status: t.to_status, at: iso(t.created_at)! })),
    delivery: d ? { status: d.status, riderName: d.rider_name, riderPhone: d.rider_phone, trackingReference: d.tracking_reference } : null,
    cancelReason: cancelReasonLabel(order.cancel_reason_code),
    refundedMinor: refunded,
    canRetryPayment: canRetryPayment(order),
    paymentExpiresAt: order.status === "NEW" && order.payment_status !== "CAPTURED" ? paymentExpiresAt(order).toISOString() : null,
    store,
  };
}
