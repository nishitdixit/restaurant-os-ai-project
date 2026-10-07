// Dish badges and bestsellers (ADR-013 "Merchandising"). Merchants set a few curated badges per dish; "Bestseller"
// is never set by hand — it is computed from paid orders and only given when a dish has really sold.

export const BADGE_KINDS = ["new", "signature", "chefs-choice", "recommended", "limited", "combo", "custom"] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export const BADGE_TONES = ["brand", "accent", "success", "warning", "neutral"] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];

export const BADGE_LABELS: Record<BadgeKind | "bestseller", string> = {
  bestseller: "Bestseller", new: "New", signature: "Signature", "chefs-choice": "Chef's choice", recommended: "Recommended", limited: "Limited", combo: "Combo", custom: "",
};

const DEFAULT_TONES: Record<BadgeKind | "bestseller", BadgeTone> = {
  bestseller: "brand", new: "success", signature: "accent", "chefs-choice": "accent", recommended: "accent", limited: "warning", combo: "brand", custom: "neutral",
};

/** A badge as stored on a dish (merchant-set). */
export interface ProductBadge {
  kind: BadgeKind;
  /** Only for "custom" (e.g. "Royal Feast"); ignored otherwise. */
  label: string;
  tone: BadgeTone;
}

/** A badge as shown to customers, including the computed "Bestseller". */
export interface DisplayBadge {
  kind: BadgeKind | "bestseller";
  label: string;
  tone: BadgeTone;
}

export const MAX_BADGES = 3;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** Keeps at most three valid badges, one per standard kind; custom badges need a 1–24 character label. */
export function normalizeBadges(input: unknown): ProductBadge[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ProductBadge[] = [];
  for (const raw of input) {
    const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!BADGE_KINDS.includes(b.kind as BadgeKind)) continue;
    const kind = b.kind as BadgeKind;
    const label = kind === "custom" && typeof b.label === "string" ? b.label.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, 24) : "";
    if (kind === "custom" && !label) continue;
    const key = kind === "custom" ? `custom:${label.toLowerCase()}` : kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, label, tone: BADGE_TONES.includes(b.tone as BadgeTone) ? (b.tone as BadgeTone) : DEFAULT_TONES[kind] });
    if (out.length >= MAX_BADGES) break;
  }
  return out;
}

/** Badges to show on a dish: Bestseller first (when earned), then the merchant's own. */
export function displayBadges(badges: readonly ProductBadge[], bestseller: boolean): DisplayBadge[] {
  const own = badges.map((b) => ({ kind: b.kind, label: b.kind === "custom" ? b.label : BADGE_LABELS[b.kind], tone: b.tone }));
  return bestseller ? [{ kind: "bestseller", label: BADGE_LABELS.bestseller, tone: DEFAULT_TONES.bestseller }, ...own] : own;
}

export interface SalesRow {
  productId: string;
  /** Units sold in the window. */
  quantity: number;
  /** Distinct paid orders containing the dish. */
  orders: number;
}

/**
 * Bestsellers: dishes with at least `minOrders` paid orders in the window, ranked by units sold (ties: more
 * orders, then id for a stable order), capped at `limit`. Returns [] when nothing qualifies — never a guess.
 */
export function rankBestsellers(rows: readonly SalesRow[], rules: { minOrders: number; limit: number }): string[] {
  return rows
    .filter((r) => r.orders >= rules.minOrders && r.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || b.orders - a.orders || a.productId.localeCompare(b.productId))
    .slice(0, rules.limit)
    .map((r) => r.productId);
}
