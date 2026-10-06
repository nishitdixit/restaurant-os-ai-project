// First-party customer records (PRD 5.10, specs/customers, docs/CRM.md).
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CustomerListQuerySchema, type AdminCustomerDetail, type AdminCustomerSummary } from "@restaurant-os/types";
import { pool, withTransaction } from "../../db/pool.ts";
import { notFound } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { decodeCursor, encodeCursor, iso } from "../../lib/format.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";
import { listCustomerOrders } from "../orders/admin.ts";

const PAID = `o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED') AND o.status <> 'CANCELLED'`;

interface CustomerRow {
  id: string; name: string; phone: string | null; email: string | null; order_count: number; total_spent: number; first_order_at: Date | null; last_paid_at: Date | null;
  marketing_consent_status: string; created_at: Date; notes: string;
}

const CUSTOMER_SELECT = `SELECT c.id, c.name, c.phone, c.email, c.marketing_consent_status, c.created_at, c.notes,
  coalesce(s.order_count, 0) AS order_count, coalesce(s.total_spent, 0) AS total_spent, s.first_order_at, s.last_paid_at
  FROM customers c
  LEFT JOIN LATERAL (SELECT count(*) AS order_count, sum(o.total_minor) AS total_spent, min(o.created_at) AS first_order_at, max(o.created_at) AS last_paid_at
                     FROM orders o WHERE o.customer_id = c.id AND ${PAID}) s ON true`;

function toSummary(c: CustomerRow): AdminCustomerSummary {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email, orderCount: c.order_count, totalSpentMinor: c.total_spent,
    firstOrderAt: iso(c.first_order_at), lastOrderAt: iso(c.last_paid_at), marketingConsent: c.marketing_consent_status === "GRANTED",
  };
}

export async function customerRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/customers", { preValidation: requirePermission("customer.read"), schema: { tags: ["customers"], querystring: CustomerListQuerySchema } }, async (req) => {
    const { tenantId } = tenantOf(req);
    const params: unknown[] = [tenantId];
    const where = [`c.tenant_id = $1`];
    if (req.query.q) {
      params.push(`%${req.query.q.toLowerCase()}%`);
      where.push(`(lower(c.name) LIKE $${params.length} OR c.phone LIKE $${params.length} OR lower(c.email) LIKE $${params.length})`);
    }
    // Simple MVP segment filters (docs/CRM.md).
    if (req.query.segment === "new") where.push(`coalesce(s.order_count, 0) = 1`);
    if (req.query.segment === "repeat") where.push(`coalesce(s.order_count, 0) >= 2`);
    if (req.query.segment === "inactive_30") where.push(`s.last_paid_at < now() - interval '30 days'`);
    const cursor = decodeCursor(req.query.cursor);
    if (cursor) { params.push(cursor.at, cursor.id); where.push(`(c.created_at, c.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`); }
    params.push(req.query.limit + 1);
    const rows = await pool().query<CustomerRow>(`${CUSTOMER_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.created_at DESC, c.id DESC LIMIT $${params.length}`, params);
    const page = rows.rows.slice(0, req.query.limit);
    const last = page[page.length - 1];
    return { items: page.map(toSummary), nextCursor: rows.rows.length > req.query.limit && last ? encodeCursor(last.created_at, last.id) : null };
  });

  r.get("/v1/admin/customers/:id", { preValidation: requirePermission("customer.read"), schema: { tags: ["customers"], params: z.object({ id: z.uuid() }) } }, async (req): Promise<AdminCustomerDetail> => {
    const { tenantId } = tenantOf(req);
    const db = pool();
    const c = await db.query<CustomerRow>(`${CUSTOMER_SELECT} WHERE c.tenant_id = $1 AND c.id = $2`, [tenantId, req.params.id]);
    const customer = c.rows[0];
    if (!customer) throw notFound("Customer");
    const [addresses, orders, favourites, coupons] = await Promise.all([
      db.query<{ id: string; line1: string; line2: string | null; city: string; postal_code: string; last_used_at: Date }>(
        `SELECT id, line1, line2, city, postal_code, last_used_at FROM customer_addresses WHERE tenant_id = $1 AND customer_id = $2 ORDER BY last_used_at DESC LIMIT 10`, [tenantId, customer.id]),
      listCustomerOrders(tenantId, customer.id),
      db.query<{ name: string; quantity: number }>(
        `SELECT i.product_name_snapshot AS name, sum(i.quantity)::int AS quantity FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.tenant_id = $1 AND o.customer_id = $2 AND ${PAID} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [tenantId, customer.id]),
      db.query<{ code: string; discount_minor: number; redeemed_at: Date }>(
        `SELECT p.code, r.discount_minor, r.redeemed_at FROM promotion_redemptions r JOIN promotions p ON p.id = r.promotion_id
         WHERE r.tenant_id = $1 AND r.customer_id = $2 ORDER BY r.redeemed_at DESC LIMIT 20`, [tenantId, customer.id]),
    ]);
    return {
      ...toSummary(customer),
      createdAt: iso(customer.created_at)!,
      notes: customer.notes,
      addresses: addresses.rows.map((a) => ({ id: a.id, line1: a.line1, line2: a.line2, city: a.city, postalCode: a.postal_code, lastUsedAt: iso(a.last_used_at)! })),
      orders,
      favouriteProducts: favourites.rows,
      couponsUsed: coupons.rows.map((x) => ({ code: x.code, discountMinor: x.discount_minor, at: iso(x.redeemed_at)! })),
    };
  });

  r.patch("/v1/admin/customers/:id", {
    preValidation: requirePermission("customer.manage"),
    schema: { tags: ["customers"], params: z.object({ id: z.uuid() }), body: z.object({ notes: z.string().max(2000).optional(), marketingConsent: z.boolean().optional() }) },
  }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const r = await tx.query(
        `UPDATE customers SET notes = coalesce($3, notes),
           marketing_consent_status = CASE WHEN $4::boolean IS NULL THEN marketing_consent_status WHEN $4::boolean THEN 'GRANTED' ELSE 'WITHDRAWN' END,
           marketing_consent_at = CASE WHEN $4::boolean IS NULL THEN marketing_consent_at ELSE now() END, updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, actor.tenantId, req.body.notes ?? null, req.body.marketingConsent ?? null]);
      if (!r.rowCount) throw notFound("Customer");
      await audit(tx, actor, "CustomerUpdated", { type: "Customer", id: req.params.id }, { notesChanged: req.body.notes !== undefined, marketingConsent: req.body.marketingConsent });
    });
    return { ok: true };
  });
}
