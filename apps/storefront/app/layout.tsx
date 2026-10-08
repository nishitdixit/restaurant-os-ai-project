import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { RevealObserver } from "@/components/motion";
import { Providers } from "@/components/providers";
import { ThemePreviewBridge } from "@/components/theme-preview";
import { ALL_FONT_CLASSES } from "@/lib/fonts";
import { freeDeliveryFrom, lowestFee, media, whatsappNumber } from "@/lib/experience";
import type { StoreConfig } from "@restaurant-os/types";

function deliveryHint(config: StoreConfig) {
  const thresholds = new Set(config.deliveryAreas.map((a) => a.freeDeliveryMinimumMinor));
  return {
    enabled: !!config.outlet?.deliveryEnabled && config.deliveryAreas.length > 0,
    lowestFeeMinor: lowestFee(config),
    freeFromMinor: freeDeliveryFrom(config),
    sameFreeThresholdEverywhere: thresholds.size === 1,
  };
}
import { storeTheme, themeHtmlProps } from "@/lib/theme";
import { getConfig, SITE_URL } from "@/lib/store";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  const seo = config.experience.seo;
  const description = seo.description || config.description || config.tagline || `Order directly from ${config.name}.`;
  const share = media(config, seo.shareImageId);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: seo.title || `${config.name} — Order online direct`, template: `%s · ${config.name}` },
    description,
    applicationName: config.name,
    alternates: { canonical: "/" },
    openGraph: { siteName: config.name, type: "website", locale: "en_IN", title: seo.title || config.name, description, url: SITE_URL, ...(share ? { images: [{ url: share.url, alt: share.alt }] } : {}) },
    twitter: { card: "summary_large_image", title: seo.title || config.name, description },
    robots: config.published && !config.preview ? { index: true, follow: true } : { index: false, follow: false },
    icons: config.logoUrl ? { icon: config.logoUrl } : undefined,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const config = await getConfig();
  return { themeColor: storeTheme(config).colors.headerBackground, width: "device-width", initialScale: 1 };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const config = await getConfig();
  const preview = config.preview;
  const theme = storeTheme(config);
  // Theme + experience tokens as CSS variables and variant data attributes; every theme font is declared (only used ones download).
  const html = { lang: config.experience.site.language === "hi" ? "hi-IN" : "en-IN", className: ALL_FONT_CLASSES, ...themeHtmlProps(theme, config.experience) };
  const o = config.outlet;
  const canOrder = config.published && !!o && o.acceptingOrders && o.openNow;

  if (!config.published && !preview) {
    return (
      <html {...html}>
        <body suppressHydrationWarning>
          <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-link">Coming soon</p>
            <h1 className="text-3xl ros-heading">{config.name}</h1>
            <p className="max-w-md text-muted">Our online ordering is being set up. Please check back shortly.</p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html {...html}>
      <body suppressHydrationWarning className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
        <Providers store={{ slug: config.slug, name: config.name, currency: config.currency, canOrder, language: config.experience.site.language, showBadges: config.experience.menu.showBadges, whatsapp: config.experience.site.whatsappOrdering ? whatsappNumber(config.links.whatsapp) : null, delivery: deliveryHint(config) }} mode={theme.mode}>
          {preview && <ThemePreviewBridge />}
          <RevealObserver />
          {preview && (
            <div className="bg-warning px-4 py-2 text-center text-sm font-medium text-white theme-dark:text-black">
              Preview — {config.published ? "you're seeing your saved changes; customers see them after you publish" : "not published yet; customers can't see this"}. <Link href="/?preview=0" prefetch={false} className="underline">Exit preview</Link>
            </div>
          )}
          <SiteHeader config={config} />
          <main id="main">{children}</main>
          <SiteFooter config={config} />
        </Providers>
      </body>
    </html>
  );
}
