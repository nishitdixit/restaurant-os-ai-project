// Signed merchant preview links for E2E (same format as apps/api/src/lib/preview.ts; the API under test must use the
// same PREVIEW_SECRET — the development default unless E2E_PREVIEW_SECRET/PREVIEW_SECRET is set).
import { createHmac } from "node:crypto";

export function previewToken(brandSlug = "pilot", ttlMinutes = 60): string {
  const secret = process.env.E2E_PREVIEW_SECRET ?? process.env.PREVIEW_SECRET ?? "restaurant-os-preview-secret-dev";
  const payload = `${brandSlug}.${Math.floor(Date.now() / 1000) + ttlMinutes * 60}`;
  return `${Buffer.from(payload).toString("base64url")}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

/** Path that switches the browser into merchant preview (middleware stores the token in a cookie). */
export const previewPath = (path = "/", slug = "pilot") => `${path}${path.includes("?") ? "&" : "?"}preview=${previewToken(slug)}`;
