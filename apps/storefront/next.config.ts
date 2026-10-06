import path from "node:path";
import type { NextConfig } from "next";

// Images are served from the API (local storage) or an S3-compatible bucket; only those hosts are optimised.
const mediaHosts = [process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000", ...(process.env.MEDIA_PUBLIC_BASE_URLS ?? "").split(",")]
  .map((value) => value.trim())
  .filter(Boolean)
  .flatMap((value) => {
    try {
      const url = new URL(value);
      return [{ protocol: url.protocol.replace(":", "") as "http" | "https", hostname: url.hostname, port: url.port, pathname: "/**" }];
    } catch {
      return [];
    }
  });

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // Standalone output for the container image; tracing from the monorepo root picks up workspace packages.
  output: "standalone",
  // Optional separate build directory (used by the recording harness); default is unchanged.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@restaurant-os/ui", "@restaurant-os/types", "@restaurant-os/domain"],
  images: { remotePatterns: mediaHosts, formats: ["image/avif", "image/webp"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
