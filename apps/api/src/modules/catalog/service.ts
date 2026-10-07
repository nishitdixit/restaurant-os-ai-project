// Catalog administration (PRD 5.3, specs/catalog, docs/CATALOG.md).
import { normalizeBadges, slugify } from "@restaurant-os/domain";
import { RESERVED_SLUGS, type AdminCategory, type AdminModifierGroup, type AdminProduct, type CategoryInput, type ModifierGroupInput, type ProductInput } from "@restaurant-os/types";
import { pool, withTransaction, type Db, type Tx } from "../../db/pool.ts";
import { ApiError, notFound } from "../../lib/errors.ts";
import { audit, type AuditActor } from "../../lib/events.ts";
import { iso } from "../../lib/format.ts";
import { mediaRefMap, mediaUrlMap } from "../../integrations/storage.ts";
import { UNAVAILABLE_SQL } from "../checkout/pricing.ts";

async function uniqueSlug(db: Db, table: "categories" | "products", tenantId: string, base: string, excludeId?: string): Promise<string> {
  const root = base || "item";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    // Category pages live at /{slug}; never let one shadow a storefront page such as /offers.
    if (table === "categories" && (RESERVED_SLUGS as readonly string[]).includes(candidate)) continue;
    const r = await db.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1 AND slug = $2 AND ($3::uuid IS NULL OR id <> $3)`, [tenantId, candidate, excludeId ?? null]);
    if (!r.rowCount) return candidate;
  }
  throw new ApiError(409, "SLUG_TAKEN", "Could not generate a unique URL for this item.");
}

async function assertMedia(db: Db, tenantId: string, assetId: string | null | undefined) {
  if (!assetId) return;
  const r = await db.query(`SELECT 1 FROM media_assets WHERE id = $1 AND tenant_id = $2`, [assetId, tenantId]);
  if (!r.rowCount) throw new ApiError(422, "MEDIA_NOT_FOUND", "The image was not found. Upload it again.");
}

// Categories ---------------------------------------------------------------------------------

export async function listCategories(tenantId: string): Promise<AdminCategory[]> {
  const r = await pool().query<{ id: string; name: string; slug: string; description: string; status: AdminCategory["status"]; sort_order: number; product_count: number; name_hi: string; description_hi: string; image_asset_id: string | null }>(
    `SELECT c.id, c.name, c.slug, c.description, c.status, c.sort_order, c.name_hi, c.description_hi, c.image_asset_id,
            (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.status <> 'ARCHIVED') AS product_count
     FROM categories c WHERE c.tenant_id = $1 AND c.status <> 'ARCHIVED' ORDER BY c.sort_order, c.name`, [tenantId]);
  const urls = await mediaUrlMap(pool(), r.rows.map((c) => c.image_asset_id));
  return r.rows.map((c) => ({
    id: c.id, name: c.name, slug: c.slug, description: c.description, status: c.status, sortOrder: c.sort_order, productCount: c.product_count,
    nameHi: c.name_hi, descriptionHi: c.description_hi, imageAssetId: c.image_asset_id, imageUrl: c.image_asset_id ? urls.get(c.image_asset_id) ?? null : null,
  }));
}

export async function createCategory(actor: AuditActor, input: CategoryInput) {
  return withTransaction(async (tx) => {
    await assertMedia(tx, actor.tenantId, input.imageAssetId);
    const slug = await uniqueSlug(tx, "categories", actor.tenantId, input.slug ?? slugify(input.name));
    const r = await tx.query<{ id: string }>(
      `INSERT INTO categories (tenant_id, name, slug, description, status, sort_order, name_hi, description_hi, image_asset_id)
       VALUES ($1, $2, $3, $4, $5::business_object_status, coalesce((SELECT max(sort_order) + 10 FROM categories WHERE tenant_id = $1), 10), $6, $7, $8) RETURNING id`,
      [actor.tenantId, input.name, slug, input.description, input.status, input.nameHi, input.descriptionHi, input.imageAssetId ?? null]);
    await audit(tx, actor, "CategoryCreated", { type: "Category", id: r.rows[0]!.id }, { name: input.name });
    return { id: r.rows[0]!.id };
  });
}

export async function updateCategory(actor: AuditActor, id: string, input: CategoryInput) {
  return withTransaction(async (tx) => {
    await assertMedia(tx, actor.tenantId, input.imageAssetId);
    const slug = input.slug ? await uniqueSlug(tx, "categories", actor.tenantId, input.slug, id) : undefined;
    const r = await tx.query(
      `UPDATE categories SET name = $3, slug = coalesce($4, slug), description = $5, status = $6::business_object_status, name_hi = $7, description_hi = $8,
         image_asset_id = $9, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, actor.tenantId, input.name, slug ?? null, input.description, input.status, input.nameHi, input.descriptionHi, input.imageAssetId ?? null]);
    if (!r.rowCount) throw notFound("Category");
    await audit(tx, actor, "CategoryUpdated", { type: "Category", id }, { name: input.name, status: input.status });
    return { id };
  });
}

