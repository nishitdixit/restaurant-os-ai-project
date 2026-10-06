import type { MetadataRoute } from "next";
import { getConfig, SITE_URL } from "@/lib/store";

// Rendered per request (data comes from the API, cached at the fetch level), never baked in at build time.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = await getConfig().catch(() => null);
  if (!config?.published) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/checkout", "/order/", "/search"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
