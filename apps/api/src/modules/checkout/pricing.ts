// Server-authoritative checkout calculation (docs/BUSINESS_RULES.md "Cart"). The same function backs
// the live quote shown to the customer and the order-creation transaction.
import {
  CartValidationError, evaluatePromotion, findServiceableZone, normalizePhone, normalizePromotionCode, parseZoneRule,
  resolveModifierSelection, unitPriceWithModifiers, type DeliveryZone, type ModifierGroupRule, type PromotionRule, type SelectedModifier,
} from "@restaurant-os/domain";
import type { QuoteInput, Quote, QuoteIssue } from "@restaurant-os/types";
import type { Db } from "../../db/pool.ts";
import { moneyFormatter } from "../../lib/format.ts";
import { outletLocation, outletOpenState, type StoreContext } from "../storefront/store.ts";

export interface PricedLine {
  productId: string;
  name: string;
  quantity: number;
  basePriceMinor: bigint;
  modifiers: SelectedModifier[];
  unitPriceMinor: bigint;
  lineTotalMinor: bigint;
  available: boolean;
  problem: string | null;
}

/** SQL predicate: product currently has an active out-of-stock override. */
export const UNAVAILABLE_SQL = `EXISTS (SELECT 1 FROM availability_overrides a WHERE a.tenant_id = p.tenant_id AND a.product_id = p.id AND a.status = 'INACTIVE'
  AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now()))`;

export async function loadModifierGroups(db: Db, tenantId: string, productIds: string[]): Promise<Map<string, ModifierGroupRule[]>> {
  const result = new Map<string, ModifierGroupRule[]>();
  if (!productIds.length) return result;
  const r = await db.query<{ product_id: string; group_id: string; group_name: string; min_selections: number; max_selections: number; modifier_id: string | null; modifier_name: string | null; price_delta_minor: number | null; modifier_status: string | null }>(
    `SELECT pmg.product_id, g.id AS group_id, g.name AS group_name, g.min_selections, g.max_selections,
            m.id AS modifier_id, m.name AS modifier_name, m.price_delta_minor, m.status AS modifier_status
     FROM product_modifier_groups pmg
     JOIN modifier_groups g ON g.id = pmg.modifier_group_id AND g.tenant_id = $1 AND g.status = 'ACTIVE'
     LEFT JOIN modifiers m ON m.modifier_group_id = g.id AND m.status IN ('ACTIVE','INACTIVE')
     WHERE pmg.product_id = ANY($2::uuid[])
     ORDER BY pmg.sort_order, g.name, m.sort_order, m.name`,
    [tenantId, productIds],
  );
  for (const row of r.rows) {
    const groups = result.get(row.product_id) ?? [];
    let group = groups.find((g) => g.id === row.group_id);
    if (!group) {
      group = { id: row.group_id, name: row.group_name, minSelections: row.min_selections, maxSelections: row.max_selections, modifiers: [] };
      groups.push(group);
      result.set(row.product_id, groups);
    }
    if (row.modifier_id) {
      (group.modifiers as ModifierGroupRule["modifiers"][number][]).push({ id: row.modifier_id, name: row.modifier_name!, priceDeltaMinor: BigInt(row.price_delta_minor ?? 0), active: row.modifier_status === "ACTIVE" });
    }
  }
  return result;
}

export async function priceLines(db: Db, tenantId: string, lines: QuoteInput["lines"], lock = false): Promise<PricedLine[]> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await db.query<{ id: string; name: string; status: string; base_price_minor: number; unavailable: boolean }>(
    `SELECT p.id, p.name, p.status, p.base_price_minor, ${UNAVAILABLE_SQL} AS unavailable
     FROM products p WHERE p.tenant_id = $1 AND p.id = ANY($2::uuid[]) ${lock ? "FOR SHARE OF p" : ""}`,
    [tenantId, ids],
  );
  const byId = new Map(products.rows.map((p) => [p.id, p]));
  const groups = await loadModifierGroups(db, tenantId, ids);

  return lines.map((line) => {
    const product = byId.get(line.productId);
    const base = { productId: line.productId, quantity: line.quantity, modifiers: [] as SelectedModifier[] };
    if (!product || product.status !== "ACTIVE") {
      return { ...base, name: product?.name ?? "Item", basePriceMinor: 0n, unitPriceMinor: 0n, lineTotalMinor: 0n, available: false, problem: "This item is no longer on the menu." };
    }
    const basePriceMinor = BigInt(product.base_price_minor);
    if (product.unavailable) {
      return { ...base, name: product.name, basePriceMinor, unitPriceMinor: basePriceMinor, lineTotalMinor: basePriceMinor * BigInt(line.quantity), available: false, problem: "Out of stock right now." };
    }
    try {
      const modifiers = resolveModifierSelection(groups.get(product.id) ?? [], line.modifierIds ?? []);
      const unit = unitPriceWithModifiers(basePriceMinor, modifiers);
      return { ...base, name: product.name, modifiers, basePriceMinor, unitPriceMinor: unit, lineTotalMinor: unit * BigInt(line.quantity), available: true, problem: null };
    } catch (error) {
      if (!(error instanceof CartValidationError)) throw error;
      return { ...base, name: product.name, basePriceMinor, unitPriceMinor: basePriceMinor, lineTotalMinor: basePriceMinor * BigInt(line.quantity), available: false, problem: error.message };
    }
  });
}