export async function archiveCategory(actor: AuditActor, id: string) {
  return withTransaction(async (tx) => {
    const live = await tx.query(`SELECT 1 FROM products WHERE category_id = $1 AND tenant_id = $2 AND status <> 'ARCHIVED' LIMIT 1`, [id, actor.tenantId]);
    if (live.rowCount) throw new ApiError(409, "CATEGORY_NOT_EMPTY", "Move or archive the items in this category first.");
    const r = await tx.query(`UPDATE categories SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, actor.tenantId]);
    if (!r.rowCount) throw notFound("Category");
    await audit(tx, actor, "CategoryArchived", { type: "Category", id });
  });
}

export async function reorder(actor: AuditActor, table: "categories" | "products", ids: string[]) {
  await withTransaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.query(`UPDATE ${table} SET sort_order = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, actor.tenantId, (index + 1) * 10]);
    }
    await audit(tx, actor, table === "categories" ? "CategoriesReordered" : "ProductsReordered", { type: table === "categories" ? "Category" : "Product", id: null }, { count: ids.length });
  });
}

// Products -----------------------------------------------------------------------------------

interface ProductRow {
  id: string; category_id: string; category_name: string; name: string; slug: string; description: string; long_description: string;
  base_price_minor: number; currency: string; image_asset_id: string | null; dietary: AdminProduct["dietary"]; spice_level: number | null;
  allergens: string[]; tags: string[]; status: AdminProduct["status"]; sort_order: number; unavailable: boolean; unavailable_reason: string | null;
  unavailable_until: Date | null; modifier_group_ids: string[] | null; updated_at: Date; name_hi: string; description_hi: string; badges: unknown;
  gallery_ids: string[] | null;
}

const ADMIN_PRODUCT_SELECT = `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.slug, p.description, p.long_description, p.base_price_minor,
  trim(p.currency) AS currency, p.image_asset_id, p.dietary, p.spice_level, p.allergens, p.tags, p.status, p.sort_order, p.updated_at,
  p.name_hi, p.description_hi, p.badges,
  (SELECT array_agg(pm.media_id ORDER BY pm.sort_order) FROM product_media pm WHERE pm.product_id = p.id) AS gallery_ids,
  ${UNAVAILABLE_SQL} AS unavailable,
  ov.reason AS unavailable_reason, ov.ends_at AS unavailable_until,
  (SELECT array_agg(pmg.modifier_group_id ORDER BY pmg.sort_order) FROM product_modifier_groups pmg WHERE pmg.product_id = p.id) AS modifier_group_ids
  FROM products p JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (SELECT a.reason, a.ends_at FROM availability_overrides a WHERE a.tenant_id = p.tenant_id AND a.product_id = p.id AND a.status = 'INACTIVE'
    AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now()) ORDER BY a.starts_at DESC NULLS LAST LIMIT 1) ov ON true`;

