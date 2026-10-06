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
  if (preview === "1") response.cookies.set("ros_preview", "1", { httpOnly: true, sameSite: "lax", path: "/" });
  else response.cookies.delete("ros_preview");
  return response;
}

export const config = { matcher: ["/((?!_next|favicon|robots.txt|sitemap.xml|opengraph-image).*)"] };
