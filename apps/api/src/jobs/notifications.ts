// Transactional notifications (PRD 5.12, specs/notifications, docs/NOTIFICATIONS.md).
// Domain events become notification rows (idempotent per event+channel+recipient); each row is sent
// with bounded retries and every attempt is recorded for the admin "Messages" screen.
import { env } from "../config/env.ts";
import { pool, withTransaction } from "../db/pool.ts";
import { formatMoney } from "../lib/format.ts";
import type { NotificationProvider } from "../integrations/messaging.ts";

export interface DomainEventRow {
  id: string;
  tenant_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
}

interface OrderContext {
  id: string; order_number: number; public_token: string; status: string; fulfillment_type: "DELIVERY" | "PICKUP"; total_minor: number; currency: string;
  customer_snapshot: { name?: string; phone?: string; email?: string }; eta_min: number | null; eta_max: number | null; refunded_minor: number;
  cancel_reason_code: string | null; store_name: string; store_slug: string; item_count: number;
  rider_name: string | null; rider_phone: string | null;
  /** Staff can switch customer updates off for an order they enter (ADR-014). */
  notify_customer: boolean; payment_method: string | null; payment_status: string;
}

export interface PlannedMessage {
  audience: "CUSTOMER" | "MERCHANT";
  channel: string;
  recipient: string;
  template: string;
  subject: string | null;
  body: string;
}

async function loadOrder(tenantId: string, orderId: string): Promise<OrderContext | null> {
  const r = await pool().query<OrderContext>(
    `SELECT o.id, o.order_number, o.public_token, o.status, o.fulfillment_type, o.total_minor, trim(o.currency) AS currency, o.customer_snapshot, o.eta_min, o.eta_max,
            o.cancel_reason_code, b.name AS store_name, b.slug AS store_slug,
            (SELECT coalesce(sum(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count,
            (SELECT coalesce(sum(r.amount_minor), 0) FROM payment_refunds r JOIN payments p ON p.id = r.payment_id WHERE p.order_id = o.id) AS refunded_minor,
            d.rider_name, d.rider_phone, o.notify_customer, o.payment_method, o.payment_status
     FROM orders o JOIN outlets ot ON ot.id = o.outlet_id JOIN brands b ON b.id = ot.brand_id
     LEFT JOIN delivery_orders d ON d.order_id = o.id
     WHERE o.id = $1 AND o.tenant_id = $2`, [orderId, tenantId]);
  return r.rows[0] ?? null;
}

function trackUrl(o: OrderContext) {
  return `${env().STOREFRONT_URL.replace(/\/$/, "")}/order/${o.public_token}`;
}

function customerMessages(o: OrderContext, template: string, subject: string, text: string): PlannedMessage[] {
  const messages: PlannedMessage[] = [];
  if (!o.notify_customer) return messages;
  const body = `${text}\n\nTrack your order: ${trackUrl(o)}\n— ${o.store_name}`;
  if (o.customer_snapshot.phone) messages.push({ audience: "CUSTOMER", channel: "whatsapp", recipient: o.customer_snapshot.phone, template, subject: null, body });
  if (o.customer_snapshot.email) messages.push({ audience: "CUSTOMER", channel: "email", recipient: o.customer_snapshot.email, template, subject, body });
  return messages;
}

function merchant(template: string, subject: string, body: string): PlannedMessage {
  return { audience: "MERCHANT", channel: "in_app", recipient: "merchant", template, subject, body };
}

