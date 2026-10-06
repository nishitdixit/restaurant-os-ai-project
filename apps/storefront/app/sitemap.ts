// Sitemap generated from the live catalog, so a newly published item is listed without code changes
// (specs/seo acceptance).
import type { MetadataRoute } from "next";
import { serverGet } from "@/lib/api";
import { SITE_URL, storeSlug } from "@/lib/store";

interface SitemapData {
  updatedAt: string | null;
  categories: { slug: string; updatedAt: string | null }[];
  products: { slug: string; updatedAt: string | null }[];
}

// Rendered per request (data comes from the API, cached at the fetch level), never baked in at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slug = await storeSlug();
  const data = await serverGet<SitemapData>(`/v1/storefront/${slug}/sitemap`, 300).catch(() => null);
  if (!data) return [];
  const at = (iso: string | null) => (iso ? new Date(iso) : new Date());
  return [
    { url: SITE_URL, lastModified: at(data.updatedAt), changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/menu`, lastModified: at(data.updatedAt), changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/offers`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/delivery-areas`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    ...data.categories.map((c) => ({ url: `${SITE_URL}/${c.slug}`, lastModified: at(c.updatedAt), changeFrequency: "weekly" as const, priority: 0.7 })),
    ...data.products.map((p) => ({ url: `${SITE_URL}/menu/${p.slug}`, lastModified: at(p.updatedAt), changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
