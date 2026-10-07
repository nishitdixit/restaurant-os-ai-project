// Public catalog reads. Only published (ACTIVE) categories/products of a published brand are visible;
// availability is computed live so a disabled item can never be served as purchasable. A verified merchant preview
// (signed token, lib/preview.ts) may also see an unpublished store and the saved draft look and layout.
import {
  describePromotion, displayBadges, experienceMediaIds, normalizeBadges, normalizeExperience, normalizeTheme, rankBestsellers,
  type BestsellerRules, type LocalizedText, type StoreExperience,
} from "@restaurant-os/domain";
import type { Menu, MenuCategory, MenuProduct, PolicyKey, PolicyPage, PublicOffer, StoreConfig } from "@restaurant-os/types";
import { pool, type Db } from "../../db/pool.ts";
import { iso, moneyFormatter } from "../../lib/format.ts";
import { mediaRefMap, mediaUrlMap } from "../../integrations/storage.ts";
import { loadModifierGroups, loadZones, UNAVAILABLE_SQL } from "../checkout/pricing.ts";
import { brandLinks, loadStore, outletLocation, outletOpenState, publishedExperience, publishedTheme, type StoreContext } from "./store.ts";

export interface Access {
  /** A verified merchant preview: unpublished store, draft look and layout. */
  preview: boolean;
}
const PUBLIC: Access = { preview: false };

/** Below this many paid orders an order count is not shown (it would read as a weakness, and says little). */
export const ORDER_COUNT_THRESHOLD = 50;

export const POLICY_TITLES: Record<PolicyKey, string> = {
  refund: "Cancellation & refund policy",
  terms: "Terms & conditions",
  privacy: "Privacy policy",
  delivery: "Delivery policy",
};
const POLICY_KEYS = Object.keys(POLICY_TITLES) as PolicyKey[];

function policyBody(policies: Record<string, unknown>, key: PolicyKey): LocalizedText | null {
  const p = policies[key] as { body?: Partial<LocalizedText> } | undefined;
  const body = { en: typeof p?.body?.en === "string" ? p.body.en : "", hi: typeof p?.body?.hi === "string" ? p.body.hi : "" };
  return body.en.trim() || body.hi.trim() ? body : null;
}

/** The experience to render: the saved draft in a merchant preview, otherwise the published one. */
export function renderedExperience(store: StoreContext, access: Access): StoreExperience {
  const published = publishedExperience(store);
  return access.preview && store.experienceDraft ? normalizeExperience(store.experienceDraft, published) : published;
}

