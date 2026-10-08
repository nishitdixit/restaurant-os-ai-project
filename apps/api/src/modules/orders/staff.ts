// Orders staff enter from the dashboard (ADR-014): WhatsApp, phone, walk-in and other orders that reach the restaurant
// directly. They are priced by the same checkout engine as website orders (menu prices, options, availability,
// delivery areas and fees, offers), so billing and reports stay in step; only how they start (accepted) and how they
// are paid (cash / UPI / card now, or later) differ.
import { describePromotion, normalizePhone } from "@restaurant-os/domain";
import type { AdminOrderDetail, Menu, Quote, QuoteInput, StaffCustomerLookup, StaffOrderInput, StaffOrderOffer } from "@restaurant-os/types";
import { isUniqueViolation, pool, withTransaction } from "../../db/pool.ts";
import { ApiError, notFound } from "../../lib/errors.ts";
import { audit, emitEvent, type AuditActor } from "../../lib/events.ts";
import { moneyFormatter } from "../../lib/format.ts";
import type { Role } from "../../auth/types.ts";
import { computeQuote } from "../checkout/pricing.ts";
import { createOrderRecord, findOrderByIdempotencyKey } from "../checkout/service.ts";
import { menu } from "../storefront/catalog.ts";
import { loadStore, type StoreContext } from "../storefront/store.ts";
import { promotionAudience } from "../marketing/routes.ts";
import { orderDetail, PAYMENT_METHOD_LABELS } from "./admin.ts";
import { ORDER_COLUMNS, type OrderRow } from "./read.ts";