async function toAdminProducts(db: Db, rows: ProductRow[], tenantId: string): Promise<AdminProduct[]> {
  const urls = await mediaUrlMap(db, rows.map((r) => r.image_asset_id));
  const gallery = await mediaRefMap(db, tenantId, rows.flatMap((r) => r.gallery_ids ?? []));
  return rows.map((r) => ({
    nameHi: r.name_hi ?? "", descriptionHi: r.description_hi ?? "", badges: normalizeBadges(r.badges),
    gallery: (r.gallery_ids ?? []).flatMap((id) => { const g = gallery.get(id); return g ? [{ id, url: g.url, alt: g.alt }] : []; }),
    id: r.id, categoryId: r.category_id, categoryName: r.category_name, name: r.name, slug: r.slug, description: r.description,
    longDescription: r.long_description, basePriceMinor: r.base_price_minor, currency: r.currency, imageAssetId: r.image_asset_id,
    imageUrl: r.image_asset_id ? urls.get(r.image_asset_id) ?? null : null, dietary: r.dietary, spiceLevel: r.spice_level,
    allergens: r.allergens ?? [], tags: r.tags ?? [], status: r.status, sortOrder: r.sort_order, available: !r.unavailable,
    unavailableReason: r.unavailable ? r.unavailable_reason : null, unavailableUntil: r.unavailable ? iso(r.unavailable_until) : null,
    modifierGroupIds: r.modifier_group_ids ?? [], updatedAt: iso(r.updated_at)!,
  }));
}