/** Decides which messages a domain event produces. Pure apart from reading the order. */
export async function planMessages(event: DomainEventRow): Promise<{ orderId: string | null; messages: PlannedMessage[] }> {
  if (event.aggregate_type !== "Order") return { orderId: null, messages: [] };
  const o = await loadOrder(event.tenant_id, event.aggregate_id);
  if (!o) return { orderId: null, messages: [] };
  const name = o.customer_snapshot.name?.split(" ")[0] || "there";
  const n = `#${o.order_number}`;
  const total = formatMoney(o.total_minor, o.currency);
  const eta = o.eta_min !== null && o.eta_max !== null ? `${o.eta_min}–${o.eta_max} min` : null;
  const pickup = o.fulfillment_type === "PICKUP";
  const messages: PlannedMessage[] = [];

  switch (event.event_type) {
    case "OrderCreated": {
      // Website orders are confirmed when payment is captured; staff-entered orders are confirmed when entered.
      if (event.payload.enteredByStaff !== true) break;
      const paid = o.payment_status === "CAPTURED";
      messages.push(...customerMessages(o, "ORDER_CONFIRMED", `Order ${n} confirmed`,
        `Hi ${name}, ${o.store_name} has your order ${n} (${total}).${paid ? " Payment received — thank you!" : ` Please pay ${total} on ${pickup ? "pickup" : "delivery"}.`}${eta ? ` ${pickup ? "Ready for pickup" : "Estimated delivery"} in about ${eta}.` : ""}`));
      break;
    }
    case "PaymentCaptured":
      messages.push(...customerMessages(o, "ORDER_CONFIRMED", `Order ${n} confirmed`, `Hi ${name}, we've received your order ${n} (${total}). Payment confirmed — the kitchen will accept it shortly.`));
      messages.push(merchant("NEW_ORDER", `New order ${n}`, `New paid ${pickup ? "pickup" : "delivery"} order ${n}: ${o.item_count} item${o.item_count === 1 ? "" : "s"}, ${total}.`));
      break;
    case "PaymentFailed":
      messages.push(...customerMessages(o, "PAYMENT_FAILED", `Payment for order ${n} didn't go through`, `Hi ${name}, the payment for order ${n} (${total}) didn't go through. No money was taken. You can try again within ${env().PAYMENT_WINDOW_MINUTES} minutes from the link below.`));
      break;
    case "PaymentCapturedAfterCancellation":
      messages.push(merchant("PAYMENT_AFTER_CANCEL", `Refund needed for ${n}`, `Payment for cancelled order ${n} (${total}) arrived after cancellation. Open the order and issue a refund.`));
      break;
    case "OrderStatusChanged": {
      const to = String(event.payload.to ?? "");
      if (to === "ACCEPTED") messages.push(...customerMessages(o, "ORDER_ACCEPTED", `Order ${n} accepted`, `Good news ${name} — ${o.store_name} has accepted order ${n}.${eta ? ` ${pickup ? "Ready for pickup" : "Estimated delivery"} in about ${eta}.` : ""}`));
      if (to === "READY") messages.push(...customerMessages(o, "ORDER_READY", `Order ${n} is ready`, pickup ? `Order ${n} is ready for pickup at ${o.store_name}.` : `Order ${n} is ready and will be handed to a rider shortly.`));
      if (to === "DISPATCHED") messages.push(...customerMessages(o, "ORDER_DISPATCHED", `Order ${n} is on the way`, `Order ${n} is on its way${o.rider_name ? ` with ${o.rider_name}${o.rider_phone ? ` (${o.rider_phone})` : ""}` : ""}.`));
      if (to === "DELIVERED") messages.push(...customerMessages(o, pickup ? "ORDER_COLLECTED" : "ORDER_DELIVERED", `Order ${n} ${pickup ? "collected" : "delivered"}`, `Order ${n} has been ${pickup ? "collected" : "delivered"}. Enjoy your meal, ${name}!`));
      break;
    }
    case "OrderCancelled": {
      const willRefund = event.payload.willRefund === true;
      const refundText = !willRefund ? "" : o.payment_method ? ` ${o.store_name} will return your payment of ${total}.` : ` A full refund of ${total} has been started; it usually reaches your account in 5–7 working days.`;
      messages.push(...customerMessages(o, "ORDER_CANCELLED", `Order ${n} cancelled`, `Sorry ${name}, order ${n} has been cancelled by ${o.store_name}.${refundText}`));
      break;
    }
    case "DeliveryUpdated":
      if (event.payload.status === "FAILED") messages.push(merchant("DELIVERY_FAILED", `Delivery failed for ${n}`, `Delivery of order ${n} was marked failed. Reassign a rider or contact the customer.`));
      break;
  }
  return { orderId: o.id, messages };
}

