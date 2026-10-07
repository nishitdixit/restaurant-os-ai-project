// Merchant preview links (ADR-013). An unpublished store, its draft dishes and draft look are visible only with a
// short-lived token the admin issues to signed-in staff: HMAC-SHA256 over "<brand slug>.<expiry>". Anyone without
// a valid token sees exactly what customers see.
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.ts";

function sign(payload: string): string {
  return createHmac("sha256", env().PREVIEW_SECRET).update(payload).digest("base64url");
}

export function issuePreviewToken(brandSlug: string, now = Date.now()): { token: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + env().PREVIEW_TTL_MINUTES * 60;
  const payload = `${brandSlug}.${exp}`;
  return { token: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** True when `token` is a valid, unexpired preview token for `brandSlug`. */
export function verifyPreviewToken(token: string | undefined | null, brandSlug: string, now = Date.now()): boolean {
  if (!token || token.length > 400) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  let payload: string;
  try { payload = Buffer.from(encoded, "base64url").toString("utf8"); } catch { return false; }
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const dot = payload.lastIndexOf(".");
  const slug = payload.slice(0, dot);
  const exp = Number(payload.slice(dot + 1));
  return slug === brandSlug && Number.isFinite(exp) && exp * 1000 > now;
}