export async function listProducts(tenantId: string, filter: { q?: string; categoryId?: string; status?: string; availability?: "available" | "unavailable" }) {
  const conditions = ["p.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (filter.status && filter.status !== "all") { params.push(filter.status); conditions.push(`p.status = $${params.length}::business_object_status`); }
  else conditions.push(`p.status <> 'ARCHIVED'`);
  if (filter.categoryId) { params.push(filter.categoryId); conditions.push(`p.category_id = $${params.length}`); }
  if (filter.q) { params.push(`%${filter.q.toLowerCase()}%`); conditions.push(`(lower(p.name) LIKE $${params.length} OR lower(c.name) LIKE $${params.length})`); }
  if (filter.availability === "unavailable") conditions.push(UNAVAILABLE_SQL);
  if (filter.availability === "available") conditions.push(`NOT ${UNAVAILABLE_SQL}`);
  const r = await pool().query<ProductRow>(`${ADMIN_PRODUCT_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY c.sort_order, c.name, p.sort_order, p.name`, params);
  return toAdminProducts(pool(), r.rows, tenantId);
}

export async function getProduct(tenantId: string, id: string): Promise<AdminProduct> {
  const r = await pool().query<ProductRow>(`${ADMIN_PRODUCT_SELECT} WHERE p.tenant_id = $1 AND p.id = $2`, [tenantId, id]);
  if (!r.rowCount) throw notFound("Product");
  return (await toAdminProducts(pool(), r.rows, tenantId))[0]!;
}

async function assertCategory(tx: Tx, tenantId: string, categoryId: string) {
  const r = await tx.query(`SELECT 1 FROM categories WHERE id = $1 AND tenant_id = $2 AND status <> 'ARCHIVED'`, [categoryId, tenantId]);
  if (!r.rowCount) throw new ApiError(422, "CATEGORY_NOT_FOUND", "Choose a category.", { fields: { categoryId: "Choose a category." } });
}

async function setModifierGroups(tx: Tx, tenantId: string, productId: string, groupIds: string[]) {
  if (groupIds.length) {
    const r = await tx.query<{ id: string }>(`SELECT id FROM modifier_groups WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'ACTIVE'`, [tenantId, groupIds]);
    if (r.rowCount !== new Set(groupIds).size) throw new ApiError(422, "MODIFIER_GROUP_NOT_FOUND", "One of the option groups no longer exists.");
  }
  await tx.query(`DELETE FROM product_modifier_groups WHERE product_id = $1`, [productId]);
  for (const [i, groupId] of [...new Set(groupIds)].entries()) {
    await tx.query(`INSERT INTO product_modifier_groups (product_id, modifier_group_id, sort_order) VALUES ($1, $2, $3)`, [productId, groupId, i]);
  }
}

/** Extra photos after the main one; every id must be the restaurant's own media. */
async function setGallery(tx: Tx, tenantId: string, productId: string, mediaIds: string[]) {
  const unique = [...new Set(mediaIds)];
  if (unique.length) {
    const r = await tx.query(`SELECT id FROM media_assets WHERE tenant_id = $1 AND id = ANY($2::uuid[])`, [tenantId, unique]);
    if (r.rowCount !== unique.length) throw new ApiError(422, "MEDIA_NOT_FOUND", "One of the photos was not found. Upload it again.");
  }
  await tx.query(`DELETE FROM product_media WHERE product_id = $1 AND tenant_id = $2`, [productId, tenantId]);
  for (const [i, mediaId] of unique.entries()) {
    await tx.query(`INSERT INTO product_media (tenant_id, product_id, media_id, sort_order) VALUES ($1, $2, $3, $4)`, [tenantId, productId, mediaId, i]);
  }
}

export async function createProduct(actor: AuditActor, input: ProductInput) {
  return withTransaction(async (tx) => {
    await assertCategory(tx, actor.tenantId, input.categoryId);
    await assertMedia(tx, actor.tenantId, input.imageAssetId);
    const slug = await uniqueSlug(tx, "products", actor.tenantId, input.slug ?? slugify(input.name));
    const currency = (await tx.query<{ c: string }>(`SELECT trim(default_currency) AS c FROM tenants WHERE id = $1`, [actor.tenantId])).rows[0]!.c;
    const r = await tx.query<{ id: string }>(
      `INSERT INTO products (tenant_id, category_id, name, slug, description, long_description, base_price_minor, currency, image_asset_id, dietary, spice_level,
         allergens, tags, status, published_at, sort_order, name_hi, description_hi, badges)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::business_object_status, CASE WHEN $14::business_object_status = 'ACTIVE' THEN now() END,
         coalesce((SELECT max(sort_order) + 10 FROM products WHERE category_id = $2), 10), $15, $16, $17) RETURNING id`,
      [actor.tenantId, input.categoryId, input.name, slug, input.description, input.longDescription, input.basePriceMinor, currency, input.imageAssetId ?? null,
        input.dietary ?? null, input.spiceLevel ?? null, input.allergens, input.tags, input.status, input.nameHi, input.descriptionHi, JSON.stringify(normalizeBadges(input.badges))]);
    const id = r.rows[0]!.id;
    await setModifierGroups(tx, actor.tenantId, id, input.modifierGroupIds);
    await setGallery(tx, actor.tenantId, id, input.galleryAssetIds);
    await audit(tx, actor, "ProductCreated", { type: "Product", id }, { name: input.name, priceMinor: input.basePriceMinor, status: input.status });
    return { id };
  });
}

export async function updateProduct(actor: AuditActor, id: string, input: ProductInput) {
  return withTransaction(async (tx) => {
    const before = await tx.query<{ base_price_minor: number; status: string; name: string }>(`SELECT base_price_minor, status, name FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [id, actor.tenantId]);
    if (!before.rowCount) throw notFound("Product");
    await assertCategory(tx, actor.tenantId, input.categoryId);
    await assertMedia(tx, actor.tenantId, input.imageAssetId);
    const slug = input.slug ? await uniqueSlug(tx, "products", actor.tenantId, input.slug, id) : null;
    await tx.query(
      `UPDATE products SET category_id = $3, name = $4, slug = coalesce($5, slug), description = $6, long_description = $7, base_price_minor = $8, image_asset_id = $9,
         dietary = $10, spice_level = $11, allergens = $12, tags = $13, status = $14::business_object_status, name_hi = $15, description_hi = $16, badges = $17,
         published_at = CASE WHEN $14::business_object_status = 'ACTIVE' THEN coalesce(published_at, now()) ELSE published_at END,
         archived_at = CASE WHEN $14::business_object_status = 'ARCHIVED' THEN now() ELSE NULL END, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, actor.tenantId, input.categoryId, input.name, slug, input.description, input.longDescription, input.basePriceMinor, input.imageAssetId ?? null,
        input.dietary ?? null, input.spiceLevel ?? null, input.allergens, input.tags, input.status, input.nameHi, input.descriptionHi, JSON.stringify(normalizeBadges(input.badges))]);
    await setModifierGroups(tx, actor.tenantId, id, input.modifierGroupIds);
    await setGallery(tx, actor.tenantId, id, input.galleryAssetIds);
    const prev = before.rows[0]!;
    // Price changes are audited explicitly (docs/SECURITY.md "Admin audit"). Historical orders keep their snapshot prices.
    if (prev.base_price_minor !== input.basePriceMinor) {
      await audit(tx, actor, "ProductPriceChanged", { type: "Product", id }, { name: input.name, fromMinor: prev.base_price_minor, toMinor: input.basePriceMinor });
    }
    await audit(tx, actor, "ProductUpdated", { type: "Product", id }, { name: input.name, status: input.status, statusChanged: prev.status !== input.status });
    return { id };
  });
}

