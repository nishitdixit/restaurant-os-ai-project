// Public catalog reads. Only published (ACTIVE) categories/products of a published brand are visible;
// availability is computed live so a disabled item can never be served as purchasable.
import { describePromotion } from "@restaurant-os/domain";
import type { Menu, MenuCategory, MenuProduct, PublicOffer, StoreConfig } from "@restaurant-os/types";
import { pool, type Db } from "../../db/pool.ts";
import { iso, moneyFormatter } from "../../lib/format.ts";
import { mediaUrlMap } from "../../integrations/storage.ts";
import { loadModifierGroups, loadZones, UNAVAILABLE_SQL } from "../checkout/pricing.ts";
import { brandLinks, loadStore, outletLocation, outletOpenState, type StoreContext } from "./store.ts";

export async function storeConfig(slug: string, options: { allowDraft?: boolean } = {}): Promise<StoreConfig> {
  const db = pool();
  const store = await loadStore(db, slug, options);
  const urls = await mediaUrlMap(db, [store.logoAssetId]);
  const zones = await loadZones(db, store.tenantId);
  const o = store.outlet;
  const open = outletOpenState(o);
  return {
    slug: store.slug,
    name: store.name,
    tagline: store.metadata.tagline ?? "",
    description: store.metadata.description ?? "",
    cuisines: store.metadata.cuisines ?? [],
    logoUrl: store.logoAssetId ? urls.get(store.logoAssetId) ?? null : null,
    primaryColor: store.metadata.primaryColor ?? "#b42318",
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
      feeMinor: Number(z.feeMinor), minimumOrderMinor: Number(z.minimumOrderMinor), etaMin: z.etaMin, etaMax: z.etaMax,
    })) : [],
    updatedAt: iso(store.updatedAt)!,
    published: store.published,
  };
}

interface ProductRow {
  id: string; slug: string; name: string; description: string; long_description: string; base_price_minor: number; currency: string;
  image_asset_id: string | null; category_id: string; category_slug: string; category_name: string; dietary: MenuProduct["dietary"];
  spice_level: number | null; allergens: string[]; tags: string[]; unavailable: boolean; unavailable_reason: string | null; updated_at: Date;
}

const PRODUCT_SELECT = `SELECT p.id, p.slug, p.name, p.description, p.long_description, p.base_price_minor, trim(p.currency) AS currency, p.image_asset_id,
  c.id AS category_id, c.slug AS category_slug, c.name AS category_name, p.dietary, p.spice_level, p.allergens, p.tags, p.updated_at,
  ${UNAVAILABLE_SQL} AS unavailable,
  (SELECT a.reason FROM availability_overrides a WHERE a.tenant_id = p.tenant_id AND a.product_id = p.id AND a.status = 'INACTIVE'
     AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now()) ORDER BY a.starts_at DESC NULLS LAST LIMIT 1) AS unavailable_reason
  FROM products p JOIN categories c ON c.id = p.category_id AND c.status = 'ACTIVE'
  WHERE p.tenant_id = $1 AND p.status = 'ACTIVE'`;

async function toMenuProducts(db: Db, tenantId: string, rows: ProductRow[]): Promise<MenuProduct[]> {
  const [urls, groups] = await Promise.all([
    mediaUrlMap(db, rows.map((r) => r.image_asset_id)),
    loadModifierGroups(db, tenantId, rows.map((r) => r.id)),
  ]);
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, description: r.description, longDescription: r.long_description,
    priceMinor: r.base_price_minor, currency: r.currency, imageUrl: r.image_asset_id ? urls.get(r.image_asset_id) ?? null : null,
    categoryId: r.category_id, categorySlug: r.category_slug, categoryName: r.category_name,
    dietary: r.dietary, spiceLevel: r.spice_level, allergens: r.allergens ?? [], tags: r.tags ?? [],
    available: !r.unavailable, unavailableReason: r.unavailable ? (r.unavailable_reason || "Out of stock") : null,
    modifierGroups: (groups.get(r.id) ?? []).map((g) => ({
      id: g.id, name: g.name, description: "", minSelections: g.minSelections, maxSelections: g.maxSelections,
      modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, priceDeltaMinor: Number(m.priceDeltaMinor), available: m.active })),
    })),
    updatedAt: iso(r.updated_at)!,
  }));
}

export async function menu(slug: string, preview = false): Promise<Menu> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: preview });
  const categories = await db.query<{ id: string; slug: string; name: string; description: string }>(
    `SELECT id, slug, name, description FROM categories WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY sort_order, name`, [store.tenantId]);
  const rows = await db.query<ProductRow>(`${PRODUCT_SELECT} ORDER BY c.sort_order, p.sort_order, p.name`, [store.tenantId]);
  const products = await toMenuProducts(db, store.tenantId, rows.rows);
  const result: MenuCategory[] = categories.rows
    .map((c) => ({ ...c, products: products.filter((p) => p.categoryId === c.id) }))
    .filter((c) => c.products.length > 0);
  return { categories: result };
}

export async function product(slug: string, productSlug: string, preview = false): Promise<MenuProduct | null> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: preview });
  const rows = await db.query<ProductRow>(`${PRODUCT_SELECT} AND p.slug = $2`, [store.tenantId, productSlug]);
  return (await toMenuProducts(db, store.tenantId, rows.rows))[0] ?? null;
}

/** Database-backed search (docs/SEARCH.md): name, category and tags; purchasable and exact matches first. */
export async function search(slug: string, q: string, preview = false): Promise<MenuProduct[]> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: preview });
  const term = q.trim().toLowerCase().slice(0, 80);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await db.query<ProductRow>(
    `${PRODUCT_SELECT} AND (lower(p.name) LIKE $2 OR lower(c.name) LIKE $2 OR lower(p.description) LIKE $2 OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE lower(t) LIKE $2))
     ORDER BY ${UNAVAILABLE_SQL} ASC, (lower(p.name) = $3) DESC, (lower(p.name) LIKE $4) DESC, (lower(p.name) LIKE $2) DESC, c.sort_order, p.sort_order, p.name LIMIT 30`,
    [store.tenantId, like, term, `${term}%`],
  );
  return toMenuProducts(db, store.tenantId, rows.rows);
}

export async function offers(slug: string, preview = false): Promise<PublicOffer[]> {
  const db = pool();
  const store = await loadStore(db, slug, { allowDraft: preview });
  const fmt = moneyFormatter(store.currency, store.locale);
  const r = await db.query<{ code: string; title: string; description: string; type: "FIXED" | "PERCENTAGE"; value: number; minimum_order_minor: number; max_discount_minor: number | null; ends_at: Date; new_customer_only: boolean }>(
    `SELECT code, title, description, type, value, minimum_order_minor, max_discount_minor, ends_at, new_customer_only FROM promotions
     WHERE tenant_id = $1 AND status = 'ACTIVE' AND is_public AND starts_at <= now() AND ends_at > now() AND (usage_cap IS NULL OR usage_count < usage_cap)
     ORDER BY ends_at`,
    [store.tenantId],
  );
  return r.rows.map((p) => ({
    code: p.code, title: p.title || p.code, description: p.description, endsAt: iso(p.ends_at)!, newCustomerOnly: p.new_customer_only,
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
  };
}