export async function loadZones(db: Db, tenantId: string): Promise<(DeliveryZone & { sortOrder: number })[]> {
  const r = await db.query<{ id: string; name: string; rule_type: string; rule_config: unknown; fee_minor: number; minimum_order_minor: number; eta_min: number; eta_max: number; status: string; sort_order: number }>(
    `SELECT id, name, rule_type, rule_config, fee_minor, minimum_order_minor, eta_min, eta_max, status, sort_order FROM delivery_zones WHERE tenant_id = $1 ORDER BY sort_order, name`,
    [tenantId],
  );
  return r.rows.flatMap((z) => {
    const rule = parseZoneRule(z.rule_type, z.rule_config);
    return rule ? [{ id: z.id, name: z.name, rule, feeMinor: BigInt(z.fee_minor), minimumOrderMinor: BigInt(z.minimum_order_minor), etaMin: z.eta_min, etaMax: z.eta_max, active: z.status === "ACTIVE", sortOrder: z.sort_order }] : [];
  });
}

interface PromotionRow {
  id: string; code: string; title: string; type: "FIXED" | "PERCENTAGE"; value: number; status: string; starts_at: Date; ends_at: Date;
  minimum_order_minor: number; max_discount_minor: number | null; usage_cap: number | null; usage_count: number; new_customer_only: boolean; once_per_customer: boolean;
}

export function toPromotionRule(p: PromotionRow): PromotionRule {
  return {
    code: p.code, type: p.type, value: BigInt(p.value), active: p.status === "ACTIVE", startsAt: new Date(p.starts_at), endsAt: new Date(p.ends_at),
    minimumOrderMinor: BigInt(p.minimum_order_minor), maxDiscountMinor: p.max_discount_minor === null ? null : BigInt(p.max_discount_minor),
    usageCap: p.usage_cap, usageCount: p.usage_count, newCustomerOnly: p.new_customer_only, oncePerCustomer: p.once_per_customer,
  };
}

export async function customerHistory(db: Db, tenantId: string, phone: string | null, promotionId: string | null) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { customerId: null as string | null, priorOrders: null as number | null, priorRedemptions: 0 };
  const c = await db.query<{ id: string }>(`SELECT id FROM customers WHERE tenant_id = $1 AND phone = $2`, [tenantId, normalized]);
  const customerId = c.rows[0]?.id ?? null;
  if (!customerId) return { customerId: null, priorOrders: 0, priorRedemptions: 0 };
  const stats = await db.query<{ orders: number; redemptions: number }>(
    `SELECT (SELECT count(*) FROM orders WHERE tenant_id = $1 AND customer_id = $2 AND status <> 'CANCELLED' AND payment_status IN ('CAPTURED','PARTIALLY_REFUNDED')) AS orders,
            (SELECT count(*) FROM promotion_redemptions WHERE tenant_id = $1 AND customer_id = $2 AND promotion_id = $3) AS redemptions`,
    [tenantId, customerId, promotionId],
  );
  return { customerId, priorOrders: stats.rows[0]!.orders, priorRedemptions: stats.rows[0]!.redemptions };
}

export interface QuoteResult {
  quote: Quote;
  lines: PricedLine[];
  zone: DeliveryZone | null;
  promotion: (PromotionRow & { discountMinor: bigint }) | null;
  totals: { subtotalMinor: bigint; discountMinor: bigint; feeMinor: bigint; totalMinor: bigint };
}

/**
 * Computes a quote. Problems are reported as `issues` (blocking) or `promotionError` (the code is
 * simply not applied) instead of throwing, so the checkout can explain every failure inline.
 * With `forUpdate`, the promotion row is locked so usage accounting stays atomic.
 */
