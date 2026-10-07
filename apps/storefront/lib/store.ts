// Tenant resolution for the public site (docs/TENANCY.md): each storefront deployment serves the brand
// configured in NEXT_PUBLIC_STORE_BRAND_SLUG. Custom-domain mapping is a V1 feature (backlog P1) and is not
// enabled until domain verification proves DNS ownership.
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { defaultExperience } from "@restaurant-os/domain";
import type { Menu, StoreConfig } from "@restaurant-os/types";
import { serverGet } from "./api";

const DEFAULT_SLUG = process.env.NEXT_PUBLIC_STORE_BRAND_SLUG ?? "pilot";
export { SITE_URL } from "./site";

// Storefront pages render per request (live menu, availability and opening state); connection() opts out of
// build-time prerendering, which previously happened implicitly by reading the request host.
export const storeSlug = cache(async (): Promise<string> => {
  await connection();
  return DEFAULT_SLUG;
});

/**
 * The signed merchant preview token (set by middleware from ?preview=<token>, issued by the admin). Its validity is
 * decided by the API, never here: a forged or expired token simply gets the public view.
 */
const previewToken = cache(async (): Promise<string | null> => {
  const value = (await cookies()).get("ros_preview")?.value;
  return value && /^[A-Za-z0-9_.-]{20,400}$/.test(value) ? value : null;
});

/** Query string that asks the API for the merchant preview ("" for customers). */
export async function previewQuery(): Promise<string> {
  const token = await previewToken();
  return token ? `?preview=${encodeURIComponent(token)}` : "";
}

/** Store config, including unpublished stores so the layout can show "coming soon" or a preview banner. */
export const getConfig = cache(async (): Promise<StoreConfig> => {
  const slug = await storeSlug();
  // A merchant preview shows the saved draft look and layout immediately (no cache); customers get the published one.
  const pq = await previewQuery();
  const config = await serverGet<StoreConfig>(`/v1/storefront/${slug}/config${pq}`, pq ? 0 : 30);
  if (!config) notFound();
  // Tolerate a cached response from an older API version (e.g. right after a deploy): fill the newer fields.
  return {
    ...config,
    experience: config.experience ?? defaultExperience(),
    media: config.media ?? {},
    stats: config.stats ?? { paidOrders: null },
    credentials: config.credentials ?? { legalName: "", fssai: "", gstin: "" },
    policies: config.policies ?? [],
    preview: config.preview ?? false,
    deliveryAreas: (config.deliveryAreas ?? []).map((a) => ({ ...a, freeDeliveryMinimumMinor: a.freeDeliveryMinimumMinor ?? null })),
  };
});

/** True only for a preview the API has verified. Never indexed. */
export const isPreview = cache(async (): Promise<boolean> => (await getConfig()).preview);

export const getMenu = cache(async (): Promise<Menu> => {
  const slug = await storeSlug();
  const pq = await previewQuery();
  const menu = (await serverGet<Menu>(`/v1/storefront/${slug}/menu${pq}`, pq ? 0 : 15)) ?? { categories: [], bestsellerIds: [] };
  // Same tolerance for older cached menu responses.
  return {
    bestsellerIds: menu.bestsellerIds ?? [],
    categories: menu.categories.map((c) => ({
      ...c, nameHi: c.nameHi ?? "", descriptionHi: c.descriptionHi ?? "", imageUrl: c.imageUrl ?? null,
      products: c.products.map((p) => ({ ...p, nameHi: p.nameHi ?? "", descriptionHi: p.descriptionHi ?? "", badges: p.badges ?? [], bestseller: p.bestseller ?? false, gallery: p.gallery ?? [] })),
    })),
  };
});

/** Brand colour from merchant data, accepted only as a 6-digit hex to keep CSS injection impossible. */
export function safeColor(value: string | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#b42318";
}

export function whatsappUrl(number: string, text?: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function mapsUrl(config: StoreConfig): string | null {
  const o = config.outlet;
  if (!o) return null;
  if (o.location) return `https://www.google.com/maps/search/?api=1&query=${o.location.latitude},${o.location.longitude}`;
  const q = [config.name, o.address.line1, o.address.city, o.address.postalCode].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
