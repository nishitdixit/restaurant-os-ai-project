// Merchant profile, outlet operations settings, setup checklist and publish (specs/onboarding).
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { BrandSettingsSchema, BusinessSettingsSchema, OutletSettingsSchema, type ChecklistStep, type SetupStatus } from "@restaurant-os/types";
import { env } from "../../config/env.ts";
import { pool, withTransaction, type Db } from "../../db/pool.ts";
import { ApiError } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { iso } from "../../lib/format.ts";
import { mediaUrlMap } from "../../integrations/storage.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";
import { OUTLET_COLUMNS, type OutletRow, type BrandMetadata } from "../storefront/store.ts";

const tags = ["settings"];

async function primaryBrand(db: Db, tenantId: string) {
  const r = await db.query<{ id: string; name: string; slug: string; status: string; metadata: BrandMetadata; logo_asset_id: string | null; published_at: Date | null }>(
    `SELECT id, name, slug, status, metadata, logo_asset_id, published_at FROM brands WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, [tenantId]);
  if (!r.rowCount) throw new ApiError(404, "BRAND_NOT_FOUND", "No brand is set up for this restaurant.");
  return r.rows[0]!;
}

async function primaryOutlet(db: Db, tenantId: string, brandId: string) {
  const r = await db.query<OutletRow>(`SELECT ${OUTLET_COLUMNS} FROM outlets o WHERE o.tenant_id = $1 AND o.brand_id = $2 ORDER BY o.created_at LIMIT 1`, [tenantId, brandId]);
  return r.rows[0] ?? null;
}

export async function setupStatus(db: Db, tenantId: string): Promise<SetupStatus> {
  const brand = await primaryBrand(db, tenantId);
  const outlet = await primaryOutlet(db, tenantId, brand.id);
  const counts = await db.query<{ tenant_name: string; zones: number; categories: number; products: number }>(
    `SELECT (SELECT name FROM tenants WHERE id = $1) AS tenant_name,
            (SELECT count(*) FROM delivery_zones WHERE tenant_id = $1 AND status = 'ACTIVE') AS zones,
            (SELECT count(*) FROM categories c WHERE c.tenant_id = $1 AND c.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.status = 'ACTIVE')) AS categories,
            (SELECT count(*) FROM products WHERE tenant_id = $1 AND status = 'ACTIVE') AS products`, [tenantId]);
  const c = counts.rows[0]!;
  const address = outlet?.address ?? {};
  const hasHours = !!outlet && Object.values(outlet.hours ?? {}).some((ranges) => Array.isArray(ranges) && ranges.length > 0);
  const needsZones = outlet?.delivery_enabled ?? true;
  const steps: ChecklistStep[] = [
    { key: "business", label: "Business details", complete: !!c.tenant_name, blocker: null, href: "/settings" },
    { key: "brand", label: "Brand name, logo and links", complete: !!brand.name && !!brand.slug, blocker: null, href: "/settings/brand" },
    { key: "outlet", label: "Kitchen address and phone", complete: !!(outlet?.phone && address.line1 && address.postalCode), blocker: outlet?.phone && address.line1 && address.postalCode ? null : "Add the kitchen address, pincode and phone.", href: "/settings/outlet" },
    { key: "hours", label: "Opening hours", complete: hasHours, blocker: hasHours ? null : "Set at least one opening time.", href: "/settings/outlet" },
    { key: "delivery", label: "Delivery areas", complete: !needsZones || c.zones > 0, blocker: !needsZones || c.zones > 0 ? null : "Add a delivery area (or turn delivery off and offer pickup only).", href: "/delivery" },
    { key: "catalog", label: "Menu with at least one published item", complete: c.products > 0 && c.categories > 0, blocker: c.products > 0 ? null : "Publish at least one menu item.", href: "/catalog" },
    { key: "publish", label: "Publish your storefront", complete: brand.status === "ACTIVE", blocker: null, href: "/" },
  ];
  const done = steps.filter((s) => s.complete).length;
  return {
    steps,
    progress: Math.round((done / steps.length) * 100),
    published: brand.status === "ACTIVE",
    storefrontUrl: `${env().STOREFRONT_URL.replace(/\/$/, "")}${brand.status === "ACTIVE" ? "" : "?preview=1"}`,
  };
}

export async function settingsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/setup", { preValidation: requirePermission("tenant.read"), schema: { tags } }, async (req) => setupStatus(pool(), tenantOf(req).tenantId));

  r.get("/v1/admin/settings", { preValidation: requirePermission("tenant.read"), schema: { tags } }, async (req) => {
    const { tenantId } = tenantOf(req);
    const db = pool();
    const tenant = (await db.query<{ name: string; legal_name: string | null; locale: string; default_currency: string; primary_contact: Record<string, string>; metadata: Record<string, string> }>(
      `SELECT name, legal_name, locale, trim(default_currency) AS default_currency, primary_contact, metadata FROM tenants WHERE id = $1`, [tenantId])).rows[0]!;
    const brand = await primaryBrand(db, tenantId);
    const outlet = await primaryOutlet(db, tenantId, brand.id);
    const logo = await mediaUrlMap(db, [brand.logo_asset_id]);
    const m = brand.metadata ?? {};
    return {
      business: {
        businessName: tenant.name, legalName: tenant.legal_name ?? "", gstin: tenant.metadata?.gstin ?? "",
        contactName: tenant.primary_contact?.name ?? "", contactPhone: tenant.primary_contact?.phone ?? "", contactEmail: tenant.primary_contact?.email ?? "",
        currency: tenant.default_currency, locale: tenant.locale,
      },
      brand: {
        name: brand.name, slug: brand.slug, tagline: m.tagline ?? "", description: m.description ?? "", cuisines: m.cuisines ?? [],
        logoAssetId: brand.logo_asset_id, logoUrl: brand.logo_asset_id ? logo.get(brand.logo_asset_id) ?? null : null,
        primaryColor: m.primaryColor ?? "#b42318",
        links: { whatsapp: m.links?.whatsapp ?? "", swiggy: m.links?.swiggy ?? "", zomato: m.links?.zomato ?? "", instagram: m.links?.instagram ?? "", website: m.links?.website ?? "" },
        status: brand.status, publishedAt: iso(brand.published_at),
      },
      outlet: outlet ? {
        name: outlet.name, phone: outlet.phone ?? "",
        address: { line1: outlet.address.line1 ?? "", line2: outlet.address.line2 ?? "", city: outlet.address.city ?? "", region: outlet.address.region ?? "", postalCode: outlet.address.postalCode ?? "" },
        location: outlet.latitude !== null && outlet.longitude !== null ? { latitude: Number(outlet.latitude), longitude: Number(outlet.longitude) } : null,
        hours: outlet.hours ?? {}, timezone: outlet.timezone, acceptingOrders: outlet.accepting_orders, deliveryEnabled: outlet.delivery_enabled,
        pickupEnabled: outlet.pickup_enabled, defaultPrepMinutes: outlet.default_prep_minutes,
      } : null,
    };
  });

  r.put("/v1/admin/settings/business", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: BusinessSettingsSchema } }, async (req) => {
    const actor = actorOf(req);
    const b = req.body;
    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE tenants SET name = $2, legal_name = nullif($3, ''), default_currency = $4, locale = $5,
           primary_contact = $6, metadata = metadata || $7, updated_at = now() WHERE id = $1`,
        [actor.tenantId, b.businessName, b.legalName, b.currency, b.locale, JSON.stringify({ name: b.contactName, phone: b.contactPhone, email: b.contactEmail }), JSON.stringify({ gstin: b.gstin })]);
      await audit(tx, actor, "BusinessSettingsUpdated", { type: "Tenant", id: actor.tenantId }, { businessName: b.businessName });
    });
    return { ok: true };
  });

  r.put("/v1/admin/settings/brand", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: BrandSettingsSchema } }, async (req) => {
    const actor = actorOf(req);
    const b = req.body;
    await withTransaction(async (tx) => {
      const brand = await primaryBrand(tx, actor.tenantId);
      if (b.slug !== brand.slug) {
        const taken = await tx.query(`SELECT 1 FROM brands WHERE slug = $1 AND id <> $2`, [b.slug, brand.id]);
        if (taken.rowCount) throw new ApiError(409, "SLUG_TAKEN", "That web address is already taken.", { fields: { slug: "Already taken." } });
      }
      if (b.logoAssetId) {
        const asset = await tx.query(`SELECT 1 FROM media_assets WHERE id = $1 AND tenant_id = $2`, [b.logoAssetId, actor.tenantId]);
        if (!asset.rowCount) throw new ApiError(422, "MEDIA_NOT_FOUND", "Upload the logo again.");
      }
      await tx.query(
        `UPDATE brands SET name = $2, slug = $3, logo_asset_id = $4, metadata = $5, updated_at = now() WHERE id = $1`,
        [brand.id, b.name, b.slug, b.logoAssetId ?? null, JSON.stringify({ ...(brand.metadata ?? {}), tagline: b.tagline, description: b.description, cuisines: b.cuisines, primaryColor: b.primaryColor, links: b.links })]);
      await audit(tx, actor, "BrandSettingsUpdated", { type: "Brand", id: brand.id }, { slugChanged: b.slug !== brand.slug, slug: b.slug });
    });
    return { ok: true };
  });

  r.put("/v1/admin/settings/outlet", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: OutletSettingsSchema } }, async (req) => {
    const actor = actorOf(req);
    const o = req.body;
    await withTransaction(async (tx) => {
      const brand = await primaryBrand(tx, actor.tenantId);
      const outlet = await primaryOutlet(tx, actor.tenantId, brand.id);
      if (!outlet) throw new ApiError(404, "OUTLET_NOT_FOUND", "No outlet is set up.");
      await tx.query(
        `UPDATE outlets SET name = $2, phone = $3, address = $4, latitude = $5, longitude = $6, hours = $7, accepting_orders = $8,
           delivery_enabled = $9, pickup_enabled = $10, default_prep_minutes = $11, updated_at = now() WHERE id = $1`,
        [outlet.id, o.name, o.phone, JSON.stringify(o.address), o.location?.latitude ?? null, o.location?.longitude ?? null, JSON.stringify(o.hours),
          o.acceptingOrders, o.deliveryEnabled, o.pickupEnabled, o.defaultPrepMinutes]);
      const changes: Record<string, unknown> = {};
      if (outlet.accepting_orders !== o.acceptingOrders) changes.acceptingOrders = o.acceptingOrders;
      if (outlet.delivery_enabled !== o.deliveryEnabled) changes.deliveryEnabled = o.deliveryEnabled;
      if (outlet.pickup_enabled !== o.pickupEnabled) changes.pickupEnabled = o.pickupEnabled;
      await audit(tx, actor, "OutletSettingsUpdated", { type: "Outlet", id: outlet.id }, changes);
    });
    return { ok: true };
  });

  /** Quick pause/resume of online ordering from the order board. */
  r.post("/v1/admin/settings/accepting-orders", { preValidation: requirePermission("order.manage"), schema: { tags, body: z.object({ acceptingOrders: z.boolean() }) } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const brand = await primaryBrand(tx, actor.tenantId);
      const updated = await tx.query<{ id: string }>(`UPDATE outlets SET accepting_orders = $3, updated_at = now() WHERE tenant_id = $1 AND brand_id = $2 RETURNING id`, [actor.tenantId, brand.id, req.body.acceptingOrders]);
      await audit(tx, actor, req.body.acceptingOrders ? "OrderingResumed" : "OrderingPaused", { type: "Outlet", id: updated.rows[0]?.id ?? null });
    });
    return { acceptingOrders: req.body.acceptingOrders };
  });

  r.post("/v1/admin/publish", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: z.object({ published: z.boolean() }) } }, async (req) => {
    const actor = actorOf(req);
    return withTransaction(async (tx) => {
      const brand = await primaryBrand(tx, actor.tenantId);
      if (req.body.published) {
        const status = await setupStatus(tx, actor.tenantId);
        const blockers = status.steps.filter((s) => s.key !== "publish" && !s.complete);
        if (blockers.length) throw new ApiError(422, "SETUP_INCOMPLETE", "Finish these steps before publishing.", { blockers: blockers.map((b) => ({ key: b.key, label: b.label, blocker: b.blocker })) });
        const clash = await tx.query(`SELECT 1 FROM brands WHERE slug = $1 AND status = 'ACTIVE' AND id <> $2`, [brand.slug, brand.id]);
        if (clash.rowCount) throw new ApiError(409, "SLUG_TAKEN", "Another live restaurant uses this web address. Change it in brand settings.");
      }
      await tx.query(
        `UPDATE brands SET status = $2::business_object_status, published_at = CASE WHEN $3 THEN coalesce(published_at, now()) ELSE published_at END, updated_at = now() WHERE id = $1`,
        [brand.id, req.body.published ? "ACTIVE" : "DRAFT", req.body.published]);
      await audit(tx, actor, req.body.published ? "StorefrontPublished" : "StorefrontUnpublished", { type: "Brand", id: brand.id });
      return setupStatus(tx, actor.tenantId);
    });
  });
}
