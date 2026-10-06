// Share card (PRD 5.13 "share cards"), generated from brand data.
import { ImageResponse } from "next/og";
import { getConfig, safeColor } from "@/lib/store";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Order online";
// Rendered per request (data comes from the API, cached at the fetch level), never baked in at build time.
export const dynamic = "force-dynamic";

export default async function OpenGraphImage() {
  const config = await getConfig();
  const color = safeColor(config.primaryColor);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: color, color: "white", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 28, opacity: 0.9, display: "flex" }}>{config.cuisines.join(" · ") || "Order online"}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.05 }}>{config.name}</div>
          {config.tagline && <div style={{ fontSize: 36, marginTop: 20, opacity: 0.92 }}>{config.tagline}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, background: "white", color, padding: "16px 28px", borderRadius: 16, alignSelf: "flex-start" }}>Order direct →</div>
      </div>
    ),
    size,
  );
}