/** Creates notification rows for an event. Re-processing the same event creates nothing new. */
export async function materializeEvent(event: DomainEventRow): Promise<string[]> {
  if (event.event_type === "NotificationRetryRequested") return [event.aggregate_id];
  const { orderId, messages } = await planMessages(event);
  const ids: string[] = [];
  for (const m of messages) {
    const r = await pool().query<{ id: string }>(
      `INSERT INTO notifications (tenant_id, order_id, channel, template, recipient, status, domain_event_id, audience, subject, body)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9)
       ON CONFLICT (tenant_id, domain_event_id, channel, recipient) DO NOTHING RETURNING id`,
      [event.tenant_id, orderId, m.channel, m.template, m.recipient, event.id, m.audience, m.subject, m.body]);
    if (r.rows[0]) ids.push(r.rows[0].id);
  }
  return ids;
}

export type SendOutcome = "sent" | "skipped" | "retry" | "failed";

/** Sends one notification. Returns "retry" for a transient failure that should be retried. */
export async function sendNotification(provider: NotificationProvider, notificationId: string, maxAttempts = env().NOTIFICATION_MAX_ATTEMPTS): Promise<SendOutcome> {
  return withTransaction(async (tx) => {
    const r = await tx.query<{ id: string; channel: string; recipient: string; subject: string | null; body: string | null; status: string; attempt_count: number }>(
      `SELECT id, channel, recipient, subject, body, status, attempt_count FROM notifications WHERE id = $1 FOR UPDATE`, [notificationId]);
    const n = r.rows[0];
    if (!n || n.status === "SENT" || n.status === "CANCELLED") return "skipped";
    const attemptNo = n.attempt_count + 1;
    if (n.channel === "in_app") {
      // Merchant in-app alerts are stored, not transmitted; the admin reads them from the message log.
      await tx.query(`INSERT INTO notification_attempts (notification_id, attempt_no, status, provider_reference) VALUES ($1, $2, 'SENT', 'in_app')`, [n.id, attemptNo]);
      await tx.query(`UPDATE notifications SET status = 'SENT', attempt_count = $2, sent_at = now(), updated_at = now() WHERE id = $1`, [n.id, attemptNo]);
      return "sent";
    }
    try {
      const result = await provider.send({ channel: n.channel, recipient: n.recipient, subject: n.subject, body: n.body ?? "", idempotencyKey: n.id });
      await tx.query(`INSERT INTO notification_attempts (notification_id, attempt_no, status, provider_reference) VALUES ($1, $2, 'SENT', $3) ON CONFLICT DO NOTHING`, [n.id, attemptNo, result.providerReference]);
      await tx.query(`UPDATE notifications SET status = 'SENT', attempt_count = $2, sent_at = now(), last_error = NULL, updated_at = now() WHERE id = $1`, [n.id, attemptNo]);
      return "sent";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = (error as { retryable?: boolean }).retryable !== false;
      const final = !retryable || attemptNo >= maxAttempts;
      await tx.query(`INSERT INTO notification_attempts (notification_id, attempt_no, status, error_code) VALUES ($1, $2, 'FAILED', $3) ON CONFLICT DO NOTHING`, [n.id, attemptNo, message.slice(0, 200)]);
      await tx.query(`UPDATE notifications SET status = $2::notification_status, attempt_count = $3, last_error = $4, updated_at = now() WHERE id = $1`,
        [n.id, final ? "FAILED" : "PENDING", attemptNo, message.slice(0, 500)]);
      return final ? "failed" : "retry";
    }
  });
}