export async function duplicateProduct(actor: AuditActor, id: string) {
  const source = await getProduct(actor.tenantId, id);
  return createProduct(actor, {
    categoryId: source.categoryId, name: `${source.name} (copy)`, slug: undefined, description: source.description, longDescription: source.longDescription,
    basePriceMinor: source.basePriceMinor, imageAssetId: source.imageAssetId, dietary: source.dietary, spiceLevel: source.spiceLevel,
    allergens: source.allergens, tags: source.tags, modifierGroupIds: source.modifierGroupIds, status: "DRAFT",
    nameHi: source.nameHi, descriptionHi: source.descriptionHi, badges: source.badges, galleryAssetIds: source.gallery.map((g) => g.id),
  });
}

export async function setProductStatus(actor: AuditActor, productIds: string[], status: "DRAFT" | "ACTIVE" | "ARCHIVED") {
  return withTransaction(async (tx) => {
    const r = await tx.query<{ id: string }>(
      `UPDATE products SET status = $3::business_object_status, published_at = CASE WHEN $3::business_object_status = 'ACTIVE' THEN coalesce(published_at, now()) ELSE published_at END,
         archived_at = CASE WHEN $3::business_object_status = 'ARCHIVED' THEN now() ELSE NULL END, updated_at = now()
       WHERE tenant_id = $1 AND id = ANY($2::uuid[]) RETURNING id`,
      [actor.tenantId, productIds, status]);
    await audit(tx, actor, "ProductStatusChanged", { type: "Product", id: productIds.length === 1 ? productIds[0]! : null }, { productIds: r.rows.map((x) => x.id), status });
    return { updated: r.rowCount ?? 0 };
  });
}

/**
 * Bulk stock toggle (Journey C). Closes any open override, then records the new state; the
 * storefront and checkout read availability live, so the change applies to the next request.
 */
export async function setAvailability(actor: AuditActor, input: { productIds: string[]; available: boolean; reason: string; until?: string | null }) {
  return withTransaction(async (tx) => {
    const owned = await tx.query<{ id: string; name: string }>(`SELECT id, name FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`, [actor.tenantId, input.productIds]);
    const ids = owned.rows.map((r) => r.id);
    if (!ids.length) throw notFound("Product");
    await tx.query(
      `UPDATE availability_overrides SET ends_at = now() WHERE tenant_id = $1 AND product_id = ANY($2::uuid[]) AND status = 'INACTIVE' AND (ends_at IS NULL OR ends_at > now())`,
      [actor.tenantId, ids]);
    if (!input.available) {
      if (input.until && new Date(input.until) <= new Date()) throw new ApiError(422, "INVALID_UNTIL", "Choose a time in the future.");
      for (const id of ids) {
        await tx.query(`INSERT INTO availability_overrides (tenant_id, product_id, status, starts_at, ends_at, reason) VALUES ($1, $2, 'INACTIVE', now(), $3, $4)`,
          [actor.tenantId, id, input.until ?? null, input.reason || "Out of stock"]);
      }
    }
    for (const row of owned.rows) {
      await audit(tx, actor, "ProductAvailabilityChanged", { type: "Product", id: row.id }, { name: row.name, available: input.available, reason: input.reason, until: input.until ?? null });
    }
    await tx.query(`UPDATE products SET updated_at = now() WHERE id = ANY($1::uuid[])`, [ids]);
    return { updated: ids.length };
  });
}

// Modifier groups ----------------------------------------------------------------------------

