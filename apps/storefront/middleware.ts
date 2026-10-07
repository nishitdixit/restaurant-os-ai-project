import { NextResponse, type NextRequest } from "next/server";

// ?preview=<signed token> (links from the admin) lets a merchant browse an unpublished storefront and the draft look;
// ?preview=0 ends the preview. The token is only stored here — the API decides whether it is valid.
const TOKEN = /^[A-Za-z0-9_.-]{20,400}$/;

export function middleware(request: NextRequest) {
  const preview = request.nextUrl.searchParams.get("preview");
  if (preview === null || (preview !== "0" && !TOKEN.test(preview))) return NextResponse.next();
  // Link prefetches must never change the preview state; only a real navigation does.
  const h = request.headers;
  if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.searchParams.delete("preview");
  const response = NextResponse.redirect(url);
  // Over HTTPS the cookie is partitioned + SameSite=None so the preview also works inside the admin's iframe
  // (a different site in production); locally the admin and storefront are the same site, so Lax is enough.
  const secure = request.nextUrl.protocol === "https:";
  const attributes = secure ? { httpOnly: true, sameSite: "none" as const, secure: true, partitioned: true, path: "/" } : { httpOnly: true, sameSite: "lax" as const, path: "/" };
  // Clearing must repeat the same attributes, or a partitioned cookie would survive.
  const on = preview !== "0";
  response.cookies.set("ros_preview", on ? preview : "", on ? { ...attributes, maxAge: 12 * 60 * 60 } : { ...attributes, maxAge: 0 });
  return response;
}

export const config = { matcher: ["/((?!_next|favicon|robots.txt|sitemap.xml|opengraph-image).*)"] };
