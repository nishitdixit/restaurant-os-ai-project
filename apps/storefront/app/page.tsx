import Link from "next/link";
import Image from "next/image";
import { Bike, Clock, MapPin, ShoppingBag, Tag } from "lucide-react";
import { buttonClass, formatMoney } from "@restaurant-os/ui";
import type { PublicOffer } from "@restaurant-os/types";
import { etaText, JsonLd, StoreStatusBanner } from "@/components/basics";
import { ProductCard } from "@/components/product-card";
import { serverGet } from "@/lib/api";
import { restaurantJsonLd } from "@/lib/seo";
import { getConfig, getMenu, previewQuery, storeSlug, whatsappUrl } from "@/lib/store";

export default async function HomePage() {
  const [config, menu, slug, pq] = await Promise.all([getConfig(), getMenu(), storeSlug(), previewQuery()]);
  const offers = (await serverGet<{ items: PublicOffer[] }>(`/v1/storefront/${slug}/offers${pq}`, 60))?.items ?? [];
  const eta = etaText(config);
  const popular = menu.categories.flatMap((c) => c.products).filter((p) => p.available).slice(0, 6);
  const wa = whatsappUrl(config.links.whatsapp, `Hi ${config.name}, I'd like to place an order.`);
  const minFee = config.deliveryAreas.length ? Math.min(...config.deliveryAreas.map((a) => a.feeMinor)) : null;

  return (
    <>
      <JsonLd data={restaurantJsonLd(config)} />
      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-primary to-[color-mix(in_srgb,var(--brand-primary)_70%,black)] p-6 text-primary-contrast shadow-[var(--shadow-md)] sm:p-10">
        <div className="flex items-start gap-4">
          {config.logoUrl && <Image src={config.logoUrl} alt="" width={64} height={64} className="hidden size-16 rounded-2xl bg-white object-cover sm:block" priority />}
          <div className="min-w-0">
            {config.cuisines.length > 0 && <p className="text-sm font-medium opacity-90">{config.cuisines.join(" · ")}</p>}
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{config.name}</h1>
            {config.tagline && <p className="mt-2 max-w-xl text-base opacity-90 sm:text-lg">{config.tagline}</p>}
          </div>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm opacity-95">
          {config.outlet && <li className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden />{config.outlet.openNow ? "Open now" : config.outlet.nextOpening ? `Opens ${config.outlet.nextOpening}` : "Closed"}</li>}
          {eta && <li className="inline-flex items-center gap-1.5"><Bike className="size-4" aria-hidden />{eta}</li>}
          {minFee !== null && <li className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />Delivery from {formatMoney(minFee, config.currency)}</li>}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/menu" className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-md)] bg-white px-6 text-base font-semibold text-[var(--brand-primary)] shadow-[var(--shadow-sm)] hover:bg-white/90">
            <ShoppingBag className="size-5" aria-hidden />Order direct
          </Link>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center rounded-[var(--radius-md)] border border-white/40 px-5 text-sm font-medium hover:bg-white/10">Order on WhatsApp</a>}
          {config.links.swiggy && <a href={config.links.swiggy} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center rounded-[var(--radius-md)] border border-white/40 px-5 text-sm font-medium hover:bg-white/10">Swiggy</a>}
          {config.links.zomato && <a href={config.links.zomato} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center rounded-[var(--radius-md)] border border-white/40 px-5 text-sm font-medium hover:bg-white/10">Zomato</a>}
        </div>
      </section>

      <div className="mt-4"><StoreStatusBanner config={config} /></div>

      {offers.length > 0 && (
        <section aria-labelledby="offers-heading" className="mt-8">
          <h2 id="offers-heading" className="sr-only">Offers</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {offers.map((offer) => (
              <li key={offer.code} className="flex min-w-[260px] items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-primary/40 bg-primary-soft px-4 py-3">
                <Tag className="size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="font-semibold text-text">{offer.title}</p>
                  <p className="text-sm text-muted">Use <span className="font-mono font-semibold text-text">{offer.code}</span> · {offer.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {menu.categories.length > 0 && (
        <section aria-labelledby="categories-heading" className="mt-10">
          <h2 id="categories-heading" className="text-xl font-semibold">Browse the menu</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {menu.categories.map((c) => (
              <li key={c.id}>
                <Link href={`/${c.slug}`} className="flex h-full flex-col justify-between rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)] hover:border-primary/40">
                  <span className="font-semibold">{c.name}</span>
                  <span className="mt-2 text-sm text-muted">{c.products.length} item{c.products.length === 1 ? "" : "s"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {popular.length > 0 && (
        <section aria-labelledby="popular-heading" className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <h2 id="popular-heading" className="text-xl font-semibold">Popular right now</h2>
            <Link href="/menu" className="text-sm font-medium text-primary hover:underline">See full menu</Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {popular.map((p, i) => <ProductCard key={p.id} product={p} currency={config.currency} priority={i < 2} />)}
          </div>
        </section>
      )}

      {config.description && (
        <section aria-labelledby="about-heading" className="mt-10 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
          <h2 id="about-heading" className="text-xl font-semibold">About {config.name}</h2>
          <p className="mt-2 max-w-3xl leading-relaxed text-muted">{config.description}</p>
          <Link href="/contact" className={buttonClass("outline", "md", "mt-4")}>Hours &amp; location</Link>
        </section>
      )}
    </>
  );
}
