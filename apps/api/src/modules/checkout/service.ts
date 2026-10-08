// Order placement (specs/cart-checkout, specs/orders, specs/customers, specs/promotions).
import { normalizeEmail, normalizePhone } from "@restaurant-os/domain";
import type { PlaceOrderInput, PlaceOrderResult, Quote, QuoteInput } from "@restaurant-os/types";
import { isUniqueViolation, pool, withTransaction, type Tx } from "../../db/pool.ts";
import { ApiError, notFound } from "../../lib/errors.ts";
import { emitEvent } from "../../lib/events.ts";
import { publicToken } from "../../lib/format.ts";
import { brandLinks, loadStore, type StoreContext } from "../storefront/store.ts";
import { ORDER_COLUMNS, toPublicOrder, type OrderRow } from "../orders/read.ts";
import { paymentAction, startPayment } from "../payments/service.ts";
import { computeQuote } from "./pricing.ts";

export async function quote(slug: string, input: QuoteInput): Promise<Quote> {
  const store = await loadStore(pool(), slug);
  return (await computeQuote(pool(), store, input)).quote;
}

function storeContact(store: StoreContext) {
  return { name: store.name, phone: store.outlet?.phone ?? null, whatsapp: brandLinks(store.metadata).whatsapp };
}

async function findOrderByKey(tx: Tx | ReturnType<typeof pool>, tenantId: string, key: string): Promise<OrderRow | null> {
  const r = await tx.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.tenant_id = $1 AND o.idempotency_key = $2`, [tenantId, key]);
  return r.rows[0] ?? null;
}

/** Creates or updates the customer by phone. A blank name (staff didn't ask) keeps the stored one. */
async function upsertCustomer(tx: Tx, tenantId: string, input: PlaceOrderInput["customer"]): Promise<{ id: string; name: string }> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new ApiError(422, "INVALID_PHONE", "Enter a valid 10-digit mobile number.", { fields: { "customer.phone": "Enter a valid 10-digit mobile number." } });
  const email = normalizeEmail(input.email);
  const consent = input.marketingConsent;
  const r = await tx.query<{ id: string; name: string }>(
    `INSERT INTO customers (tenant_id, name, phone, marketing_consent_status, marketing_consent_at, last_order_at)
     VALUES ($1, coalesce(nullif($2, ''), 'Customer'), $3, $4, CASE WHEN $5 THEN now() END, now())
     ON CONFLICT (tenant_id, phone) DO UPDATE SET
       name = CASE WHEN $2 = '' THEN customers.name ELSE excluded.name END,
       marketing_consent_status = CASE WHEN $5 THEN 'GRANTED' ELSE customers.marketing_consent_status END,
       marketing_consent_at = CASE WHEN $5 AND customers.marketing_consent_status <> 'GRANTED' THEN now() ELSE customers.marketing_consent_at END,
       last_order_at = now(), updated_at = now()
     RETURNING id, name`,
    [tenantId, input.name, phone, consent ? "GRANTED" : "UNKNOWN", consent],
  );
  const customerId = r.rows[0]!.id;
  const name = r.rows[0]!.name;
  if (email) {
    // Email is unique per tenant; keep the first owner of an address rather than failing checkout.
    await tx.query(
      `UPDATE customers SET email = $3 WHERE id = $2 AND tenant_id = $1 AND (email IS NULL OR lower(email) <> $3)
         AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.tenant_id = $1 AND lower(c.email) = $3 AND c.id <> $2)`,
      [tenantId, customerId, email],
    );
  }
  return { id: customerId, name };
}

async function rememberAddress(tx: Tx, tenantId: string, customerId: string, address: NonNullable<QuoteInput["address"]>) {
  const updated = await tx.query(
    `UPDATE customer_addresses SET last_used_at = now(), line2 = $5, delivery_notes = $6, latitude = $7, longitude = $8
     WHERE tenant_id = $1 AND customer_id = $2 AND lower(line1) = lower($3) AND postal_code = $4`,
    [tenantId, customerId, address.line1, address.postalCode, address.line2 || null, address.landmark || null, address.location?.latitude ?? null, address.location?.longitude ?? null],
  );
  if (!updated.rowCount) {
    await tx.query(
      `INSERT INTO customer_addresses (tenant_id, customer_id, line1, line2, city, region, postal_code, delivery_notes, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [tenantId, customerId, address.line1, address.line2 || null, address.city, address.region || null, address.postalCode, address.landmark || null, address.location?.latitude ?? null, address.location?.longitude ?? null],
    );
  }
}

