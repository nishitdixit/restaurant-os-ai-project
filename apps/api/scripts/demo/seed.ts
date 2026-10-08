// Seeds (or resets) the Saffron Street Kitchen demo restaurant: catalog, photos, appearance, team memberships and
// ~60 days of order history, so every admin screen has something real to show. Only rows of the demo tenant
// (catalog.ts DEMO.tenantId) are ever written or deleted; the pilot restaurant and every other tenant are untouched.
//
//   pnpm demo:seed                 reset the demo restaurant (DATABASE_URL + storage settings from the environment)
//   pnpm demo:seed --skip-upload   don't upload the photos again (they are already in the bucket)
//
// Uses the API's own storage driver (STORAGE_DRIVER=s3 + S3_* for Supabase Storage, or local disk), so photo URLs are
// exactly what the API serves. Orders get dates relative to now, so analytics and "today" stay current after a reset.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkExperience, defaultSection, deliveryFeeFor, lt, normalizeExperience, normalizeTheme, presetById, presetExperience,
  type Section, type StoreExperience,
} from "@restaurant-os/domain";
import { env } from "../../src/config/env.ts";
import { pool, withTransaction, type Tx } from "../../src/db/pool.ts";
import { storage } from "../../src/integrations/storage.ts";
import { formatMoney } from "../../src/lib/format.ts";
import {
  CATEGORIES, CUSTOMER_NOTES, CUSTOMERS, DELIVERY_ZONES, DEMO, DEMO_USERS, MODIFIER_GROUPS, PRODUCTS, PROMOTIONS, RIDERS, STREETS,
  groupId, modifierId, productId, promotionId, zoneId, type DemoProduct,
} from "./catalog.ts";