export async function computeQuote(db: Db, store: StoreContext, input: QuoteInput, options: { forUpdate?: boolean; now?: Date } = {}): Promise<QuoteResult> {
  const now = options.now ?? new Date();
  const fmt = moneyFormatter(store.currency, store.locale);
  const issues: QuoteIssue[] = [];
  const outlet = store.outlet;

  if (!outlet) issues.push({ code: "STORE_UNAVAILABLE", message: "This restaurant is not taking orders yet." });
  else {
    const { openNow, nextOpening } = outletOpenState(outlet, now);
    if (!outlet.accepting_orders) issues.push({ code: "ORDERING_PAUSED", message: "The restaurant has paused online orders for now. Please try again a little later." });
    else if (!openNow) issues.push({ code: "STORE_CLOSED", message: nextOpening ? `We're closed right now. We open ${nextOpening}.` : "We're closed right now." });
    if (input.fulfillmentType === "DELIVERY" && !outlet.delivery_enabled) issues.push({ code: "DELIVERY_UNAVAILABLE", message: "Delivery is not available right now. Choose pickup instead.", field: "fulfillmentType" });
    if (input.fulfillmentType === "PICKUP" && !outlet.pickup_enabled) issues.push({ code: "PICKUP_UNAVAILABLE", message: "Pickup is not available right now. Choose delivery instead.", field: "fulfillmentType" });
  }

  const lines = await priceLines(db, store.tenantId, input.lines, options.forUpdate);
  const unavailable = lines.filter((l) => !l.available);
  if (unavailable.length) {
    issues.push({ code: "ITEM_UNAVAILABLE", message: unavailable.length === 1 ? `${unavailable[0]!.name}: ${unavailable[0]!.problem}` : `${unavailable.length} items in your cart need attention.` });
  }
  const subtotal = lines.filter((l) => l.available).reduce((sum, l) => sum + l.lineTotalMinor, 0n);

  let zone: DeliveryZone | null = null;
  let fee = 0n;
  if (input.fulfillmentType === "DELIVERY" && outlet?.delivery_enabled) {
    if (!input.address) {
      issues.push({ code: "ADDRESS_REQUIRED", message: "Add a delivery address to see the delivery fee.", field: "address" });
    } else {
      const zones = await loadZones(db, store.tenantId);
      const result = findServiceableZone(zones, { postalCode: input.address.postalCode, location: input.address.location ?? null }, outletLocation(outlet));
      if (!result.serviceable) issues.push({ code: "ADDRESS_NOT_SERVICEABLE", message: result.message, field: "address.postalCode" });
      else {
        zone = result.zone;
        fee = zone.feeMinor;
        if (subtotal < zone.minimumOrderMinor) {
          issues.push({ code: "MINIMUM_ORDER_NOT_MET", message: `Add ${fmt(zone.minimumOrderMinor - subtotal)} more to order delivery to this area (minimum ${fmt(zone.minimumOrderMinor)}).` });
        }
      }
    }
  }

  let promotion: QuoteResult["promotion"] = null;
  let promotionError: string | null = null;
  const code = normalizePromotionCode(input.promotionCode ?? "");
  if (code) {
    const p = await db.query<PromotionRow>(
      `SELECT id, code, title, type, value, status, starts_at, ends_at, minimum_order_minor, max_discount_minor, usage_cap, usage_count, new_customer_only, once_per_customer
       FROM promotions WHERE tenant_id = $1 AND upper(code) = $2 AND status IN ('ACTIVE','INACTIVE') ${options.forUpdate ? "FOR UPDATE" : ""}`,
      [store.tenantId, code],
    );
    const row = p.rows[0];
    if (!row) promotionError = `${code} is not a valid code.`;
    else {
      const history = await customerHistory(db, store.tenantId, input.customerPhone || null, row.id);
      const evaluation = evaluatePromotion(toPromotionRule(row), { subtotalMinor: subtotal, now, customerPriorOrders: history.priorOrders, customerPriorRedemptions: history.priorRedemptions, formatMoney: fmt });
      if (evaluation.eligible) promotion = { ...row, discountMinor: evaluation.discountMinor };
      else promotionError = evaluation.message;
    }
  }

  const discount = promotion?.discountMinor ?? 0n;
  const total = subtotal - discount + fee;
  const quote: Quote = {
    currency: store.currency,
    lines: lines.map((l) => ({
      productId: l.productId, name: l.name, quantity: l.quantity,
      modifiers: l.modifiers.map((m) => ({ modifierId: m.modifierId, groupName: m.groupName, name: m.name, priceDeltaMinor: Number(m.priceDeltaMinor) })),
      unitPriceMinor: Number(l.unitPriceMinor), lineTotalMinor: Number(l.lineTotalMinor), available: l.available, problem: l.problem,
    })),
    subtotalMinor: Number(subtotal),
    discountMinor: Number(discount),
    feeMinor: Number(fee),
    taxMinor: 0,
    totalMinor: Number(total),
    promotion: promotion ? { code: promotion.code, title: promotion.title, discountMinor: Number(discount) } : null,
    promotionError,
    delivery: zone ? { zoneName: zone.name, feeMinor: Number(zone.feeMinor), minimumOrderMinor: Number(zone.minimumOrderMinor), etaMin: zone.etaMin, etaMax: zone.etaMax } : null,
    issues,
    canPlaceOrder: issues.length === 0,
  };
  return { quote, lines, zone, promotion, totals: { subtotalMinor: subtotal, discountMinor: discount, feeMinor: fee, totalMinor: total } };
}