async function nextOrderNumber(tx: Tx, tenantId: string): Promise<number> {
  const r = await tx.query<{ last_number: number }>(
    `INSERT INTO tenant_order_counters (tenant_id, last_number) VALUES ($1, 1001)
     ON CONFLICT (tenant_id) DO UPDATE SET last_number = tenant_order_counters.last_number + 1 RETURNING last_number`,
    [tenantId],
  );
  return r.rows[0]!.last_number;
}

/** How an order came in: the customer on the website, or staff entering it in the dashboard (ADR-014). */
export type OrderOrigin =
  | { kind: "WEBSITE" }
  | { kind: "STAFF"; channel: string; userId: string; payment: "CASH" | "UPI" | "CARD" | "PAY_LATER"; notifyCustomer: boolean };

export interface OrderRecordInput extends QuoteInput {
  /** null or a blank phone = walk-in without a customer record (staff only). */
  customer: { name: string; phone: string; email: string; marketingConsent: boolean } | null;
  customerNote: string;
  expectedTotalMinor: number;
}

/**
 * Prices (with the shared checkout rules) and stores one order inside `tx`: customer, address, offer usage, items,
 * status history and the OrderCreated event. Website and staff orders differ only in `origin`: staff orders start
 * accepted, record how they are paid, and may use staff-only offers.
 */