async function tenantStore(tenantId: string): Promise<StoreContext> {
  const r = await pool().query<{ slug: string }>(`SELECT slug FROM brands WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, [tenantId]);
  const slug = r.rows[0]?.slug;
  if (!slug) throw new ApiError(409, "STORE_NOT_SET_UP", "Set up your restaurant before taking orders.");
  const store = await loadStore(pool(), slug, { allowDraft: true });
  if (store.tenantId !== tenantId) throw notFound("Store");
  if (!store.outlet) throw new ApiError(409, "STORE_NOT_SET_UP", "Add your outlet details before taking orders.");
  return store;
}

/** The menu as staff pick from it: every active dish, with live availability (unavailable dishes stay visible, marked). */
export async function staffMenu(tenantId: string): Promise<Menu> {
  const store = await tenantStore(tenantId);
  return menu(store.slug, { preview: true });
}

export async function staffQuote(tenantId: string, input: QuoteInput): Promise<Quote> {
  const store = await tenantStore(tenantId);
  return (await computeQuote(pool(), store, input, { staff: true })).quote;
}

/** Offers staff can apply right now: every live offer, including staff-only ones, never paused/expired/used-up ones. */
export async function staffOffers(tenantId: string): Promise<StaffOrderOffer[]> {
  const store = await tenantStore(tenantId);
  const fmt = moneyFormatter(store.currency, store.locale);
  const r = await pool().query<{ id: string; code: string; title: string; type: "FIXED" | "PERCENTAGE"; value: number; minimum_order_minor: number; max_discount_minor: number | null; is_public: boolean; staff_only: boolean }>(
    `SELECT id, code, title, type, value, minimum_order_minor, max_discount_minor, is_public, staff_only FROM promotions
     WHERE tenant_id = $1 AND status = 'ACTIVE' AND starts_at <= now() AND ends_at > now() AND (usage_cap IS NULL OR usage_count < usage_cap)
     ORDER BY staff_only DESC, code`, [tenantId]);
  return r.rows.map((p) => ({
    id: p.id, code: p.code, title: p.title || p.code, audience: promotionAudience(p),
    summary: describePromotion({ type: p.type, value: BigInt(p.value), minimumOrderMinor: BigInt(p.minimum_order_minor), maxDiscountMinor: p.max_discount_minor === null ? null : BigInt(p.max_discount_minor) }, fmt),
  }));
}

/**
 * Name, email and saved addresses for one exact phone number, so staff don't retype them. Exact match only: this is
 * not a customer search (kitchen and counter staff have no customer-list permission).
 */
export async function lookupCustomer(tenantId: string, phone: string): Promise<StaffCustomerLookup> {
  const normalized = normalizePhone(phone);
  const empty: StaffCustomerLookup = { found: false, name: "", email: "", orderCount: 0, addresses: [] };
  if (!normalized) return empty;
  const c = await pool().query<{ id: string; name: string; email: string | null; orders: number }>(
    `SELECT c.id, c.name, c.email, (SELECT count(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'CANCELLED')::int AS orders
     FROM customers c WHERE c.tenant_id = $1 AND c.phone = $2`, [tenantId, normalized]);
  const row = c.rows[0];
  if (!row) return empty;
  const a = await pool().query<{ line1: string; line2: string | null; delivery_notes: string | null; city: string; postal_code: string }>(
    `SELECT line1, line2, delivery_notes, city, postal_code FROM customer_addresses WHERE tenant_id = $1 AND customer_id = $2 ORDER BY last_used_at DESC NULLS LAST LIMIT 5`, [tenantId, row.id]);
  return {
    found: true, name: row.name, email: row.email ?? "", orderCount: row.orders,
    addresses: a.rows.map((x) => ({ line1: x.line1, line2: x.line2 ?? "", landmark: x.delivery_notes ?? "", city: x.city, postalCode: x.postal_code })),
  };
}

export async function createStaffOrder(actor: AuditActor & { userId: string }, role: Role, input: StaffOrderInput, idempotencyKey: string): Promise<{ order: AdminOrderDetail; duplicate: boolean }> {
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey)) throw new ApiError(400, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be 8-120 URL-safe characters.");
  const store = await tenantStore(actor.tenantId);
  // Staff keys live in their own namespace so they can never collide with a website checkout key.
  const key = `staff:${idempotencyKey}`;
  const existing = await findOrderByIdempotencyKey(pool(), actor.tenantId, key);
  if (existing) return { order: await orderDetail(actor.tenantId, existing.id, role), duplicate: true };

  // No phone (a walk-in pickup): the name, if any, goes on the order but no customer record is created.
  const customer = input.customer.phone || input.customer.name
    ? { name: input.customer.name, phone: input.customer.phone, email: input.customer.email, marketingConsent: false }
    : null;
  let orderId: string;
  try {
    orderId = await withTransaction(async (tx) => {
      const raced = await findOrderByIdempotencyKey(tx, actor.tenantId, key);
      if (raced) return raced.id;
      const id = await createOrderRecord(tx, store, { ...input, customerPhone: input.customer.phone, customer, customerNote: input.customerNote },
        key, { kind: "STAFF", channel: input.channel, userId: actor.userId, payment: input.payment, notifyCustomer: input.notifyCustomer });
      await audit(tx, actor, "OrderEnteredByStaff", { type: "Order", id }, { channel: input.channel, payment: input.payment, promotionCode: input.promotionCode || null, totalMinor: input.expectedTotalMinor });
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await findOrderByIdempotencyKey(pool(), actor.tenantId, key);
      if (winner) return { order: await orderDetail(actor.tenantId, winner.id, role), duplicate: true };
    }
    throw error;
  }
  return { order: await orderDetail(actor.tenantId, orderId, role), duplicate: false };
}

/** Records that the restaurant collected the money for a staff-entered "pay later" order. */
export async function markOrderPaid(actor: AuditActor, role: Role, orderId: string, method: "CASH" | "UPI" | "CARD"): Promise<AdminOrderDetail> {
  await withTransaction(async (tx) => {
    const r = await tx.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1 AND o.tenant_id = $2 FOR UPDATE`, [orderId, actor.tenantId]);
    const order = r.rows[0];
    if (!order) throw notFound("Order", "ORDER_NOT_FOUND");
    if (order.payment_status === "CAPTURED") return;
    if (order.payment_method !== "PAY_LATER") throw new ApiError(409, "NOT_PAY_LATER", "Only orders taken as “pay later” can be marked paid here.");
    if (order.status === "CANCELLED") throw new ApiError(409, "ORDER_CANCELLED", "This order was cancelled.");
    const updated = await tx.query(
      `UPDATE payments SET status = 'CAPTURED', captured_at = now(), metadata = metadata || $2::jsonb, updated_at = now()
       WHERE order_id = $1 AND provider = 'manual' AND status = 'PENDING'`,
      [order.id, JSON.stringify({ method, recordedBy: actor.userId })]);
    if (!updated.rowCount) {
      await tx.query(
        `INSERT INTO payments (tenant_id, order_id, provider, status, amount_minor, currency, idempotency_key, metadata, captured_at)
         VALUES ($1, $2, 'manual', 'CAPTURED', $3, $4, $5, $6, now())`,
        [actor.tenantId, order.id, order.total_minor, order.currency, `order:${order.id}:manual-paid`, JSON.stringify({ method, recordedBy: actor.userId })]);
    }
    await tx.query(`UPDATE orders SET payment_status = 'CAPTURED', payment_method = $2, paid_at = now(), updated_at = now() WHERE id = $1`, [order.id, method]);
    await audit(tx, actor, "OrderMarkedPaid", { type: "Order", id: order.id }, { method: PAYMENT_METHOD_LABELS[method], amountMinor: order.total_minor, orderNumber: order.order_number });
    await emitEvent(tx, { tenantId: actor.tenantId, type: "PaymentRecorded", aggregateType: "Order", aggregateId: order.id, payload: { method } });
  });
  return orderDetail(actor.tenantId, orderId, role);
}

