// Tenant resolution for the public site (docs/TENANCY.md): each storefront deployment serves the brand
// configured in NEXT_PUBLIC_STORE_BRAND_SLUG. Custom-domain mapping is a V1 feature (backlog P1) and is not
// enabled until domain verification proves DNS ownership.
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
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

/** Merchant preview of an unpublished storefront; set by middleware from ?preview=1. Never indexed. */
export const isPreview = cache(async (): Promise<boolean> => (await cookies()).get("ros_preview")?.value === "1");

/** Store config, including unpublished stores so the layout can show "coming soon" or a preview banner. */
export const getConfig = cache(async (): Promise<StoreConfig> => {
  const slug = await storeSlug();
  // A merchant preview shows the saved draft theme immediately (no cache); customers get the published one.
  const preview = await isPreview();
  const config = await serverGet<StoreConfig>(`/v1/storefront/${slug}/config?preview=1${preview ? "&theme=draft" : ""}`, preview ? 0 : 30);
  if (!config) notFound();
  return config;
});

export async function previewQuery(): Promise<string> {
  return (await isPreview()) ? "?preview=1" : "";
}

export const getMenu = cache(async (): Promise<Menu> => {
  const slug = await storeSlug();
  const preview = await isPreview();
  return (await serverGet<Menu>(`/v1/storefront/${slug}/menu${preview ? "?preview=1" : ""}`, preview ? 0 : 15)) ?? { categories: [] };
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