export async function createOrderRecord(tx: Tx, store: StoreContext, input: OrderRecordInput, idempotencyKey: string, origin: OrderOrigin): Promise<string> {
  const staff = origin.kind === "STAFF";
  const { quote: q, lines, zone, promotion, totals } = await computeQuote(tx, store, { ...input, customerPhone: input.customer?.phone ?? "" }, { forUpdate: true, staff });
  if (q.issues.length) {
    const first = q.issues[0]!;
    throw new ApiError(422, first.code, first.message, { issues: q.issues, quote: q });
  }
  if (input.promotionCode && !promotion) throw new ApiError(422, "PROMOTION_INVALID", q.promotionError ?? "This code cannot be applied.", { quote: q });
  if (q.totalMinor !== input.expectedTotalMinor) {
    throw new ApiError(409, "PRICE_CHANGED", "Prices changed since you last looked. Please review your order total.", { quote: q });
  }

  // Customers are identified by phone; a staff-entered walk-in without one gets no customer record.
  const customer = input.customer?.phone ? await upsertCustomer(tx, store.tenantId, input.customer) : null;
  const customerId = customer?.id ?? null;
  if (customerId && input.fulfillmentType === "DELIVERY" && input.address) await rememberAddress(tx, store.tenantId, customerId, input.address);

  if (promotion) {
    // Row is locked by computeQuote; the guarded increment makes the usage cap atomic under concurrency.
    const used = await tx.query(`UPDATE promotions SET usage_count = usage_count + 1, updated_at = now() WHERE id = $1 AND (usage_cap IS NULL OR usage_count < usage_cap)`, [promotion.id]);
    if (!used.rowCount) throw new ApiError(422, "PROMOTION_INVALID", `${promotion.code} has reached its usage limit.`);
  }

  const outlet = store.outlet!;
  const orderNumber = await nextOrderNumber(tx, store.tenantId);
  const etaMin = zone ? zone.etaMin : outlet.default_prep_minutes;
  const etaMax = zone ? zone.etaMax : outlet.default_prep_minutes + 10;
  const phone = input.customer?.phone ? normalizePhone(input.customer.phone) : null;
  const address = input.fulfillmentType === "DELIVERY" && input.address
    ? { line1: input.address.line1, line2: input.address.line2, landmark: input.address.landmark, city: input.address.city, region: input.address.region, postalCode: input.address.postalCode, location: input.address.location ?? null }
    : null;
  const paidNow = staff && origin.payment !== "PAY_LATER";
  const snapshot = { name: input.customer?.name || customer?.name || "Walk-in customer", phone, email: input.customer ? normalizeEmail(input.customer.email) : null };

  const created = await tx.query<{ id: string }>(
    `INSERT INTO orders (tenant_id, outlet_id, customer_id, channel, status, payment_status, fulfillment_type, currency,
       subtotal_minor, discount_minor, fee_minor, tax_minor, total_minor, customer_snapshot, address_snapshot, idempotency_key,
       order_number, public_token, customer_note, promotion_id, promotion_code, delivery_zone_id, eta_min, eta_max,
       created_by_user_id, payment_method, notify_customer, accepted_at, paid_at)
     VALUES ($1, $2, $3, $4, $5::order_status, $6::payment_status, $7, $8, $9, $10, $11, 0, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
       $24, $25, $26, CASE WHEN $27::boolean THEN now() END, CASE WHEN $28::boolean THEN now() END)
     RETURNING id`,
    [store.tenantId, outlet.id, customerId, staff ? origin.channel : "DIRECT_WEB", staff ? "ACCEPTED" : "NEW", paidNow ? "CAPTURED" : "PENDING", input.fulfillmentType, store.currency,
      totals.subtotalMinor.toString(), totals.discountMinor.toString(), totals.feeMinor.toString(), totals.totalMinor.toString(),
      JSON.stringify(snapshot), address ? JSON.stringify(address) : null, idempotencyKey,
      orderNumber, publicToken(), input.customerNote || null, promotion?.id ?? null, promotion?.code ?? null, zone?.id ?? null, etaMin, etaMax,
      staff ? origin.userId : null, staff ? origin.payment : null, staff ? origin.notifyCustomer : true, staff, paidNow],
  );
  const id = created.rows[0]!.id;

  for (const [index, line] of lines.entries()) {
    await tx.query(
      `INSERT INTO order_items (order_id, product_id, product_name_snapshot, base_price_minor, unit_price_minor, quantity, line_total_minor, modifiers_snapshot, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, line.productId, line.name, line.basePriceMinor.toString(), line.unitPriceMinor.toString(), line.quantity, line.lineTotalMinor.toString(),
        JSON.stringify(line.modifiers.map((m) => ({ groupId: m.groupId, groupName: m.groupName, modifierId: m.modifierId, name: m.name, priceDeltaMinor: Number(m.priceDeltaMinor) }))), index],
    );
  }
  if (promotion) {
    await tx.query(`INSERT INTO promotion_redemptions (tenant_id, promotion_id, customer_id, order_id, discount_minor, applied_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [store.tenantId, promotion.id, customerId, id, totals.discountMinor.toString(), staff ? origin.userId : null]);
  }
  if (staff) {
    await tx.query(`INSERT INTO order_status_events (tenant_id, order_id, to_status, actor_user_id, note) VALUES ($1, $2, 'NEW', $3, $4)`,
      [store.tenantId, id, origin.userId, `Entered by staff (${CHANNEL_LABELS[origin.channel] ?? origin.channel})`]);
    await tx.query(`INSERT INTO order_status_events (tenant_id, order_id, from_status, to_status, actor_user_id) VALUES ($1, $2, 'NEW', 'ACCEPTED', $3)`, [store.tenantId, id, origin.userId]);
    await tx.query(
      `INSERT INTO payments (tenant_id, order_id, provider, status, amount_minor, currency, idempotency_key, metadata, captured_at)
       VALUES ($1, $2, 'manual', $3::payment_status, $4, $5, $6, $7, CASE WHEN $8::boolean THEN now() END)`,
      [store.tenantId, id, paidNow ? "CAPTURED" : "PENDING", totals.totalMinor.toString(), store.currency, `order:${id}:manual`,
        JSON.stringify({ method: paidNow ? origin.payment : null, recordedBy: paidNow ? origin.userId : null }), paidNow],
    );
  } else {
    await tx.query(`INSERT INTO order_status_events (tenant_id, order_id, to_status, note) VALUES ($1, $2, 'NEW', 'Order placed')`, [store.tenantId, id]);
  }
  await tx.query(`INSERT INTO analytics_events (tenant_id, event_name, order_id, customer_id, properties) VALUES ($1, 'order_created', $2, $3, $4)`,
    [store.tenantId, id, customerId, JSON.stringify({ totalMinor: Number(totals.totalMinor), fulfillmentType: input.fulfillmentType, promotionCode: promotion?.code ?? null, channel: staff ? origin.channel : "DIRECT_WEB" })]);
  await emitEvent(tx, { tenantId: store.tenantId, type: "OrderCreated", aggregateType: "Order", aggregateId: id, payload: { orderNumber, ...(staff ? { enteredByStaff: true, payment: origin.payment } : {}) } });
  return id;
}

export const CHANNEL_LABELS: Record<string, string> = { DIRECT_WEB: "Website", WHATSAPP: "WhatsApp", PHONE: "Phone", WALK_IN: "Walk-in", OTHER: "Other" };

export async function findOrderByIdempotencyKey(db: Tx | ReturnType<typeof pool>, tenantId: string, key: string) {
  return findOrderByKey(db, tenantId, key);
}

export async function placeOrder(slug: string, input: PlaceOrderInput, idempotencyKey: string): Promise<PlaceOrderResult> {
  const store = await loadStore(pool(), slug);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey)) throw new ApiError(400, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be 8-120 URL-safe characters.");

  const existing = await findOrderByKey(pool(), store.tenantId, idempotencyKey);
  if (existing) return replay(store, existing);

  let orderId: string;
  try {
    orderId = await withTransaction(async (tx) => {
      const raced = await findOrderByKey(tx, store.tenantId, idempotencyKey);
      if (raced) return raced.id;
      return createOrderRecord(tx, store, input, idempotencyKey, { kind: "WEBSITE" });
    });
  } catch (error) {
    // Two concurrent submissions with the same key: the loser returns the winner's order.
    if (isUniqueViolation(error)) {
      const winner = await findOrderByKey(pool(), store.tenantId, idempotencyKey);
      if (winner) return replay(store, winner);
    }
    throw error;
  }

  let payment: PlaceOrderResult["payment"];
  try {
    payment = await startPayment(store.tenantId, orderId);
  } catch {
    // The order exists; the customer can retry payment from the order page.
    payment = { status: "PENDING", action: { type: "NONE", url: null } };
  }
  const order = await loadOrder(store, orderId);
  return { order: await toPublicOrder(pool(), order, storeContact(store)), payment, duplicate: false };
}

