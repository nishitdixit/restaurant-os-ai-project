import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { Providers } from "@/components/providers";
import { contrastColor, getConfig, isPreview, safeColor, SITE_URL } from "@/lib/store";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  const preview = await isPreview();
  const description = config.description || config.tagline || `Order directly from ${config.name}.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${config.name} — Order online direct`, template: `%s · ${config.name}` },
    description,
    applicationName: config.name,
    alternates: { canonical: "/" },
    openGraph: { siteName: config.name, type: "website", locale: "en_IN", title: config.name, description, url: SITE_URL },
    twitter: { card: "summary_large_image", title: config.name, description },
    robots: config.published && !preview ? { index: true, follow: true } : { index: false, follow: false },
    icons: config.logoUrl ? { icon: config.logoUrl } : undefined,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const config = await getConfig();
  return { themeColor: safeColor(config.primaryColor), width: "device-width", initialScale: 1 };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const config = await getConfig();
  const preview = await isPreview();
  const color = safeColor(config.primaryColor);
  const style = { "--brand-primary": color, "--brand-primary-contrast": contrastColor(color) } as CSSProperties;
  const o = config.outlet;
  const canOrder = config.published && !!o && o.acceptingOrders && o.openNow;

  if (!config.published && !preview) {
    return (
      <html lang="en-IN" style={style}>
        <body suppressHydrationWarning>
          <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">Coming soon</p>
            <h1 className="text-3xl font-semibold">{config.name}</h1>
            <p className="max-w-md text-muted">Our online ordering is being set up. Please check back shortly.</p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="en-IN" style={style}>
      <body suppressHydrationWarning className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
        <Providers store={{ slug: config.slug, name: config.name, currency: config.currency, canOrder }}>
          {preview && (
            <div className="bg-warning px-4 py-2 text-center text-sm font-medium text-white">
              Preview — {config.published ? "this is your live storefront" : "not published yet; customers can't see this"}. <Link href="/?preview=0" prefetch={false} className="underline">Exit preview</Link>
            </div>
          )}
          <SiteHeader config={config} />
          <main id="main" className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10">{children}</main>
          <SiteFooter config={config} />
        </Providers>
      </body>
    </html>
  );
}