export async function listModifierGroups(tenantId: string): Promise<AdminModifierGroup[]> {
  const groups = await pool().query<{ id: string; name: string; description: string; min_selections: number; max_selections: number; product_count: number }>(
    `SELECT g.id, g.name, g.description, g.min_selections, g.max_selections,
            (SELECT count(*) FROM product_modifier_groups pmg JOIN products p ON p.id = pmg.product_id AND p.status <> 'ARCHIVED' WHERE pmg.modifier_group_id = g.id) AS product_count
     FROM modifier_groups g WHERE g.tenant_id = $1 AND g.status = 'ACTIVE' ORDER BY g.name`, [tenantId]);
  const options = await pool().query<{ id: string; modifier_group_id: string; name: string; price_delta_minor: number; status: string }>(
    `SELECT id, modifier_group_id, name, price_delta_minor, status FROM modifiers WHERE tenant_id = $1 AND status IN ('ACTIVE','INACTIVE') ORDER BY sort_order, name`, [tenantId]);
  return groups.rows.map((g) => ({
    id: g.id, name: g.name, description: g.description, minSelections: g.min_selections, maxSelections: g.max_selections, productCount: g.product_count,
    modifiers: options.rows.filter((o) => o.modifier_group_id === g.id).map((o) => ({ id: o.id, name: o.name, priceDeltaMinor: o.price_delta_minor, active: o.status === "ACTIVE" })),
  }));
}

export async function saveModifierGroup(actor: AuditActor, id: string | null, input: ModifierGroupInput) {
  return withTransaction(async (tx) => {
    let groupId = id;
    if (groupId) {
      const r = await tx.query(`UPDATE modifier_groups SET name = $3, description = $4, min_selections = $5, max_selections = $6, updated_at = now() WHERE id = $1 AND tenant_id = $2 AND status = 'ACTIVE'`,
        [groupId, actor.tenantId, input.name, input.description, input.minSelections, input.maxSelections]);
      if (!r.rowCount) throw notFound("Option group");
    } else {
      groupId = (await tx.query<{ id: string }>(`INSERT INTO modifier_groups (tenant_id, name, description, min_selections, max_selections) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [actor.tenantId, input.name, input.description, input.minSelections, input.maxSelections])).rows[0]!.id;
    }
    const keep: string[] = [];
    for (const [i, option] of input.modifiers.entries()) {
      if (option.id) {
        const r = await tx.query(`UPDATE modifiers SET name = $3, price_delta_minor = $4, status = $5::business_object_status, sort_order = $6, updated_at = now() WHERE id = $1 AND modifier_group_id = $2`,
          [option.id, groupId, option.name, option.priceDeltaMinor, option.active ? "ACTIVE" : "INACTIVE", i]);
        if (r.rowCount) { keep.push(option.id); continue; }
      }
      keep.push((await tx.query<{ id: string }>(`INSERT INTO modifiers (tenant_id, modifier_group_id, name, price_delta_minor, status, sort_order) VALUES ($1, $2, $3, $4, $5::business_object_status, $6) RETURNING id`,
        [actor.tenantId, groupId, option.name, option.priceDeltaMinor, option.active ? "ACTIVE" : "INACTIVE", i])).rows[0]!.id);
    }
    // Removed options are archived, not deleted, so historical order snapshots stay meaningful.
    await tx.query(`UPDATE modifiers SET status = 'ARCHIVED', updated_at = now() WHERE modifier_group_id = $1 AND NOT (id = ANY($2::uuid[]))`, [groupId, keep]);
    await audit(tx, actor, id ? "ModifierGroupUpdated" : "ModifierGroupCreated", { type: "ModifierGroup", id: groupId }, { name: input.name, options: input.modifiers.map((m) => ({ name: m.name, priceDeltaMinor: m.priceDeltaMinor })) });
    return { id: groupId };
  });
}

export async function archiveModifierGroup(actor: AuditActor, id: string) {
  return withTransaction(async (tx) => {
    const r = await tx.query(`UPDATE modifier_groups SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, actor.tenantId]);
    if (!r.rowCount) throw notFound("Option group");
    await tx.query(`DELETE FROM product_modifier_groups WHERE modifier_group_id = $1`, [id]);
    await audit(tx, actor, "ModifierGroupArchived", { type: "ModifierGroup", id });
  });
}