async function replay(store: StoreContext, order: OrderRow): Promise<PlaceOrderResult> {
  const latest = await pool().query<{ provider: string; status: PlaceOrderResult["payment"]["status"] }>(
    `SELECT provider, status FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [order.id]);
  const p = latest.rows[0];
  const action = p && ["CREATED", "PENDING"].includes(p.status) ? paymentAction(p.provider, order.public_token) : { type: "NONE" as const, url: null };
  return { order: await toPublicOrder(pool(), order, storeContact(store)), payment: { status: order.payment_status, action }, duplicate: true };
}

async function loadOrder(store: StoreContext, orderId: string): Promise<OrderRow> {
  const r = await pool().query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1 AND o.tenant_id = $2`, [orderId, store.tenantId]);
  if (!r.rowCount) throw notFound("Order", "ORDER_NOT_FOUND");
  return r.rows[0]!;
}

export async function orderByToken(slug: string, token: string): Promise<{ store: StoreContext; order: OrderRow }> {
  const store = await loadStore(pool(), slug);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound("Order", "ORDER_NOT_FOUND");
  const r = await pool().query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.public_token = $1 AND o.tenant_id = $2`, [token, store.tenantId]);
  if (!r.rowCount) throw notFound("Order", "ORDER_NOT_FOUND");
  return { store, order: r.rows[0]! };
}

export async function publicOrder(slug: string, token: string) {
  const { store, order } = await orderByToken(slug, token);
  return toPublicOrder(pool(), order, storeContact(store));
}
