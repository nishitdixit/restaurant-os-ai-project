// Delivery zones (PRD 5.8, specs/delivery) and promotions (PRD 5.7, specs/promotions).
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { DeliveryZoneInputSchema, PromotionInputSchema, type AdminDeliveryZone, type AdminPromotion, type DeliveryZoneInput, type PromotionAudience } from "@restaurant-os/types";
import { pool, withTransaction } from "../../db/pool.ts";
import { notFound, ApiError } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { iso } from "../../lib/format.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";

const Id = z.object({ id: z.uuid() });

function zoneConfig(input: DeliveryZoneInput) {
  return input.ruleType === "POSTAL_CODE" ? { postalCodes: [...new Set(input.postalCodes)] } : { radiusKm: input.radiusKm };
}

async function listZones(tenantId: string): Promise<AdminDeliveryZone[]> {
  const r = await pool().query<{ id: string; name: string; rule_type: "POSTAL_CODE" | "RADIUS"; rule_config: { postalCodes?: string[]; radiusKm?: number }; fee_minor: number; minimum_order_minor: number; free_delivery_minimum_minor: number | null; eta_min: number; eta_max: number; status: string }>(
    `SELECT id, name, rule_type, rule_config, fee_minor, minimum_order_minor, free_delivery_minimum_minor, eta_min, eta_max, status FROM delivery_zones WHERE tenant_id = $1 AND status <> 'ARCHIVED' ORDER BY sort_order, name`, [tenantId]);
  return r.rows.map((z) => ({
    id: z.id, name: z.name, ruleType: z.rule_type, postalCodes: z.rule_config?.postalCodes ?? [], radiusKm: z.rule_config?.radiusKm ?? null,
    feeMinor: z.fee_minor, minimumOrderMinor: z.minimum_order_minor, freeDeliveryMinimumMinor: z.free_delivery_minimum_minor === null ? null : Number(z.free_delivery_minimum_minor), etaMin: z.eta_min, etaMax: z.eta_max, active: z.status === "ACTIVE",
  }));
}

interface PromotionRow {
  id: string; code: string; title: string; description: string; type: "FIXED" | "PERCENTAGE"; value: number; minimum_order_minor: number; max_discount_minor: number | null;
  starts_at: Date; ends_at: Date; usage_cap: number | null; usage_count: number; new_customer_only: boolean; once_per_customer: boolean; is_public: boolean; staff_only: boolean; status: string;
  discount_given: number; website_uses: number; staff_uses: number; applied_by: { staff: string; uses: number }[] | null;
}

/** "Who can use it" (ADR-014) from the two stored flags. */
export function promotionAudience(p: { is_public: boolean; staff_only: boolean }): PromotionAudience {
  return p.staff_only ? "STAFF_ONLY" : p.is_public ? "PUBLIC" : "CODE_ONLY";
}

function promotionState(p: PromotionRow, now = new Date()): AdminPromotion["state"] {
  if (p.status !== "ACTIVE") return "PAUSED";
  if (new Date(p.ends_at) <= now) return "EXPIRED";
  if (new Date(p.starts_at) > now) return "SCHEDULED";
  if (p.usage_cap !== null && p.usage_count >= p.usage_cap) return "EXHAUSTED";
  return "ACTIVE";
}

