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
      {/* Hero style comes from the theme: gradient (default), solid brand colour, or minimal (on a card). */}
      <section className="overflow-hidden rounded-[var(--ros-radius-xl)] bg-[linear-gradient(135deg,var(--ros-hero-from),var(--ros-hero-to))] p-6 text-primary-contrast shadow-[var(--ros-shadow-md)] sm:p-10 hero-solid:bg-primary hero-solid:bg-none hero-minimal:ros-card hero-minimal:bg-none hero-minimal:text-text">
        <div className="flex items-start gap-4">
          {config.logoUrl && <Image src={config.logoUrl} alt="" width={64} height={64} className="hidden size-16 rounded-image bg-white object-cover sm:block" priority />}
          <div className="min-w-0">
            {config.cuisines.length > 0 && <p className="text-sm font-medium opacity-90">{config.cuisines.join(" · ")}</p>}
            <h1 className="mt-1 text-3xl ros-heading sm:text-4xl">{config.name}</h1>
            {config.tagline && <p className="mt-2 max-w-xl text-base opacity-90 sm:text-lg">{config.tagline}</p>}
          </div>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm opacity-95">
          {config.outlet && <li className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden />{config.outlet.openNow ? "Open now" : config.outlet.nextOpening ? `Opens ${config.outlet.nextOpening}` : "Closed"}</li>}
          {eta && <li className="inline-flex items-center gap-1.5"><Bike className="size-4" aria-hidden />{eta}</li>}
          {minFee !== null && <li className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />Delivery from {formatMoney(minFee, config.currency)}</li>}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/menu" className="ros-button-text inline-flex h-12 items-center gap-2 rounded-button bg-surface px-6 text-base font-semibold text-link shadow-[var(--ros-shadow-sm)] hover:brightness-95 hero-minimal:ros-btn-primary">
            <ShoppingBag className="size-5" aria-hidden />Order direct
          </Link>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="ros-button-text inline-flex h-12 items-center rounded-button border border-current/40 px-5 text-sm font-medium hover:bg-current/10 hero-minimal:border-border-strong">Order on WhatsApp</a>}
          {config.links.swiggy && <a href={config.links.swiggy} target="_blank" rel="noopener noreferrer" className="ros-button-text inline-flex h-12 items-center rounded-button border border-current/40 px-5 text-sm font-medium hover:bg-current/10 hero-minimal:border-border-strong">Swiggy</a>}
          {config.links.zomato && <a href={config.links.zomato} target="_blank" rel="noopener noreferrer" className="ros-button-text inline-flex h-12 items-center rounded-button border border-current/40 px-5 text-sm font-medium hover:bg-current/10 hero-minimal:border-border-strong">Zomato</a>}
        </div>
      </section>

      <div className="mt-4"><StoreStatusBanner config={config} /></div>

      {offers.length > 0 && (
        <section aria-labelledby="offers-heading" className="mt-8">
          <h2 id="offers-heading" className="sr-only">Offers</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {offers.map((offer) => (
              <li key={offer.code} className="flex min-w-[260px] items-center gap-3 rounded-card border border-dashed border-primary/40 bg-primary-soft px-4 py-3">
                <Tag className="size-5 shrink-0 text-link" aria-hidden />
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
          <h2 id="categories-heading" className="text-xl ros-heading">Browse the menu</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {menu.categories.map((c) => (
              <li key={c.id}>
                <Link href={`/${c.slug}`} className="ros-card flex h-full flex-col justify-between p-4 hover:border-primary/40">
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
            <h2 id="popular-heading" className="text-xl ros-heading">Popular right now</h2>
            <Link href="/menu" className="text-sm font-medium text-link hover:underline">See full menu</Link>
          </div>
          <div className="ros-product-list mt-4">
            {popular.map((p, i) => <ProductCard key={p.id} product={p} currency={config.currency} priority={i < 2} />)}
          </div>
        </section>
      )}

      {config.description && (
        <section aria-labelledby="about-heading" className="ros-card mt-10 p-6">
          <h2 id="about-heading" className="text-xl ros-heading">About {config.name}</h2>
          <p className="mt-2 max-w-3xl leading-relaxed text-muted">{config.description}</p>
          <Link href="/contact" className={buttonClass("outline", "md", "mt-4")}>Hours &amp; location</Link>
        </section>
      )}
    </>
  );
}
