// Public store context: tenant resolved from a verified brand slug (docs/TENANCY.md).
import { classicTheme, defaultExperience, isOpenAt, nextOpening, normalizeExperience, normalizeTheme, type OpeningHours, type StoreExperience, type StoreTheme } from "@restaurant-os/domain";
import type { BrandLinks } from "@restaurant-os/types";
import type { Db } from "../../db/pool.ts";
import { ApiError } from "../../lib/errors.ts";

export interface OutletRow {
  id: string;
  name: string;
  phone: string | null;
  timezone: string;
  address: { line1?: string; line2?: string; city?: string; region?: string; postalCode?: string };
  hours: OpeningHours;
  latitude: number | null;
  longitude: number | null;
  accepting_orders: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  default_prep_minutes: number;
}

export interface BrandMetadata {
  tagline?: string;
  description?: string;
  cuisines?: string[];
  primaryColor?: string;
  links?: Partial<BrandLinks>;
}

export interface StoreContext {
  tenantId: string;
  brandId: string;
  slug: string;
  name: string;
  currency: string;
  locale: string;
  metadata: BrandMetadata;
  theme: unknown;
  themeDraft: unknown;
  experience: unknown;
  experienceDraft: unknown;
  policies: Record<string, unknown>;
  legalName: string;
  tenantMetadata: { gstin?: string; fssai?: string };
  logoAssetId: string | null;
  updatedAt: Date;
  published: boolean;
  outlet: OutletRow | null;
}

export const OUTLET_COLUMNS = `o.id, o.name, o.phone, o.timezone, o.address, o.hours, o.latitude, o.longitude, o.accepting_orders,
  o.pickup_enabled, o.delivery_enabled, o.default_prep_minutes`;

export async function loadStore(db: Db, slug: string, options: { allowDraft?: boolean } = {}): Promise<StoreContext> {
  const r = await db.query<{
    tenant_id: string; brand_id: string; slug: string; name: string; currency: string; locale: string; metadata: BrandMetadata;
    logo_asset_id: string | null; updated_at: Date; status: string; theme: unknown; theme_draft: unknown;
    experience: unknown; experience_draft: unknown; policies: Record<string, unknown> | null; legal_name: string | null; tenant_metadata: StoreContext["tenantMetadata"] | null;
  }>(
    `SELECT b.tenant_id, b.id AS brand_id, b.slug, b.name, t.default_currency AS currency, t.locale, b.metadata, b.logo_asset_id, b.updated_at, b.status, b.theme, b.theme_draft,
       b.experience, b.experience_draft, b.policies, t.legal_name, t.metadata AS tenant_metadata
     FROM brands b JOIN tenants t ON t.id = b.tenant_id AND t.status = 'ACTIVE'
     WHERE b.slug = $1 AND ${options.allowDraft ? "b.status IN ('ACTIVE','DRAFT')" : "b.status = 'ACTIVE'"}
     ORDER BY (b.status = 'ACTIVE') DESC LIMIT 1`,
    [slug],
  );
  const brand = r.rows[0];
  if (!brand) throw new ApiError(404, "STORE_NOT_FOUND", "This restaurant could not be found.");
  const outlet = await db.query<OutletRow>(
    `SELECT ${OUTLET_COLUMNS} FROM outlets o WHERE o.tenant_id = $1 AND o.brand_id = $2 AND o.status = 'ACTIVE' ORDER BY o.created_at LIMIT 1`,
    [brand.tenant_id, brand.brand_id],
  );
  return {
    tenantId: brand.tenant_id,
    brandId: brand.brand_id,
    slug: brand.slug,
    name: brand.name,
    currency: brand.currency.trim(),
    locale: brand.locale,
    metadata: brand.metadata ?? {},
    theme: brand.theme,
    themeDraft: brand.theme_draft,
    experience: brand.experience,
    experienceDraft: brand.experience_draft,
    policies: brand.policies ?? {},
    legalName: brand.legal_name ?? "",
    tenantMetadata: brand.tenant_metadata ?? {},
    logoAssetId: brand.logo_asset_id,
    updatedAt: brand.updated_at,
    published: brand.status === "ACTIVE",
    outlet: outlet.rows[0] ?? null,
  };
}

export function outletOpenState(outlet: OutletRow | null, now = new Date()) {
  if (!outlet) return { openNow: false, nextOpening: null as string | null };
  const openNow = isOpenAt(outlet.hours, now, outlet.timezone);
  return { openNow, nextOpening: openNow ? null : nextOpening(outlet.hours, now, outlet.timezone) };
}

export function outletLocation(outlet: OutletRow | null) {
  return outlet && outlet.latitude !== null && outlet.longitude !== null ? { latitude: Number(outlet.latitude), longitude: Number(outlet.longitude) } : null;
}

export function brandLinks(metadata: BrandMetadata): BrandLinks {
  const l = metadata.links ?? {};
  return { whatsapp: l.whatsapp ?? "", swiggy: l.swiggy ?? "", zomato: l.zomato ?? "", instagram: l.instagram ?? "", website: l.website ?? "" };
}

/** The theme a brand renders with: its published theme, or the classic look in its existing brand colour. */
export function publishedTheme(row: { theme: unknown; metadata: BrandMetadata | null }): StoreTheme {
  const base = classicTheme(row.metadata?.primaryColor);
  return row.theme ? normalizeTheme(row.theme, base) : base;
}

/** The experience a brand renders with: its published experience, or the default composition. */
export function publishedExperience(row: { experience: unknown }): StoreExperience {
  return row.experience ? normalizeExperience(row.experience) : defaultExperience();
}