async function listPromotions(tenantId: string): Promise<AdminPromotion[]> {
  const r = await pool().query<PromotionRow>(
    `SELECT p.id, p.code, p.title, p.description, p.type, p.value, p.minimum_order_minor, p.max_discount_minor, p.starts_at, p.ends_at, p.usage_cap, p.usage_count,
            p.new_customer_only, p.once_per_customer, p.is_public, p.staff_only, p.status,
            coalesce((SELECT sum(r.discount_minor) FROM promotion_redemptions r JOIN orders o ON o.id = r.order_id AND o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED') WHERE r.promotion_id = p.id), 0) AS discount_given,
            (SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.applied_by_user_id IS NULL) AS website_uses,
            (SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.applied_by_user_id IS NOT NULL) AS staff_uses,
            (SELECT json_agg(json_build_object('staff', x.staff, 'uses', x.uses) ORDER BY x.uses DESC, x.staff)
               FROM (SELECT coalesce(u.email, 'Former staff member') AS staff, count(*)::int AS uses FROM promotion_redemptions r JOIN users u ON u.id = r.applied_by_user_id
                     WHERE r.promotion_id = p.id GROUP BY 1) x) AS applied_by
     FROM promotions p WHERE p.tenant_id = $1 AND p.status <> 'ARCHIVED' ORDER BY p.created_at DESC`, [tenantId]);
  return r.rows.map((p) => ({
    id: p.id, code: p.code, title: p.title, description: p.description, type: p.type, value: p.value, minimumOrderMinor: p.minimum_order_minor,
    maxDiscountMinor: p.max_discount_minor, startsAt: iso(p.starts_at)!, endsAt: iso(p.ends_at)!, usageCap: p.usage_cap, usageCount: p.usage_count,
    newCustomerOnly: p.new_customer_only, oncePerCustomer: p.once_per_customer, isPublic: p.is_public, audience: promotionAudience(p), active: p.status === "ACTIVE",
    state: promotionState(p), discountGivenMinor: p.discount_given, usageBySource: { website: p.website_uses, staff: p.staff_uses }, appliedBy: p.applied_by ?? [],
  }));
}