const T = DEMO.tenantId;
const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "assets");
const mediaId = (n: number) => `dc000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MEDIA = { logo: mediaId(1), hero: mediaId(2), story: mediaId(3), product: (n: number) => mediaId(100 + n) };
const HOURS = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["00:00", "23:59"]]]));
const MINUTE = 60_000;

// Deterministic randomness (same history shape on every reset).
let seed = 20261008;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number) => rand() < p;
function weighted<T>(items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((s, x) => s + weight(x), 0);
  let r = rand() * total;
  for (const x of items) if ((r -= weight(x)) <= 0) return x;
  return items[items.length - 1]!;
}

/** INSERT many rows in one round trip (the Supabase pooler is far away; one query per row would take minutes). */
async function bulk(tx: Tx, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  for (let i = 0; i < rows.length; i += 1500) {
    const chunk = rows.slice(i, i + 1500);
    await tx.query(`INSERT INTO ${table} (${cols.join(", ")}) SELECT ${cols.join(", ")} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`, [JSON.stringify(chunk)]);
  }
}

// Photos ------------------------------------------------------------------------------------------------------

interface Photo { id: string; file: string; kind: string; alt: string }
const PHOTOS: Photo[] = [
  { id: MEDIA.logo, file: "logo.png", kind: "logo", alt: "Saffron Street Kitchen logo" },
  { id: MEDIA.hero, file: "hero.png", kind: "hero", alt: "Veg biryani, paneer butter masala, naan, dal makhani and mango lassi on the table" },
  { id: MEDIA.story, file: "story.png", kind: "story", alt: "A thali, masala dosa, pav bhaji, gulab jamun and paneer tikka" },
  ...PRODUCTS.map((p) => ({ id: MEDIA.product(p.n), file: `${p.slug}.png`, kind: "product", alt: p.name.replace(/ \(.*\)$/, "") })),
];
const storageKey = (p: Photo) => `${T}/demo/${p.file}`;

async function uploadPhotos(skip: boolean) {
  if (skip) return;
  for (const p of PHOTOS) await storage().put(storageKey(p), readFileSync(join(assetsDir, p.file)), "image/png");
  console.log(`photos     ${PHOTOS.length} uploaded (${env().STORAGE_DRIVER}) -> ${storage().publicUrl(storageKey(PHOTOS[0]!)).replace(/logo\.png$/, "")}`);
}

// Restaurant, team and catalog -------------------------------------------------------------------------------

async function resetTenantData(tx: Tx) {
  // Order history and everything hanging off it (children first).
  const orderScoped = [
    `DELETE FROM notification_attempts WHERE notification_id IN (SELECT id FROM notifications WHERE tenant_id = $1)`,
    `DELETE FROM notifications WHERE tenant_id = $1`,
    `DELETE FROM delivery_status_events WHERE tenant_id = $1`,
    `DELETE FROM delivery_orders WHERE tenant_id = $1`,
    `DELETE FROM payment_refunds WHERE tenant_id = $1`,
    `DELETE FROM payments WHERE tenant_id = $1`,
    `DELETE FROM payment_webhook_events WHERE tenant_id = $1`,
    `DELETE FROM order_notes WHERE tenant_id = $1`,
    `DELETE FROM order_status_events WHERE tenant_id = $1`,
    `DELETE FROM kitchen_tickets WHERE tenant_id = $1`,
    `DELETE FROM reorder_events WHERE tenant_id = $1`,
    `DELETE FROM promotion_redemptions WHERE tenant_id = $1`,
    `DELETE FROM analytics_events WHERE tenant_id = $1`,
    `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)`,
    `DELETE FROM orders WHERE tenant_id = $1`,
    `DELETE FROM domain_events WHERE tenant_id = $1`,
    `DELETE FROM audit_events WHERE tenant_id = $1`,
    `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE tenant_id = $1)`,
    `DELETE FROM carts WHERE tenant_id = $1`,
    `DELETE FROM messaging_campaign_recipients WHERE tenant_id = $1`,
    `DELETE FROM customer_segment_memberships WHERE tenant_id = $1`,
    `DELETE FROM referrals WHERE tenant_id = $1`,
    `DELETE FROM customer_addresses WHERE tenant_id = $1`,
    `DELETE FROM customers WHERE tenant_id = $1`,
    `DELETE FROM tenant_order_counters WHERE tenant_id = $1`,
  ];
  for (const sql of orderScoped) await tx.query(sql, [T]);
  // Catalog rows visitors added or changed during a demo: removed, then the seeded rows are written again.
  await tx.query(`DELETE FROM product_media WHERE tenant_id = $1`, [T]);
  await tx.query(`DELETE FROM product_modifier_groups WHERE product_id IN (SELECT id FROM products WHERE tenant_id = $1)`, [T]);
  await tx.query(`DELETE FROM availability_overrides WHERE tenant_id = $1`, [T]);
  await tx.query(`DELETE FROM recipe_components WHERE recipe_id IN (SELECT id FROM recipes WHERE tenant_id = $1)`, [T]);
  await tx.query(`DELETE FROM recipes WHERE tenant_id = $1`, [T]);
  await tx.query(`DELETE FROM products WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))`, [T, PRODUCTS.map((p) => productId(p.n))]);
  await tx.query(`DELETE FROM modifiers WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))`, [T, MODIFIER_GROUPS.flatMap((g) => g.options.map((_, i) => modifierId(g.n, i + 1)))]);
  await tx.query(`DELETE FROM modifier_groups WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))`, [T, MODIFIER_GROUPS.map((g) => groupId(g.n))]);
  await tx.query(`UPDATE categories SET image_asset_id = NULL WHERE tenant_id = $1`, [T]);
  await tx.query(`DELETE FROM categories WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))`, [T, CATEGORIES.map((c) => c.id)]);
  await tx.query(`DELETE FROM delivery_zones WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))`, [T, DELIVERY_ZONES.map((z) => zoneId(z.n))]);
  await tx.query(`DELETE FROM promotions WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[]))`, [T, PROMOTIONS.map((p) => promotionId(p.n))]);
  await tx.query(`DELETE FROM brand_theme_versions WHERE tenant_id = $1`, [T]);
}

/** Photos visitors uploaded during a demo (not part of the seed). Their files are removed after the commit. */
async function extraMediaKeys(tx: Tx): Promise<string[]> {
  await tx.query(`UPDATE brands SET logo_asset_id = NULL, experience = NULL, experience_draft = NULL WHERE tenant_id = $1`, [T]);
  await tx.query(`UPDATE products SET image_asset_id = NULL WHERE tenant_id = $1`, [T]);
  const r = await tx.query<{ storage_key: string }>(`DELETE FROM media_assets WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[])) RETURNING storage_key`, [T, PHOTOS.map((p) => p.id)]);
  return r.rows.map((x) => x.storage_key);
}

async function upsertRestaurant(tx: Tx) {
  const slugTaken = await tx.query(`SELECT 1 FROM brands WHERE slug = $1 AND status = 'ACTIVE' AND tenant_id <> $2`, [DEMO.slug, T]);
  if (slugTaken.rowCount) throw new Error(`Another restaurant already uses the slug "${DEMO.slug}".`);
  await tx.query(
    `INSERT INTO tenants (id, name, status, default_currency, legal_name, locale, primary_contact, metadata) VALUES ($1, $2, 'ACTIVE', 'INR', $3, 'en-IN', $4, '{}')
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, status = 'ACTIVE', default_currency = 'INR', legal_name = excluded.legal_name, locale = 'en-IN',
       primary_contact = excluded.primary_contact, metadata = '{}', updated_at = now()`,
    [T, DEMO.name, DEMO.legalName, JSON.stringify(DEMO.contact)]);
  const metadata = {
    tagline: DEMO.tagline, description: DEMO.description, cuisines: DEMO.cuisines, primaryColor: "#8e1b1b",
    links: { whatsapp: DEMO.whatsapp, swiggy: "", zomato: "", instagram: "", website: "" },
  };
  const policies = {
    refund: { body: lt("This is a demonstration restaurant. No real payments are taken, so there is nothing to refund. In a live store, this page explains when and how customers get their money back.") },
    delivery: { body: lt("We deliver across Koramangala, HSR Layout, BTM, Indiranagar and Domlur. Delivery fees and minimum orders depend on your area and are shown at checkout before you pay.") },
  };
  await tx.query(
    `INSERT INTO brands (id, tenant_id, name, slug, metadata, status, published_at, policies) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', now(), $6)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, slug = excluded.slug, metadata = excluded.metadata, status = 'ACTIVE',
       published_at = coalesce(brands.published_at, now()), policies = excluded.policies, updated_at = now()`,
    [DEMO.brandId, T, DEMO.name, DEMO.slug, JSON.stringify(metadata), JSON.stringify(policies)]);
  await tx.query(
    `INSERT INTO outlets (id, tenant_id, brand_id, name, phone, timezone, status, address, hours, latitude, longitude, accepting_orders, delivery_enabled, pickup_enabled, default_prep_minutes)
     VALUES ($1, $2, $3, $4, $5, 'Asia/Kolkata', 'ACTIVE', $6, $7, $8, $9, true, true, true, 20)
     ON CONFLICT (id) DO UPDATE SET brand_id = excluded.brand_id, name = excluded.name, phone = excluded.phone, timezone = excluded.timezone, status = 'ACTIVE',
       address = excluded.address, hours = excluded.hours, latitude = excluded.latitude, longitude = excluded.longitude, accepting_orders = true,
       delivery_enabled = true, pickup_enabled = true, default_prep_minutes = 20, updated_at = now()`,
    [DEMO.outletId, T, DEMO.brandId, `${DEMO.name} — Koramangala`, DEMO.phone, JSON.stringify(DEMO.address), JSON.stringify(HOURS), DEMO.latitude, DEMO.longitude]);
}

/** Application users + memberships. Clerk accounts are linked by id when known, otherwise by verified email on first sign-in. */
async function upsertTeam(tx: Tx): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const existing = await tx.query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower($1)`, [u.email]);
    const userId = existing.rows[0]?.id ?? u.id;
    await tx.query(
      `INSERT INTO users (id, email, status) VALUES ($1, $2, 'ACTIVE') ON CONFLICT (id) DO UPDATE SET email = excluded.email, status = 'ACTIVE', updated_at = now()`,
      [userId, u.email]);
    ids[u.role] = userId;
  }
  await tx.query(`DELETE FROM tenant_memberships WHERE tenant_id = $1 AND NOT (user_id = ANY($2::uuid[]))`, [T, Object.values(ids)]);
  for (const u of DEMO_USERS) {
    await tx.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status) SELECT $1, $2, r.id, 'ACTIVE' FROM roles r WHERE r.name = $3
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_id = excluded.role_id, status = 'ACTIVE', updated_at = now()`,
      [T, ids[u.role], u.role]);
  }
  return ids;
}

async function upsertCatalog(tx: Tx, owner: string, at: Date) {
  for (const p of PHOTOS) {
    const size = readFileSync(join(assetsDir, p.file)).length;
    await tx.query(
      `INSERT INTO media_assets (id, tenant_id, storage_key, content_type, byte_size, alt_text, kind, created_by, created_at) VALUES ($1, $2, $3, 'image/png', $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET storage_key = excluded.storage_key, byte_size = excluded.byte_size, alt_text = excluded.alt_text, kind = excluded.kind, updated_at = now()`,
      [p.id, T, storageKey(p), size, p.alt, p.kind, owner, at]);
  }
  await tx.query(`UPDATE brands SET logo_asset_id = $2 WHERE id = $1`, [DEMO.brandId, MEDIA.logo]);

  const categoryImage: Record<string, number> = { starters: 1, "chaat-street-food": 8, "biryani-rice": 10, curries: 14, breads: 22, "south-indian": 26, "thalis-combos": 30, desserts: 33, beverages: 36 };
  for (const [i, c] of CATEGORIES.entries()) {
    await tx.query(
      `INSERT INTO categories (id, tenant_id, outlet_id, name, slug, description, sort_order, status, name_hi, image_asset_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET outlet_id = excluded.outlet_id, name = excluded.name, slug = excluded.slug, description = excluded.description, sort_order = excluded.sort_order,
         status = 'ACTIVE', name_hi = excluded.name_hi, image_asset_id = excluded.image_asset_id, updated_at = now()`,
      [c.id, T, DEMO.outletId, c.name, c.slug, c.description, (i + 1) * 10, c.nameHi, MEDIA.product(categoryImage[c.slug]!), at]);
  }

  const catId = (slug: string) => CATEGORIES.find((c) => c.slug === slug)!.id;
  const sort: Record<string, number> = {};
  for (const p of PRODUCTS) {
    sort[p.category] = (sort[p.category] ?? 0) + 10;
    await tx.query(
      `INSERT INTO products (id, tenant_id, category_id, name, slug, description, long_description, base_price_minor, currency, status, sort_order, metadata,
         dietary, spice_level, allergens, tags, badges, name_hi, image_asset_id, published_at, archived_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'INR', $9, $10, '{}', $11, $12, $13, $14, $15, $16, $17, CASE WHEN $18 THEN NULL ELSE $19::timestamptz END, NULL, $19)
       ON CONFLICT (id) DO UPDATE SET category_id = excluded.category_id, name = excluded.name, slug = excluded.slug, description = excluded.description,
         long_description = excluded.long_description, base_price_minor = excluded.base_price_minor, status = excluded.status, sort_order = excluded.sort_order,
         dietary = excluded.dietary, spice_level = excluded.spice_level, allergens = excluded.allergens, tags = excluded.tags, badges = excluded.badges,
         name_hi = excluded.name_hi, image_asset_id = excluded.image_asset_id, published_at = excluded.published_at, archived_at = NULL, updated_at = now()`,
      [productId(p.n), T, catId(p.category), p.name, p.slug, p.description, p.longDescription ?? "", p.price, p.draft ? "DRAFT" : "ACTIVE", sort[p.category],
        p.dietary, p.spice, p.allergens, p.tags, JSON.stringify(p.badges ?? []), p.nameHi ?? "", MEDIA.product(p.n), !!p.draft, at]);
  }

  for (const g of MODIFIER_GROUPS) {
    await tx.query(
      `INSERT INTO modifier_groups (id, tenant_id, name, description, min_selections, max_selections, status) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description, min_selections = excluded.min_selections, max_selections = excluded.max_selections, status = 'ACTIVE', updated_at = now()`,
      [groupId(g.n), T, g.name, g.description, g.min, g.max]);
    for (const [i, o] of g.options.entries()) {
      await tx.query(
        `INSERT INTO modifiers (id, tenant_id, modifier_group_id, name, price_delta_minor, status, sort_order) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
         ON CONFLICT (id) DO UPDATE SET modifier_group_id = excluded.modifier_group_id, name = excluded.name, price_delta_minor = excluded.price_delta_minor, status = 'ACTIVE', sort_order = excluded.sort_order, updated_at = now()`,
        [modifierId(g.n, i + 1), T, groupId(g.n), o.name, o.delta, i]);
    }
  }
  for (const p of PRODUCTS) {
    for (const [i, key] of (p.groups ?? []).entries()) {
      const g = MODIFIER_GROUPS.find((x) => x.key === key)!;
      await tx.query(`INSERT INTO product_modifier_groups (product_id, modifier_group_id, sort_order) VALUES ($1, $2, $3)`, [productId(p.n), groupId(g.n), i]);
    }
    if (p.soldOut) {
      await tx.query(`INSERT INTO availability_overrides (id, tenant_id, product_id, status, starts_at, ends_at, reason) VALUES ($1, $2, $3, 'INACTIVE', NULL, NULL, $4)`,
        [`db000000-0000-4000-8000-${String(p.n).padStart(12, "0")}`, T, productId(p.n), p.soldOut]);
    }
  }

  for (const [i, z] of DELIVERY_ZONES.entries()) {
    await tx.query(
      `INSERT INTO delivery_zones (id, tenant_id, name, rule_type, rule_config, fee_minor, eta_min, eta_max, minimum_order_minor, free_delivery_minimum_minor, status, sort_order, created_at)
       VALUES ($1, $2, $3, 'POSTAL_CODE', $4, $5, $6, $7, $8, $9, 'ACTIVE', $10, $11)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, rule_type = excluded.rule_type, rule_config = excluded.rule_config, fee_minor = excluded.fee_minor, eta_min = excluded.eta_min,
         eta_max = excluded.eta_max, minimum_order_minor = excluded.minimum_order_minor, free_delivery_minimum_minor = excluded.free_delivery_minimum_minor, status = 'ACTIVE',
         sort_order = excluded.sort_order, updated_at = now()`,
      [zoneId(z.n), T, z.name, JSON.stringify({ postalCodes: z.postalCodes }), z.fee, z.etaMin, z.etaMax, z.minimum, z.freeOver, i, at]);
  }

  for (const p of PROMOTIONS) {
    await tx.query(
      `INSERT INTO promotions (id, tenant_id, code, title, description, type, value, status, starts_at, ends_at, minimum_order_minor, max_discount_minor, new_customer_only,
         once_per_customer, usage_cap, usage_count, is_public, staff_only, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET code = excluded.code, title = excluded.title, description = excluded.description, type = excluded.type, value = excluded.value,
         status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, minimum_order_minor = excluded.minimum_order_minor,
         max_discount_minor = excluded.max_discount_minor, new_customer_only = excluded.new_customer_only, once_per_customer = excluded.once_per_customer,
         usage_cap = excluded.usage_cap, usage_count = 0, is_public = excluded.is_public, staff_only = excluded.staff_only, updated_at = now()`,
      [promotionId(p.n), T, p.code, p.title, p.description, p.type, p.value, p.status, p.starts, p.ends, p.minimum, p.maxDiscount, p.newCustomerOnly,
        p.oncePerCustomer, p.cap, p.isPublic, p.staffOnly, at]);
  }
}

// Appearance --------------------------------------------------------------------------------------------------

function demoExperience(): StoreExperience {
  const base = presetExperience("saffron-house");
  const sections: Section[] = [];
  for (const s of base.sections) {
    if (s.type === "hero") {
      sections.push({
        ...s, imageId: MEDIA.hero, eyebrow: lt("Pure veg · Koramangala"), title: lt("Comfort food, cooked fresh every day"),
        subtitle: lt("Dum biryani, slow-cooked dals, tandoor breads and crisp dosas — delivered hot or ready for pickup."),
        secondaryCta: { target: "whatsapp", label: lt(), categorySlug: "" },
      });
    } else if (s.type === "highlights") {
      sections.push({ ...s, items: [...s.items.slice(0, 3), { kind: "custom", icon: "leaf", value: lt("100%"), label: lt("Vegetarian kitchen") }] });
      sections.push({ ...defaultSection("offers", "offers-1"), variant: "strip" });
    } else if (s.type === "story") {
      sections.push({
        ...s, imageId: MEDIA.story, title: lt("Made the way it's made at home"),
        body: lt("Saffron Street Kitchen is a fictional pure-vegetarian cloud kitchen created for this demo. Every dish, price, customer and order you see here is sample data, so you can explore the dashboard freely.\n\nTry changing anything — the menu, the colours, this text — and see it on the website instantly."),
        cta: { target: "menu", label: lt("See the full menu"), categorySlug: "" },
      });
      const slugs = ["veg-dum-biryani", "paneer-tikka", "masala-dosa", "pav-bhaji", "saffron-street-thali", "mango-lassi"];
      sections.push({
        ...defaultSection("gallery", "gallery-1"), variant: "mosaic", title: lt("From our kitchen"),
        images: slugs.map((slug) => { const p = PRODUCTS.find((x) => x.slug === slug)!; return { imageId: MEDIA.product(p.n), caption: lt(p.name) }; }),
      });
    } else if (s.type === "cta") {
      sections.push({ ...s, imageId: null, subtitle: lt("Order direct on our website — no app, no extra charges."), secondaryCta: { target: "whatsapp", label: lt(), categorySlug: "" } });
    } else sections.push(s);
  }
  return normalizeExperience({
    ...base,
    site: { ...base.site, whatsappOrdering: true },
    menu: { ...base.menu, bestseller: { enabled: true, windowDays: 30, minOrders: 5, limit: 6 } },
    seo: { title: "Saffron Street Kitchen — Pure-veg food delivery in Koramangala", description: DEMO.tagline, shareImageId: MEDIA.hero },
    sections,
  });
}

async function publishAppearance(tx: Tx, owner: string, at: Date) {
  const theme = normalizeTheme(presetById("saffron-house")!.theme);
  const experience = demoExperience();
  const alt = new Map(PHOTOS.map((p) => [p.id, p.alt]));
  const { errors } = checkExperience(experience, { altText: (id) => alt.get(id) });
  if (errors.length) throw new Error(`Demo homepage is not publishable: ${errors.map((e) => e.message).join("; ")}`);
  await tx.query(
    `UPDATE brands SET theme = $2, theme_draft = NULL, theme_draft_updated_at = NULL, theme_published_at = $4, experience = $3, experience_draft = NULL,
       metadata = metadata || jsonb_build_object('primaryColor', $5::text), updated_at = now() WHERE id = $1`,
    [DEMO.brandId, JSON.stringify(theme), JSON.stringify(experience), at, theme.colors.primary]);
  await tx.query(`INSERT INTO brand_theme_versions (tenant_id, brand_id, theme, experience, published_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [T, DEMO.brandId, JSON.stringify(theme), JSON.stringify(experience), owner, at]);
}

// Order history -----------------------------------------------------------------------------------------------

type Status = "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
type Channel = "DIRECT_WEB" | "WHATSAPP" | "PHONE" | "WALK_IN";
interface Plan {
  at: Date;
  channel?: Channel;
  fulfillment?: "DELIVERY" | "PICKUP";
  /** Final state. Website orders in NEW are paid unless `unpaid`. */
  status?: Status;
  unpaid?: boolean;
  payLater?: boolean;
  cancelReason?: string;
  note?: string;
}

interface Customer { joined: Date; id: string; name: string; phone: string; email: string | null; area: number; consent: boolean; note: string; weight: number; orders: number; websiteOrders: number; first: Date | null; last: Date | null; addresses: Map<string, { line1: string; line2: string; postal: string; at: Date }> }

const SELLABLE = PRODUCTS.filter((p) => !p.draft && p.weight > 0);

function pickLines(at: Date, today: boolean) {
  const lunch = (at.getUTCHours() + 5.5) % 24 < 16;
  const count = weighted([1, 2, 3, 4], (n) => [3, 4, 3, 1][n - 1]!);
  const chosen = new Map<string, { p: DemoProduct; qty: number }>();
  while (chosen.size < count) {
    const p = weighted(today ? SELLABLE.filter((x) => !x.soldOut) : SELLABLE, (x) => x.weight * (lunch && x.category === "thalis-combos" ? 2 : 1) * (!lunch && x.category === "south-indian" ? 0.6 : 1));
    if (chosen.has(p.slug)) continue;
    const qty = p.category === "breads" ? between(2, 4) : chance(0.2) ? 2 : 1;
    chosen.set(p.slug, { p, qty });
  }
  // A curry usually comes with bread.
  if ([...chosen.values()].some((l) => l.p.category === "curries") && ![...chosen.values()].some((l) => l.p.category === "breads" || l.p.category === "biryani-rice") && chance(0.8)) {
    const bread = weighted(SELLABLE.filter((p) => p.category === "breads"), (x) => x.weight);
    chosen.set(bread.slug, { p: bread, qty: between(2, 4) });
  }
  return [...chosen.values()];
}

function lineFor(p: DemoProduct, qty: number) {
  const modifiers: { groupId: string; groupName: string; modifierId: string; name: string; priceDeltaMinor: number }[] = [];
  for (const key of p.groups ?? []) {
    const g = MODIFIER_GROUPS.find((x) => x.key === key)!;
    const picks = g.min > 0 ? [chance(0.78) ? 0 : between(1, g.options.length - 1)] : chance(0.3) ? [between(0, g.options.length - 1)] : [];
    for (const i of picks) modifiers.push({ groupId: groupId(g.n), groupName: g.name, modifierId: modifierId(g.n, i + 1), name: g.options[i]!.name, priceDeltaMinor: g.options[i]!.delta });
  }
  const unit = p.price + modifiers.reduce((s, m) => s + m.priceDeltaMinor, 0);
  return { productId: productId(p.n), name: p.name, base: p.price, unit, qty, total: unit * qty, modifiers };
}

interface MessageRow { order_id: string; audience: "CUSTOMER" | "MERCHANT"; channel: string; recipient: string; template: string; subject: string | null; body: string; at: Date; failed?: boolean }

async function generateHistory(tx: Tx, team: Record<string, string>, now: Date) {
  const storefrontUrl = env().STOREFRONT_URL.replace(/\/$/, "");
  // Ten regulars from the start; the rest discover the restaurant over the following weeks (new vs repeat customers).
  const customers: Customer[] = CUSTOMERS.map((c, i) => ({
    joined: new Date(now.getTime() - (i < 10 ? 61 : 54 - (i - 10) * 2.8) * 24 * 60 * MINUTE),
    id: randomUUID(), name: c.name, phone: `+91900000${String(1000 + i).padStart(4, "0")}`, area: c.area, consent: c.consent, note: "note" in c ? c.note : "",
    email: c.email ? `${c.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com` : null, weight: c.weight, orders: 0, websiteOrders: 0, first: null, last: null, addresses: new Map(),
  }));
  const orders: Record<string, unknown>[] = [], items: Record<string, unknown>[] = [], events: Record<string, unknown>[] = [], payments: Record<string, unknown>[] = [];
  const refunds: Record<string, unknown>[] = [], deliveries: Record<string, unknown>[] = [], deliveryEvents: Record<string, unknown>[] = [], redemptions: Record<string, unknown>[] = [];
  const analytics: Record<string, unknown>[] = [], audits: Record<string, unknown>[] = [], notes: Record<string, unknown>[] = [];
  const messages: MessageRow[] = [];
  const usage: Record<string, number> = {};
  let number = 1000;

  const outletSnapshot = { name: `${DEMO.name} — Koramangala`, phone: DEMO.phone, address: DEMO.address };
  const recentAudit = (at: Date) => now.getTime() - at.getTime() < 3 * 24 * 60 * MINUTE;

  function place(plan: Plan) {
    const channel: Channel = plan.channel ?? weighted(["DIRECT_WEB", "WHATSAPP", "PHONE", "WALK_IN"] as const, (c) => ({ DIRECT_WEB: 70, WHATSAPP: 15, PHONE: 10, WALK_IN: 5 })[c]);
    const staff = channel !== "DIRECT_WEB";
    const fulfillment = plan.fulfillment ?? (channel === "WALK_IN" ? "PICKUP" : chance(0.7) ? "DELIVERY" : "PICKUP");
    const known = customers.filter((c) => c.joined <= plan.at);
    const customer = channel === "WALK_IN" && chance(0.5) ? null : weighted(known, (c) => c.weight * (c.orders === 0 && c.joined.getTime() > plan.at.getTime() - 4 * 24 * 60 * MINUTE ? 6 : 1));
    const zoneIndex = customer?.area ?? 0;
    const zone = DELIVERY_ZONES[zoneIndex]!;
    const street = customer ? STREETS[zoneIndex]![customers.indexOf(customer) % STREETS[zoneIndex]!.length]! : null;
    const today = now.getTime() - plan.at.getTime() < 20 * 60 * MINUTE;
    const lines = pickLines(plan.at, today).map((l) => lineFor(l.p, l.qty));
    let subtotal = lines.reduce((s, l) => s + l.total, 0);
    if (fulfillment === "DELIVERY") {
      while (subtotal < zone.minimum) {
        const extra = lineFor(weighted(SELLABLE.filter((p) => (p.category === "desserts" || p.category === "beverages" || p.category === "breads") && !(today && p.soldOut)), (x) => x.weight), 1);
        const same = lines.find((l) => l.productId === extra.productId);
        if (same) { same.qty += 1; same.total += same.unit; subtotal += same.unit; } else { lines.push(extra); subtotal += extra.unit; }
      }
    }

    // Offer, applied the way checkout would.
    const live = (code: string) => {
      const p = PROMOTIONS.find((x) => x.code === code)!;
      return p.status === "ACTIVE" && new Date(p.starts) <= plan.at && new Date(p.ends) > plan.at && subtotal >= p.minimum ? p : null;
    };
    let promo: (typeof PROMOTIONS)[number] | null = null;
    if (!staff && customer && customer.orders === 0 && chance(0.6)) promo = live("WELCOME50");
    if (!promo && !staff && chance(0.5)) promo = live("FEAST100");
    if (!promo && !staff && chance(0.25)) promo = live("SAFFRON20");
    if (!promo && !staff && chance(0.3)) promo = live("MONSOON15");
    if (!promo && staff && customer && customer.orders >= 3 && chance(0.35)) promo = live("REGULAR10");
    let discount = 0;
    if (promo) {
      discount = promo.type === "PERCENTAGE" ? Math.floor((subtotal * promo.value) / 100) : promo.value;
      if (promo.maxDiscount !== null) discount = Math.min(discount, promo.maxDiscount);
      discount = Math.min(discount, subtotal);
    }
    const fee = fulfillment === "DELIVERY"
      ? Number(deliveryFeeFor({ feeMinor: BigInt(zone.fee), freeDeliveryMinimumMinor: zone.freeOver === null ? null : BigInt(zone.freeOver) }, BigInt(subtotal)))
      : 0;
    const total = subtotal - discount + fee;

    const id = randomUUID();
    const orderNumber = ++number;
    const token = randomBytes(18).toString("base64url");
    const status: Status = plan.status ?? "DELIVERED";
    const cancelled = status === "CANCELLED";
    const unpaid = !!plan.unpaid || (cancelled && plan.cancelReason === "PAYMENT_NOT_COMPLETED");
    const payLater = !!plan.payLater;
    const method = staff ? (payLater ? "PAY_LATER" : weighted(["CASH", "UPI", "CARD"] as const, (m) => ({ CASH: 35, UPI: 55, CARD: 10 })[m])) : null;
    const enteredBy = staff ? (chance(0.6) ? team.STAFF! : team.MANAGER!) : null;
    const notify = !!customer;
    const etaMin = fulfillment === "DELIVERY" ? zone.etaMin : 20, etaMax = fulfillment === "DELIVERY" ? zone.etaMax : 30;

    // Timeline.
    let t = plan.at.getTime();
    const stamp = (min: number, max: number) => new Date((t += between(min, max) * MINUTE));
    const paidAt = staff ? (payLater ? null : plan.at) : unpaid ? null : new Date(plan.at.getTime() + between(1, 3) * MINUTE);
    if (paidAt) t = paidAt.getTime();
    const order = ["NEW", "ACCEPTED", "PREPARING", "READY", "DISPATCHED", "DELIVERED"] as const;
    const stopAt = cancelled ? (unpaid ? 0 : chance(0.6) ? 0 : 1) : order.indexOf(status as (typeof order)[number]);
    const steps: { to: Status; at: Date; actor: string | null; note?: string; reason?: string }[] = [];
    steps.push({ to: "NEW", at: plan.at, actor: enteredBy, note: staff ? `Entered by staff (${({ WHATSAPP: "WhatsApp", PHONE: "Phone", WALK_IN: "Walk-in" } as Record<string, string>)[channel]})` : "Order placed" });
    if (staff) steps.push({ to: "ACCEPTED", at: plan.at, actor: enteredBy });
    for (let i = staff ? 2 : 1; i <= stopAt; i++) {
      const to = order[i]!;
      if (to === "DISPATCHED" && fulfillment === "PICKUP") continue;
      const at = to === "ACCEPTED" ? stamp(1, 4) : to === "PREPARING" ? stamp(1, 3) : to === "READY" ? stamp(12, 22) : to === "DISPATCHED" ? stamp(3, 8) : stamp(fulfillment === "DELIVERY" ? 14 : 4, fulfillment === "DELIVERY" ? 28 : 15);
      const actor = to === "ACCEPTED" || to === "DISPATCHED" ? team.MANAGER! : to === "PREPARING" || to === "READY" ? team.KITCHEN! : fulfillment === "PICKUP" ? team.STAFF! : team.MANAGER!;
      steps.push({ to, at, actor });
    }
    let cancelledAt: Date | null = null;
    const reason = plan.cancelReason ?? (unpaid ? "PAYMENT_NOT_COMPLETED" : weighted(["CUSTOMER_REQUEST", "ITEM_UNAVAILABLE", "KITCHEN_CLOSED", "ADDRESS_ISSUE"], (r) => ({ CUSTOMER_REQUEST: 5, ITEM_UNAVAILABLE: 3, KITCHEN_CLOSED: 2, ADDRESS_ISSUE: 1 })[r]!));
    if (cancelled) {
      cancelledAt = unpaid ? new Date(plan.at.getTime() + 31 * MINUTE) : stamp(2, 6);
      steps.push({ to: "CANCELLED", at: cancelledAt, actor: unpaid ? null : team.MANAGER!, reason });
    }
    const at = (s: Status) => steps.find((x) => x.to === s)?.at ?? null;
    const last = steps[steps.length - 1]!.at;
    const refunded = cancelled && !unpaid && !!paidAt;
    const paymentStatus = refunded ? "REFUNDED" : paidAt ? "CAPTURED" : cancelled ? "EXPIRED" : "PENDING";

    if (customer) {
      customer.orders += 1;
      if (!staff) customer.websiteOrders += 1;
      customer.first ??= plan.at;
      customer.last = plan.at;
      if (fulfillment === "DELIVERY" && street) customer.addresses.set(street[0], { line1: street[0], line2: street[1], postal: street[2], at: plan.at });
    }
    const address = fulfillment === "DELIVERY" && street ? { line1: street[0], line2: street[1], landmark: "", city: "Bengaluru", region: "Karnataka", postalCode: street[2], location: null } : null;
    const snapshot = { name: customer?.name ?? (chance(0.5) ? "Walk-in customer" : weighted(["Ravi", "Asha", "Imran", "Kiran"], () => 1)), phone: customer?.phone ?? null, email: customer?.email ?? null };
    const customerNote = plan.note ?? (chance(0.12) ? CUSTOMER_NOTES[between(0, CUSTOMER_NOTES.length - 1)]! : null);

    orders.push({
      id, tenant_id: T, outlet_id: DEMO.outletId, customer_id: customer?.id ?? null, channel, status, payment_status: paymentStatus, fulfillment_type: fulfillment, currency: "INR",
      subtotal_minor: subtotal, discount_minor: discount, fee_minor: fee, tax_minor: 0, total_minor: total, customer_snapshot: snapshot, address_snapshot: address,
      idempotency_key: staff ? `staff:seed-${id}` : `seed-${id}`, order_number: orderNumber, public_token: token, customer_note: customerNote,
      promotion_id: promo ? promotionId(promo.n) : null, promotion_code: promo?.code ?? null, delivery_zone_id: fulfillment === "DELIVERY" ? zoneId(zone.n) : null,
      eta_min: etaMin, eta_max: etaMax, paid_at: paidAt, accepted_at: at("ACCEPTED"), ready_at: at("READY"), dispatched_at: at("DISPATCHED"),
      completed_at: at("DELIVERED"), cancelled_at: cancelledAt, cancel_reason_code: cancelled ? reason : null, cancel_note: null, cancelled_by: cancelled && !unpaid ? team.MANAGER : null,
      created_by_user_id: enteredBy, payment_method: method, notify_customer: notify, created_at: plan.at, updated_at: last,
    });
    lines.forEach((l, position) => items.push({
      id: randomUUID(), order_id: id, product_id: l.productId, product_name_snapshot: l.name, base_price_minor: l.base, unit_price_minor: l.unit, quantity: l.qty,
      line_total_minor: l.unit * l.qty, modifiers_snapshot: l.modifiers, position,
    }));
    let prev: Status | null = null;
    for (const s of steps) {
      events.push({ id: randomUUID(), tenant_id: T, order_id: id, from_status: prev, to_status: s.to, actor_user_id: s.actor, note: s.note ?? (s.to === "DISPATCHED" ? `Rider: ${RIDERS[orderNumber % RIDERS.length]!.name}` : null), reason_code: s.reason ?? null, created_at: s.at });
      if (prev && s.actor && recentAudit(s.at)) audits.push({ id: randomUUID(), tenant_id: T, actor_user_id: s.actor, event_name: "OrderStatusChanged", entity_type: "Order", entity_id: id, metadata: { from: prev, to: s.to, orderNumber, ...(s.reason ? { reasonCode: s.reason } : {}) }, created_at: s.at });
      prev = s.to;
    }
    if (staff && recentAudit(plan.at)) audits.push({ id: randomUUID(), tenant_id: T, actor_user_id: enteredBy, event_name: "OrderEnteredByStaff", entity_type: "Order", entity_id: id, metadata: { channel, payment: method, promotionCode: promo?.code ?? null, totalMinor: total }, created_at: plan.at });

    // Payment.
    const paymentId = randomUUID();
    if (staff) {
      payments.push({ id: paymentId, tenant_id: T, order_id: id, provider: "manual", provider_payment_id: null, provider_order_id: null, status: paidAt ? "CAPTURED" : cancelled ? "CANCELLED" : "PENDING", amount_minor: total, currency: "INR",
        idempotency_key: `order:${id}:manual`, metadata: { method: paidAt ? method : null, recordedBy: paidAt ? enteredBy : null }, captured_at: paidAt, cancelled_at: cancelled && !paidAt ? cancelledAt : null, created_at: plan.at, updated_at: last });
    } else {
      const ref = randomBytes(10).toString("hex");
      payments.push({ id: paymentId, tenant_id: T, order_id: id, provider: "mock", provider_payment_id: `mock_pay_${ref}`, provider_order_id: `mock_order_${ref}`,
        status: refunded ? "REFUNDED" : paidAt ? "CAPTURED" : cancelled ? "EXPIRED" : "PENDING", amount_minor: total, currency: "INR", idempotency_key: `order:${id}:attempt:1`,
        metadata: { mock: true, checkoutUrl: null }, captured_at: paidAt, cancelled_at: null, created_at: new Date(plan.at.getTime() + 5000), updated_at: last });
    }
    if (refunded) {
      refunds.push({ id: randomUUID(), tenant_id: T, payment_id: paymentId, provider_refund_id: `mock_refund_${randomBytes(10).toString("hex")}`, status: "REFUNDED", amount_minor: total,
        idempotency_key: `cancel:${id}`, reason: `Cancelled: ${reason.replace(/_/g, " ").toLowerCase()}`, created_at: cancelledAt });
      audits.push({ id: randomUUID(), tenant_id: T, actor_user_id: team.MANAGER, event_name: "PaymentRefunded", entity_type: "Order", entity_id: id, metadata: { amountMinor: total, reason: "Cancelled by the restaurant" }, created_at: cancelledAt });
    }
    if (promo && !cancelled) {
      redemptions.push({ id: randomUUID(), tenant_id: T, promotion_id: promotionId(promo.n), customer_id: customer?.id ?? null, order_id: id, discount_minor: discount, applied_by_user_id: staff ? enteredBy : null, redeemed_at: plan.at });
      usage[promo.code] = (usage[promo.code] ?? 0) + 1;
    }

    // Delivery.
    const dispatched = at("DISPATCHED");
    if (fulfillment === "DELIVERY" && dispatched) {
      const rider = RIDERS[orderNumber % RIDERS.length]!;
      const deliveryId = randomUUID();
      const delivered = at("DELIVERED");
      deliveries.push({ id: deliveryId, tenant_id: T, order_id: id, provider: "MANUAL", status: delivered ? "DELIVERED" : "ASSIGNED", pickup_snapshot: outletSnapshot,
        dropoff_snapshot: { ...(address ?? {}), name: snapshot.name, phone: snapshot.phone }, fee_minor: fee, rider_name: rider.name, rider_phone: rider.phone,
        assigned_at: dispatched, picked_up_at: delivered ? new Date(dispatched.getTime() + 3 * MINUTE) : null, delivered_at: delivered, created_at: dispatched, updated_at: delivered ?? dispatched });
      deliveryEvents.push({ id: randomUUID(), tenant_id: T, delivery_order_id: deliveryId, from_status: null, to_status: "ASSIGNED", actor_user_id: team.MANAGER, note: `Rider: ${rider.name} (${rider.phone})`, created_at: dispatched });
      if (delivered) {
        deliveryEvents.push({ id: randomUUID(), tenant_id: T, delivery_order_id: deliveryId, from_status: "ASSIGNED", to_status: "PICKED_UP", actor_user_id: team.MANAGER, note: null, created_at: new Date(dispatched.getTime() + 3 * MINUTE) });
        deliveryEvents.push({ id: randomUUID(), tenant_id: T, delivery_order_id: deliveryId, from_status: "PICKED_UP", to_status: "DELIVERED", actor_user_id: team.MANAGER, note: "Marked delivered from the order", created_at: delivered });
      }
    }

    analytics.push({ id: randomUUID(), tenant_id: T, event_name: "order_created", order_id: id, customer_id: customer?.id ?? null, properties: { totalMinor: total, fulfillmentType: fulfillment, promotionCode: promo?.code ?? null, channel }, occurred_at: plan.at });

    // Messages (what the worker would have recorded; nothing is ever sent).
    const n = `#${orderNumber}`, money = formatMoney(total, "INR"), first = snapshot.name.split(" ")[0] || "there", pickup = fulfillment === "PICKUP";
    const eta = `${etaMin}–${etaMax} min`;
    const toCustomer = (template: string, subject: string, text: string, when: Date) => {
      if (!notify || !snapshot.phone) return;
      const body = `${text}\n\nTrack your order: ${storefrontUrl}/order/${token}\n— ${DEMO.name}`;
      messages.push({ order_id: id, audience: "CUSTOMER", channel: "whatsapp", recipient: snapshot.phone, template, subject: null, body, at: when });
      if (snapshot.email) messages.push({ order_id: id, audience: "CUSTOMER", channel: "email", recipient: snapshot.email, template, subject, body, at: when });
    };
    if (staff) {
      toCustomer("ORDER_CONFIRMED", `Order ${n} confirmed`, `Hi ${first}, ${DEMO.name} has your order ${n} (${money}).${paidAt ? " Payment received — thank you!" : ` Please pay ${money} on ${pickup ? "pickup" : "delivery"}.`} ${pickup ? "Ready for pickup" : "Estimated delivery"} in about ${eta}.`, plan.at);
    } else if (paidAt) {
      toCustomer("ORDER_CONFIRMED", `Order ${n} confirmed`, `Hi ${first}, we've received your order ${n} (${money}). Payment confirmed — the kitchen will accept it shortly.`, paidAt);
      messages.push({ order_id: id, audience: "MERCHANT", channel: "in_app", recipient: "merchant", template: "NEW_ORDER", subject: `New order ${n}`, body: `New paid ${pickup ? "pickup" : "delivery"} order ${n}: ${lines.reduce((s, l) => s + l.qty, 0)} item${lines.reduce((s, l) => s + l.qty, 0) === 1 ? "" : "s"}, ${money}.`, at: paidAt });
    }
    for (const s of steps) {
      if (s.to === "ACCEPTED" && !staff) toCustomer("ORDER_ACCEPTED", `Order ${n} accepted`, `Good news ${first} — ${DEMO.name} has accepted order ${n}. ${pickup ? "Ready for pickup" : "Estimated delivery"} in about ${eta}.`, s.at);
      if (s.to === "READY") toCustomer("ORDER_READY", `Order ${n} is ready`, pickup ? `Order ${n} is ready for pickup at ${DEMO.name}.` : `Order ${n} is ready and will be handed to a rider shortly.`, s.at);
      if (s.to === "DISPATCHED") { const r = RIDERS[orderNumber % RIDERS.length]!; toCustomer("ORDER_DISPATCHED", `Order ${n} is on the way`, `Order ${n} is on its way with ${r.name} (${r.phone}).`, s.at); }
      if (s.to === "DELIVERED") toCustomer(pickup ? "ORDER_COLLECTED" : "ORDER_DELIVERED", `Order ${n} ${pickup ? "collected" : "delivered"}`, `Order ${n} has been ${pickup ? "collected" : "delivered"}. Enjoy your meal, ${first}!`, s.at);
      if (s.to === "CANCELLED" && !unpaid) toCustomer("ORDER_CANCELLED", `Order ${n} cancelled`, `Sorry ${first}, order ${n} has been cancelled by ${DEMO.name}.${refunded ? (staff ? ` ${DEMO.name} will return your payment of ${money}.` : ` A full refund of ${money} has been started; it usually reaches your account in 5–7 working days.`) : ""}`, s.at);
    }
    return id;
  }

  // ~60 days of service: lunch and dinner peaks, busier weekends, slowly growing.
  const ist = (d: Date) => new Date(d.getTime() + 330 * MINUTE);
  const todayIst = ist(now);
  const midnightUtc = Date.UTC(todayIst.getUTCFullYear(), todayIst.getUTCMonth(), todayIst.getUTCDate()) - 330 * MINUTE;
  const liveCutoff = now.getTime() - 75 * MINUTE;
  const planned: Plan[] = [];
  for (let d = 59; d >= 0; d--) {
    const dayStart = midnightUtc - d * 24 * 60 * MINUTE;
    const weekday = new Date(dayStart + 330 * MINUTE).getUTCDay();
    const base = [10, 5, 5, 6, 6, 8, 10][weekday]!;
    const count = Math.max(2, Math.round(base * (0.7 + 0.35 * ((59 - d) / 59))) + between(-1, 2));
    for (let i = 0; i < count; i++) {
      const slot = rand();
      const minuteOfDay = slot < 0.4 ? between(12 * 60, 15 * 60) : slot < 0.95 ? between(19 * 60, 23 * 60) : between(8 * 60, 11 * 60);
      const at = new Date(dayStart + minuteOfDay * MINUTE + between(0, 59) * 1000);
      if (at.getTime() > liveCutoff) continue;
      const cancel = chance(0.055);
      // Cancellations happen on website orders: some were never paid, the rest were refunded in full.
      planned.push(cancel ? { at, status: "CANCELLED", channel: "DIRECT_WEB", ...(chance(0.4) ? { cancelReason: "PAYMENT_NOT_COMPLETED" } : {}) } : { at, status: "DELIVERED" });
    }
  }
  planned.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const p of planned) place(p);

  // Right now: orders waiting at every step of the board, so the workflow can be shown immediately.
  const ago = (min: number) => new Date(now.getTime() - min * MINUTE);
  const liveIds: string[] = [];
  liveIds.push(place({ at: ago(62), channel: "DIRECT_WEB", fulfillment: "DELIVERY", status: "DISPATCHED" }));
  liveIds.push(place({ at: ago(44), channel: "DIRECT_WEB", fulfillment: "PICKUP", status: "READY" }));
  liveIds.push(place({ at: ago(38), channel: "DIRECT_WEB", fulfillment: "DELIVERY", status: "READY" }));
  liveIds.push(place({ at: ago(26), channel: "PHONE", fulfillment: "PICKUP", status: "PREPARING" }));
  liveIds.push(place({ at: ago(21), channel: "DIRECT_WEB", fulfillment: "DELIVERY", status: "PREPARING", note: "Please make it less spicy." }));
  liveIds.push(place({ at: ago(14), channel: "WHATSAPP", fulfillment: "DELIVERY", status: "ACCEPTED", payLater: true }));
  liveIds.push(place({ at: ago(11), channel: "DIRECT_WEB", fulfillment: "DELIVERY", status: "ACCEPTED" }));
  liveIds.push(place({ at: ago(6), channel: "DIRECT_WEB", fulfillment: "PICKUP", status: "NEW" }));
  liveIds.push(place({ at: ago(3), channel: "DIRECT_WEB", fulfillment: "DELIVERY", status: "NEW", note: "Ring the bell twice." }));
  liveIds.push(place({ at: ago(2), channel: "DIRECT_WEB", fulfillment: "DELIVERY", status: "NEW", unpaid: true }));
  notes.push({ id: randomUUID(), tenant_id: T, order_id: liveIds[4], author_user_id: team.KITCHEN, body: "Told the tandoor team: mild spice for this one.", created_at: ago(18) });
  notes.push({ id: randomUUID(), tenant_id: T, order_id: liveIds[5], author_user_id: team.STAFF, body: "Customer will pay by UPI to the rider.", created_at: ago(13) });

  // Customers and their saved addresses.
  const used = customers.filter((c) => c.first);
  await bulk(tx, "customers", used.map((c) => ({
    id: c.id, tenant_id: T, name: c.name, phone: c.phone, email: c.email, marketing_consent_status: c.consent ? "GRANTED" : "UNKNOWN", marketing_consent_at: c.consent ? c.first : null,
    created_at: c.first, last_order_at: c.last, updated_at: c.last, notes: c.note,
  })));
  await bulk(tx, "customer_addresses", used.flatMap((c) => [...c.addresses.values()].map((a) => ({
    id: randomUUID(), tenant_id: T, customer_id: c.id, label: null, line1: a.line1, line2: a.line2, city: "Bengaluru", region: "Karnataka", postal_code: a.postal, country_code: "IN",
    delivery_notes: null, created_at: a.at, last_used_at: a.at,
  }))));
  await bulk(tx, "orders", orders);
  await bulk(tx, "order_items", items);
  await bulk(tx, "order_status_events", events);
  await bulk(tx, "payments", payments);
  await bulk(tx, "payment_refunds", refunds);
  await bulk(tx, "delivery_orders", deliveries);
  await bulk(tx, "delivery_status_events", deliveryEvents);
  await bulk(tx, "promotion_redemptions", redemptions);
  await bulk(tx, "analytics_events", analytics);
  await bulk(tx, "order_notes", notes);
  for (const [code, count] of Object.entries(usage)) await tx.query(`UPDATE promotions SET usage_count = $3 WHERE tenant_id = $1 AND code = $2`, [T, code, count]);
  await tx.query(`INSERT INTO tenant_order_counters (tenant_id, last_number) VALUES ($1, $2)`, [T, number]);

  // Two recent emails failed, so the Messages screen shows a retry.
  const recentEmails = messages.filter((m) => m.channel === "email" && now.getTime() - m.at.getTime() < 2 * 24 * 60 * MINUTE);
  for (const m of recentEmails.slice(-6, -4)) m.failed = true;
  const notificationRows = messages.map((m) => ({ ...m, id: randomUUID() }));
  await bulk(tx, "notifications", notificationRows.map((m, i) => ({
    id: m.id, tenant_id: T, order_id: m.order_id, channel: m.channel, template: m.template, recipient: m.recipient, status: m.failed ? "FAILED" : "SENT",
    domain_event_id: `seed-${m.order_id}-${m.template}-${i}`, audience: m.audience, subject: m.subject, body: m.body, attempt_count: m.failed ? 5 : 1,
    last_error: m.failed ? "Mailbox unavailable (simulated by the demo message provider)." : null, sent_at: m.failed ? null : m.at, created_at: m.at, updated_at: m.at,
  })));
  await bulk(tx, "notification_attempts", notificationRows.flatMap((m): Record<string, unknown>[] => m.failed
    ? [1, 2, 3, 4, 5].map((a) => ({ id: randomUUID(), notification_id: m.id, attempt_no: a, status: "FAILED", provider_reference: null, error_code: "Mailbox unavailable (simulated by the demo message provider).", attempted_at: new Date(m.at.getTime() + a * MINUTE) }))
    : [{ id: randomUUID(), notification_id: m.id, attempt_no: 1, status: "SENT", provider_reference: m.channel === "in_app" ? "in_app" : `dev_${randomUUID()}`, error_code: null, attempted_at: m.at }]));
  await bulk(tx, "audit_events", audits);
  return { orders: orders.length, customers: used.length, messages: messages.length, live: liveIds.length };
}

/** A believable trail of how the restaurant was set up (Settings → Audit log). */
async function setupAudit(tx: Tx, team: Record<string, string>, start: Date, now: Date) {
  const rows: Record<string, unknown>[] = [];
  const at = (minutes: number) => new Date(start.getTime() + minutes * MINUTE);
  const add = (actor: string, event: string, type: string, entity: string | null, metadata: Record<string, unknown>, when: Date) =>
    rows.push({ id: randomUUID(), tenant_id: T, actor_user_id: actor, event_name: event, entity_type: type, entity_id: entity, metadata, created_at: when });
  const owner = team.OWNER!, manager = team.MANAGER!;
  add(owner, "BusinessSettingsUpdated", "Tenant", T, { businessName: DEMO.name }, at(0));
  add(owner, "BrandSettingsUpdated", "Brand", DEMO.brandId, { slug: DEMO.slug }, at(4));
  add(owner, "OutletSettingsUpdated", "Outlet", DEMO.outletId, { hours: "Every day, 00:00–23:59" }, at(9));
  CATEGORIES.forEach((c, i) => add(owner, "CategoryCreated", "Category", c.id, { name: c.name }, at(15 + i)));
  PRODUCTS.forEach((p, i) => add(i % 3 ? manager : owner, "ProductCreated", "Product", productId(p.n), { name: p.name, priceMinor: p.price }, at(30 + i * 2)));
  DELIVERY_ZONES.forEach((z, i) => add(owner, "DeliveryZoneCreated", "DeliveryZone", zoneId(z.n), { name: z.name, feeMinor: z.fee }, at(120 + i)));
  PROMOTIONS.forEach((p, i) => add(owner, "PromotionCreated", "Promotion", promotionId(p.n), { code: p.code }, at(130 + i)));
  DEMO_USERS.filter((u) => u.role !== "OWNER").forEach((u, i) => add(owner, "TeamMemberInvited", "Membership", null, { email: u.email, role: u.role }, at(150 + i)));
  add(owner, "StorefrontThemePublished", "Brand", DEMO.brandId, { presetId: "saffron-house", layoutPresetId: "saffron-house" }, at(170));
  add(owner, "StorefrontPublished", "Brand", DEMO.brandId, { slug: DEMO.slug }, at(175));
  const day = (d: number, minutes: number) => new Date(now.getTime() - d * 24 * 60 * MINUTE + minutes * MINUTE);
  add(owner, "PromotionPaused", "Promotion", promotionId(6), { code: "LUNCHBOX" }, day(12, 0));
  add(manager, "ProductPriceChanged", "Product", productId(11), { name: "Paneer Tikka Biryani", fromMinor: 29900, toMinor: 31900 }, day(9, 0));
  add(owner, "DeliveryZoneUpdated", "DeliveryZone", zoneId(1), { name: "Koramangala & nearby", freeDeliveryMinimumMinor: 49900 }, day(6, 0));
  for (const p of PRODUCTS.filter((x) => x.soldOut)) add(team.KITCHEN!, "ProductAvailabilityChanged", "Product", productId(p.n), { name: p.name, available: false, reason: p.soldOut }, day(0, -240));
  await bulk(tx, "audit_events", rows);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Run the demo seed from a workstation shell, not with NODE_ENV=production.");
  const skipUpload = process.argv.includes("--skip-upload");
  const now = new Date();
  const setupAt = new Date(now.getTime() - 62 * 24 * 60 * MINUTE);
  const target = new URL(env().DATABASE_URL);
  console.log(`Database:  ${target.hostname}${target.pathname}`);
  const pending = await pool().query<{ n: number }>(`SELECT count(*)::int AS n FROM schema_migrations`).catch(() => ({ rows: [{ n: 0 }] }));
  if (pending.rows[0]!.n < 10) throw new Error("Run `pnpm db:migrate` first (migrations 0001–0010 are required).");

  await uploadPhotos(skipUpload);
  let orphanKeys: string[] = [];
  const summary = await withTransaction(async (tx) => {
    await tx.query(`SET LOCAL statement_timeout = '300s'`);
    await upsertRestaurant(tx);
    const team = await upsertTeam(tx);
    await resetTenantData(tx);
    orphanKeys = await extraMediaKeys(tx);
    await upsertCatalog(tx, team.OWNER!, setupAt);
    await publishAppearance(tx, team.OWNER!, new Date(setupAt.getTime() + 170 * MINUTE));
    await setupAudit(tx, team, setupAt, now);
    return generateHistory(tx, team, now);
  });
  for (const key of orphanKeys) await storage().remove(key).catch(() => {});
  console.log(`restaurant ${DEMO.name} (slug ${DEMO.slug}, tenant ${T})`);
  console.log(`catalog    ${CATEGORIES.length} categories, ${PRODUCTS.length} dishes, ${MODIFIER_GROUPS.length} option groups, ${PROMOTIONS.length} offers, ${DELIVERY_ZONES.length} delivery areas`);
  console.log(`history    ${summary.orders} orders (${summary.live} on the live board), ${summary.customers} customers, ${summary.messages} messages`);
  console.log(`team       ${DEMO_USERS.map((u) => `${u.role} ${u.email}`).join(", ")}`);
  if (orphanKeys.length) console.log(`removed    ${orphanKeys.length} photo(s) uploaded during earlier demos`);
  await pool().end();
}

main().catch(async (error) => {
  console.error(`demo:seed failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  await pool().end().catch(() => {});
  process.exit(1);
});