export async function storeConfig(slug: string, access: Access = PUBLIC): Promise<StoreConfig> {
  const db = pool();
  // Unpublished stores still return their config so the storefront can show "Coming soon" with the name.
  const store = await loadStore(db, slug, { allowDraft: true });
  const published = publishedTheme({ theme: store.theme, metadata: store.metadata });
  const theme = access.preview && store.themeDraft ? normalizeTheme(store.themeDraft, published) : published;
  const experience = renderedExperience(store, access);
  const [urls, media, zones, paid] = await Promise.all([
    mediaUrlMap(db, [store.logoAssetId]),
    mediaRefMap(db, store.tenantId, experienceMediaIds(experience)),
    loadZones(db, store.tenantId),
    db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM orders WHERE tenant_id = $1 AND payment_status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND status <> 'CANCELLED'`, [store.tenantId]),
  ]);
  const paidOrders = paid.rows[0]?.n ?? 0;
  const o = store.outlet;
  const open = outletOpenState(o);
  return {
    slug: store.slug,
    name: store.name,
    tagline: store.metadata.tagline ?? "",
    description: store.metadata.description ?? "",
    cuisines: store.metadata.cuisines ?? [],
    logoUrl: store.logoAssetId ? urls.get(store.logoAssetId) ?? null : null,
    primaryColor: theme.colors.primary,
    theme,
    experience,
    media: Object.fromEntries(media),
    stats: { paidOrders: paidOrders >= ORDER_COUNT_THRESHOLD ? paidOrders : null },
    credentials: { legalName: store.legalName, fssai: store.tenantMetadata.fssai ?? "", gstin: store.tenantMetadata.gstin ?? "" },
    policies: POLICY_KEYS.filter((k) => policyBody(store.policies, k)).map((key) => ({ key, title: POLICY_TITLES[key] })),
    links: brandLinks(store.metadata),
    currency: store.currency,
    locale: store.locale,
    outlet: o ? {
      name: o.name,
      phone: o.phone,
      address: { line1: o.address.line1 ?? "", line2: o.address.line2 ?? "", city: o.address.city ?? "", region: o.address.region ?? "", postalCode: o.address.postalCode ?? "" },
      location: outletLocation(o),
      hours: o.hours as Record<string, [string, string][]>,
      timezone: o.timezone,
      openNow: open.openNow,
      nextOpening: open.nextOpening,
      acceptingOrders: o.accepting_orders,
      deliveryEnabled: o.delivery_enabled,
      pickupEnabled: o.pickup_enabled,
      prepMinutes: o.default_prep_minutes,
    } : null,
    deliveryAreas: o?.delivery_enabled ? zones.filter((z) => z.active).map((z) => ({
      name: z.name,
      postalCodes: z.rule.type === "POSTAL_CODE" ? [...z.rule.postalCodes] : [],
      radiusKm: z.rule.type === "RADIUS" ? z.rule.radiusKm : null,
      feeMinor: Number(z.feeMinor), minimumOrderMinor: Number(z.minimumOrderMinor),
      freeDeliveryMinimumMinor: z.freeDeliveryMinimumMinor == null ? null : Number(z.freeDeliveryMinimumMinor),
      etaMin: z.etaMin, etaMax: z.etaMax,
    })) : [],
    updatedAt: iso(store.updatedAt)!,
    published: store.published,
    preview: access.preview,
  };
}

export async function policyPage(slug: string, key: PolicyKey, access: Access = PUBLIC): Promise<PolicyPage | null> {
  const store = await loadStore(pool(), slug, { allowDraft: access.preview });
  const body = policyBody(store.policies, key);
  if (!body) return null;
  const updatedAt = (store.policies[key] as { updatedAt?: string } | undefined)?.updatedAt ?? null;
  return { key, title: POLICY_TITLES[key], body, updatedAt };
}

interface ProductRow {
  id: string; slug: string; name: string; name_hi: string; description: string; description_hi: string; long_description: string; base_price_minor: number; currency: string;
  image_asset_id: string | null; category_id: string; category_slug: string; category_name: string; dietary: MenuProduct["dietary"];
  spice_level: number | null; allergens: string[]; tags: string[]; badges: unknown; unavailable: boolean; unavailable_reason: string | null; updated_at: Date;
}

const PRODUCT_SELECT = `SELECT p.id, p.slug, p.name, p.name_hi, p.description, p.description_hi, p.long_description, p.base_price_minor, trim(p.currency) AS currency, p.image_asset_id,
  c.id AS category_id, c.slug AS category_slug, c.name AS category_name, p.dietary, p.spice_level, p.allergens, p.tags, p.badges, p.updated_at,
  ${UNAVAILABLE_SQL} AS unavailable,
  (SELECT a.reason FROM availability_overrides a WHERE a.tenant_id = p.tenant_id AND a.product_id = p.id AND a.status = 'INACTIVE'
     AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now()) ORDER BY a.starts_at DESC NULLS LAST LIMIT 1) AS unavailable_reason
  FROM products p JOIN categories c ON c.id = p.category_id AND c.status = 'ACTIVE'
  WHERE p.tenant_id = $1 AND p.status = 'ACTIVE'`;

/**
 * Dishes that have really sold (paid, not cancelled) in the rules' window, ranked by units — never a guess.
 * Exported for tests and the admin preview of the rules.
 */
export async function bestsellerIds(db: Db, tenantId: string, rules: BestsellerRules): Promise<string[]> {
  if (!rules.enabled) return [];
  const r = await db.query<{ product_id: string; quantity: number; orders: number }>(
    `SELECT oi.product_id, sum(oi.quantity)::int AS quantity, count(DISTINCT o.id)::int AS orders
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id AND p.status = 'ACTIVE'
     WHERE o.tenant_id = $1 AND o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED') AND o.status <> 'CANCELLED'
       AND o.created_at > now() - make_interval(days => $2)
     GROUP BY oi.product_id`,
    [tenantId, rules.windowDays]);
  return rankBestsellers(r.rows.map((x) => ({ productId: x.product_id, quantity: x.quantity, orders: x.orders })), rules);
}

async function toMenuProducts(db: Db, tenantId: string, rows: ProductRow[], bestsellers: ReadonlySet<string> = new Set()): Promise<MenuProduct[]> {
  const ids = rows.map((r) => r.id);
  const [urls, groups, gallery] = await Promise.all([
    mediaUrlMap(db, rows.map((r) => r.image_asset_id)),
    loadModifierGroups(db, tenantId, ids),
    ids.length
      ? db.query<{ product_id: string; media_id: string }>(
        `SELECT pm.product_id, pm.media_id FROM product_media pm JOIN media_assets m ON m.id = pm.media_id AND m.tenant_id = pm.tenant_id
         WHERE pm.tenant_id = $1 AND pm.product_id = ANY($2::uuid[]) ORDER BY pm.sort_order`, [tenantId, ids])
      : Promise.resolve({ rows: [] as { product_id: string; media_id: string }[] }),
  ]);
  const galleryRefs = await mediaRefMap(db, tenantId, gallery.rows.map((g) => g.media_id));
  return rows.map((r) => {
    const bestseller = bestsellers.has(r.id);
    return {
      id: r.id, slug: r.slug, name: r.name, nameHi: r.name_hi ?? "", description: r.description, descriptionHi: r.description_hi ?? "", longDescription: r.long_description,
      priceMinor: r.base_price_minor, currency: r.currency, imageUrl: r.image_asset_id ? urls.get(r.image_asset_id) ?? null : null,
      categoryId: r.category_id, categorySlug: r.category_slug, categoryName: r.category_name,
      dietary: r.dietary, spiceLevel: r.spice_level, allergens: r.allergens ?? [], tags: r.tags ?? [],
      available: !r.unavailable, unavailableReason: r.unavailable ? (r.unavailable_reason || "Out of stock") : null,
      modifierGroups: (groups.get(r.id) ?? []).map((g) => ({
        id: g.id, name: g.name, description: "", minSelections: g.minSelections, maxSelections: g.maxSelections,
        modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, priceDeltaMinor: Number(m.priceDeltaMinor), available: m.active })),
      })),
      badges: displayBadges(normalizeBadges(r.badges), bestseller),
      bestseller,
      gallery: gallery.rows.filter((g) => g.product_id === r.id).flatMap((g) => galleryRefs.get(g.media_id) ?? []),
      updatedAt: iso(r.updated_at)!,
    };
  });
}

async function bestsellersFor(db: Db, store: StoreContext, access: Access): Promise<string[]> {
  return bestsellerIds(db, store.tenantId, renderedExperience(store, access).menu.bestseller);
}

export async function menu(slug: string, access: Access = PUBLIC): Promise<Menu> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: access.preview });
  const [categories, rows, ranked] = await Promise.all([
    db.query<{ id: string; slug: string; name: string; name_hi: string; description: string; description_hi: string; image_asset_id: string | null }>(
      `SELECT id, slug, name, name_hi, description, description_hi, image_asset_id FROM categories WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY sort_order, name`, [store.tenantId]),
    db.query<ProductRow>(`${PRODUCT_SELECT} ORDER BY c.sort_order, p.sort_order, p.name`, [store.tenantId]),
    bestsellersFor(db, store, access),
  ]);
  const products = await toMenuProducts(db, store.tenantId, rows.rows, new Set(ranked));
  const images = await mediaUrlMap(db, categories.rows.map((c) => c.image_asset_id));
  const result: MenuCategory[] = categories.rows
    .map((c) => ({
      id: c.id, slug: c.slug, name: c.name, nameHi: c.name_hi ?? "", description: c.description, descriptionHi: c.description_hi ?? "",
      imageUrl: c.image_asset_id ? images.get(c.image_asset_id) ?? null : null,
      products: products.filter((p) => p.categoryId === c.id),
    }))
    .filter((c) => c.products.length > 0);
  return { categories: result, bestsellerIds: ranked };
}

export async function product(slug: string, productSlug: string, access: Access = PUBLIC): Promise<MenuProduct | null> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: access.preview });
  const rows = await db.query<ProductRow>(`${PRODUCT_SELECT} AND p.slug = $2`, [store.tenantId, productSlug]);
  if (!rows.rowCount) return null;
  const ranked = await bestsellersFor(db, store, access);
  return (await toMenuProducts(db, store.tenantId, rows.rows, new Set(ranked)))[0] ?? null;
}

/** Database-backed search (docs/SEARCH.md): name (English or Hindi), category and tags; purchasable and exact matches first. */
export async function search(slug: string, q: string, access: Access = PUBLIC): Promise<MenuProduct[]> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: access.preview });
  const term = q.trim().toLowerCase().slice(0, 80);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await db.query<ProductRow>(
    `${PRODUCT_SELECT} AND (lower(p.name) LIKE $2 OR lower(p.name_hi) LIKE $2 OR lower(c.name) LIKE $2 OR lower(p.description) LIKE $2 OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE lower(t) LIKE $2))
     ORDER BY ${UNAVAILABLE_SQL} ASC, (lower(p.name) = $3) DESC, (lower(p.name) LIKE $4) DESC, (lower(p.name) LIKE $2) DESC, c.sort_order, p.sort_order, p.name LIMIT 30`,
    [store.tenantId, like, term, `${term}%`],
  );
  const ranked = await bestsellersFor(db, store, access);
  return toMenuProducts(db, store.tenantId, rows.rows, new Set(ranked));
}

export async function offers(slug: string, access: Access = PUBLIC): Promise<PublicOffer[]> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: access.preview });
  const fmt = moneyFormatter(store.currency, store.locale);
  const r = await db.query<{ code: string; title: string; description: string; type: "FIXED" | "PERCENTAGE"; value: number; minimum_order_minor: number; max_discount_minor: number | null; ends_at: Date; new_customer_only: boolean }>(
    `SELECT code, title, description, type, value, minimum_order_minor, max_discount_minor, ends_at, new_customer_only FROM promotions
     WHERE tenant_id = $1 AND status = 'ACTIVE' AND is_public AND starts_at <= now() AND ends_at > now() AND (usage_cap IS NULL OR usage_count < usage_cap)
     ORDER BY ends_at`,
    [store.tenantId],
  );
  return r.rows.map((p) => ({
    code: p.code, title: p.title || p.code, description: p.description, endsAt: iso(p.ends_at)!, newCustomerOnly: p.new_customer_only,
    minimumOrderMinor: Number(p.minimum_order_minor),
    summary: describePromotion({ type: p.type, value: BigInt(p.value), minimumOrderMinor: BigInt(p.minimum_order_minor), maxDiscountMinor: p.max_discount_minor === null ? null : BigInt(p.max_discount_minor) }, fmt),
  }));
}

export async function sitemapEntries(slug: string) {
  const db = pool();
  const store: StoreContext = await loadStore(db, slug);
  const categories = await db.query<{ slug: string; updated_at: Date }>(
    `SELECT c.slug, greatest(c.updated_at, max(p.updated_at)) AS updated_at FROM categories c JOIN products p ON p.category_id = c.id AND p.status = 'ACTIVE'
     WHERE c.tenant_id = $1 AND c.status = 'ACTIVE' GROUP BY c.id`, [store.tenantId]);
  const products = await db.query<{ slug: string; updated_at: Date }>(
    `SELECT p.slug, p.updated_at FROM products p JOIN categories c ON c.id = p.category_id AND c.status = 'ACTIVE' WHERE p.tenant_id = $1 AND p.status = 'ACTIVE'`, [store.tenantId]);
  return {
    updatedAt: iso(store.updatedAt),
    categories: categories.rows.map((c) => ({ slug: c.slug, updatedAt: iso(c.updated_at) })),
    products: products.rows.map((p) => ({ slug: p.slug, updatedAt: iso(p.updated_at) })),
    policies: POLICY_KEYS.filter((k) => policyBody(store.policies, k)),
  };
}