export async function marketingRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/delivery-zones", { preValidation: requirePermission("delivery.manage"), schema: { tags: ["delivery"] } }, async (req) => ({ items: await listZones(tenantOf(req).tenantId) }));

  r.post("/v1/admin/delivery-zones", { preValidation: requirePermission("delivery.manage"), schema: { tags: ["delivery"], body: DeliveryZoneInputSchema } }, async (req, reply) => {
    const actor = actorOf(req);
    const z = req.body;
    const id = await withTransaction(async (tx) => {
      const row = await tx.query<{ id: string }>(
        `INSERT INTO delivery_zones (tenant_id, name, rule_type, rule_config, fee_minor, minimum_order_minor, eta_min, eta_max, status, sort_order, free_delivery_minimum_minor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::business_object_status, coalesce((SELECT max(sort_order) + 10 FROM delivery_zones WHERE tenant_id = $1), 10), $10) RETURNING id`,
        [actor.tenantId, z.name, z.ruleType, JSON.stringify(zoneConfig(z)), z.feeMinor, z.minimumOrderMinor, z.etaMin, z.etaMax, z.active ? "ACTIVE" : "INACTIVE", z.freeDeliveryMinimumMinor ?? null]);
      await audit(tx, actor, "DeliveryZoneCreated", { type: "DeliveryZone", id: row.rows[0]!.id }, { ...z });
      return row.rows[0]!.id;
    });
    return reply.status(201).send({ id });
  });

  r.put("/v1/admin/delivery-zones/:id", { preValidation: requirePermission("delivery.manage"), schema: { tags: ["delivery"], params: Id, body: DeliveryZoneInputSchema } }, async (req) => {
    const actor = actorOf(req);
    const z = req.body;
    await withTransaction(async (tx) => {
      const row = await tx.query(
        `UPDATE delivery_zones SET name = $3, rule_type = $4, rule_config = $5, fee_minor = $6, minimum_order_minor = $7, eta_min = $8, eta_max = $9,
           status = $10::business_object_status, free_delivery_minimum_minor = $11, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, actor.tenantId, z.name, z.ruleType, JSON.stringify(zoneConfig(z)), z.feeMinor, z.minimumOrderMinor, z.etaMin, z.etaMax, z.active ? "ACTIVE" : "INACTIVE", z.freeDeliveryMinimumMinor ?? null]);
      if (!row.rowCount) throw notFound("Delivery area");
      await audit(tx, actor, "DeliveryZoneUpdated", { type: "DeliveryZone", id: req.params.id }, { ...z });
    });
    return { id: req.params.id };
  });

  r.delete("/v1/admin/delivery-zones/:id", { preValidation: requirePermission("delivery.manage"), schema: { tags: ["delivery"], params: Id } }, async (req, reply) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const row = await tx.query(`UPDATE delivery_zones SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [req.params.id, actor.tenantId]);
      if (!row.rowCount) throw notFound("Delivery area");
      await audit(tx, actor, "DeliveryZoneArchived", { type: "DeliveryZone", id: req.params.id });
    });
    return reply.status(204).send();
  });

  r.get("/v1/admin/promotions", { preValidation: requirePermission("promotion.manage"), schema: { tags: ["promotions"] } }, async (req) => ({ items: await listPromotions(tenantOf(req).tenantId) }));

  const savePromotion = async (actor: ReturnType<typeof actorOf>, id: string | null, p: z.infer<typeof PromotionInputSchema>) => withTransaction(async (tx) => {
    const clash = await tx.query(`SELECT 1 FROM promotions WHERE tenant_id = $1 AND upper(code) = $2 AND ($3::uuid IS NULL OR id <> $3)`, [actor.tenantId, p.code, id]);
    if (clash.rowCount) throw new ApiError(409, "CODE_TAKEN", `${p.code} already exists.`, { fields: { code: "Code already exists." } });
    const audience = p.audience ?? (p.isPublic ? "PUBLIC" : "CODE_ONLY");
    const params = [actor.tenantId, p.code, p.title, p.description, p.type, p.value, p.minimumOrderMinor, p.maxDiscountMinor ?? null, p.startsAt, p.endsAt,
      p.usageCap ?? null, p.newCustomerOnly, p.oncePerCustomer, audience === "PUBLIC", p.active ? "ACTIVE" : "INACTIVE", audience === "STAFF_ONLY"];
    let promotionId = id;
    if (id) {
      const row = await tx.query(
        `UPDATE promotions SET code = $2, title = $3, description = $4, type = $5::promotion_type, value = $6, minimum_order_minor = $7, max_discount_minor = $8,
           starts_at = $9, ends_at = $10, usage_cap = $11, new_customer_only = $12, once_per_customer = $13, is_public = $14, status = $15::business_object_status, staff_only = $16, updated_at = now()
         WHERE id = $17 AND tenant_id = $1`, [...params, id]);
      if (!row.rowCount) throw notFound("Offer");
    } else {
      promotionId = (await tx.query<{ id: string }>(
        `INSERT INTO promotions (tenant_id, code, title, description, type, value, minimum_order_minor, max_discount_minor, starts_at, ends_at, usage_cap,
           new_customer_only, once_per_customer, is_public, status, staff_only)
         VALUES ($1, $2, $3, $4, $5::promotion_type, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::business_object_status, $16) RETURNING id`, params)).rows[0]!.id;
    }
    await audit(tx, actor, id ? "PromotionUpdated" : "PromotionCreated", { type: "Promotion", id: promotionId }, { ...p, audience });
    return { id: promotionId };
  });

  r.post("/v1/admin/promotions", { preValidation: requirePermission("promotion.manage"), schema: { tags: ["promotions"], body: PromotionInputSchema } }, async (req, reply) => reply.status(201).send(await savePromotion(actorOf(req), null, req.body)));
  r.put("/v1/admin/promotions/:id", { preValidation: requirePermission("promotion.manage"), schema: { tags: ["promotions"], params: Id, body: PromotionInputSchema } }, async (req) => savePromotion(actorOf(req), req.params.id, req.body));

  r.post("/v1/admin/promotions/:id/active", { preValidation: requirePermission("promotion.manage"), schema: { tags: ["promotions"], params: Id, body: z.object({ active: z.boolean() }) } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const row = await tx.query(`UPDATE promotions SET status = $3::business_object_status, updated_at = now() WHERE id = $1 AND tenant_id = $2 AND status <> 'ARCHIVED'`, [req.params.id, actor.tenantId, req.body.active ? "ACTIVE" : "INACTIVE"]);
      if (!row.rowCount) throw notFound("Offer");
      await audit(tx, actor, req.body.active ? "PromotionResumed" : "PromotionPaused", { type: "Promotion", id: req.params.id });
    });
    return { ok: true };
  });

  r.delete("/v1/admin/promotions/:id", { preValidation: requirePermission("promotion.manage"), schema: { tags: ["promotions"], params: Id } }, async (req, reply) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const row = await tx.query(`UPDATE promotions SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [req.params.id, actor.tenantId]);
      if (!row.rowCount) throw notFound("Offer");
      await audit(tx, actor, "PromotionArchived", { type: "Promotion", id: req.params.id });
    });
    return reply.status(204).send();
  });
}
