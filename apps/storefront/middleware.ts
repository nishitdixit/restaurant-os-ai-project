import { NextResponse, type NextRequest } from "next/server";

// ?preview=1 lets a merchant browse an unpublished storefront; ?preview=0 ends the preview.
export function middleware(request: NextRequest) {
  const preview = request.nextUrl.searchParams.get("preview");
  if (preview !== "1" && preview !== "0") return NextResponse.next();
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
  response.cookies.set("ros_preview", preview === "1" ? "1" : "", preview === "1" ? attributes : { ...attributes, maxAge: 0 });
  return response;
}

export const config = { matcher: ["/((?!_next|favicon|robots.txt|sitemap.xml|opengraph-image).*)"] };
