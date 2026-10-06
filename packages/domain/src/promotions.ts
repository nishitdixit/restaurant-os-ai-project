// Promotion eligibility (docs/MARKETING.md, PRD 5.7). Pure evaluation; atomic usage accounting
// happens in the database under a row lock on the promotion.

export type PromotionType = "FIXED" | "PERCENTAGE";

export interface PromotionRule {
  code: string;
  type: PromotionType;
  value: bigint;
  active: boolean;
  startsAt: Date;
  endsAt: Date;
  minimumOrderMinor: bigint;
  maxDiscountMinor: bigint | null;
  usageCap: number | null;
  usageCount: number;
  newCustomerOnly: boolean;
  oncePerCustomer: boolean;
}

export type PromotionIneligibility =
  | "NOT_ACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "MINIMUM_NOT_MET"
  | "USAGE_LIMIT_REACHED"
  | "NEW_CUSTOMERS_ONLY"
  | "ALREADY_USED";

export type PromotionEvaluation =
  | { eligible: true; discountMinor: bigint }
  | { eligible: false; reason: PromotionIneligibility; message: string };

export interface PromotionContext {
  subtotalMinor: bigint;
  now: Date;
  /** Paid, non-cancelled orders this customer placed before. null when the customer is not yet known. */
  customerPriorOrders: number | null;
  /** Times this customer already redeemed this promotion. */
  customerPriorRedemptions: number;
  formatMoney: (minor: bigint) => string;
}

export function computeDiscount(rule: Pick<PromotionRule, "type" | "value" | "maxDiscountMinor">, subtotalMinor: bigint): bigint {
  let discount = rule.type === "PERCENTAGE" ? (subtotalMinor * rule.value) / 100n : rule.value;
  if (rule.maxDiscountMinor !== null && discount > rule.maxDiscountMinor) discount = rule.maxDiscountMinor;
  if (discount > subtotalMinor) discount = subtotalMinor;
  return discount < 0n ? 0n : discount;
}

export function evaluatePromotion(rule: PromotionRule, ctx: PromotionContext): PromotionEvaluation {
  if (!rule.active) return { eligible: false, reason: "NOT_ACTIVE", message: `${rule.code} is not active right now.` };
  if (ctx.now < rule.startsAt) return { eligible: false, reason: "NOT_STARTED", message: `${rule.code} has not started yet.` };
  if (ctx.now >= rule.endsAt) return { eligible: false, reason: "EXPIRED", message: `${rule.code} has expired.` };
  if (rule.usageCap !== null && rule.usageCount >= rule.usageCap) {
    return { eligible: false, reason: "USAGE_LIMIT_REACHED", message: `${rule.code} has reached its usage limit.` };
  }
  if (ctx.subtotalMinor < rule.minimumOrderMinor) {
    const short = rule.minimumOrderMinor - ctx.subtotalMinor;
    return { eligible: false, reason: "MINIMUM_NOT_MET", message: `Add ${ctx.formatMoney(short)} more to use ${rule.code} (minimum order ${ctx.formatMoney(rule.minimumOrderMinor)}).` };
  }
  if (rule.newCustomerOnly && (ctx.customerPriorOrders ?? 0) > 0) {
    return { eligible: false, reason: "NEW_CUSTOMERS_ONLY", message: `${rule.code} is only for your first order.` };
  }
  if (rule.oncePerCustomer && ctx.customerPriorRedemptions > 0) {
    return { eligible: false, reason: "ALREADY_USED", message: `You have already used ${rule.code}.` };
  }
  return { eligible: true, discountMinor: computeDiscount(rule, ctx.subtotalMinor) };
}

export function normalizePromotionCode(code: string): string {
  return code.trim().toUpperCase();
}

export function describePromotion(rule: Pick<PromotionRule, "type" | "value" | "minimumOrderMinor" | "maxDiscountMinor">, formatMoney: (minor: bigint) => string): string {
  const benefit = rule.type === "PERCENTAGE"
    ? `${rule.value}% off${rule.maxDiscountMinor !== null ? ` (up to ${formatMoney(rule.maxDiscountMinor)})` : ""}`
    : `${formatMoney(rule.value)} off`;
  return rule.minimumOrderMinor > 0n ? `${benefit} on orders above ${formatMoney(rule.minimumOrderMinor)}` : benefit;
}
