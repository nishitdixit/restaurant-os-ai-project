// Commerce sections (ADR-013): categories, featured dishes, bestsellers, combos, offers and delivery. Every section
// shows only real data — no invented popularity — and hides itself (placeholder in preview) when it has nothing.
import Image from "next/image";
import Link from "next/link";
import { Bike, ChevronRight, Tag } from "lucide-react";
import type { BestsellersSection, CategoriesSection, CombosSection, DeliverySection, FeaturedSection, OffersSection } from "@restaurant-os/domain";
import type { MenuCategory, MenuProduct } from "@restaurant-os/types";
import { buttonClass, cx, formatDateTime, formatMoney } from "@restaurant-os/ui";
import { etaText, freeDeliveryFrom, localized, lowestFee } from "@/lib/experience";
import { CopyCode } from "../copy-code";
import { DeliveryChecker } from "../delivery-checker";
import { Placeholder, ProductCollection, SectionHeading, SectionShell, type SectionContext } from "./shared";

const allProducts = (ctx: SectionContext) => ctx.menu.categories.flatMap((c) => c.products);

function seeMenu() {
  return <Link href="/menu" className="inline-flex items-center gap-1 text-sm font-medium ros-section-link hover:underline">See full menu<ChevronRight className="size-4" aria-hidden /></Link>;
}

// Categories ---------------------------------------------------------------------------------------------------

/** The category's own photo, else its first dish's photo. */
function categoryImage(c: MenuCategory): string | null {
  return c.imageUrl ?? c.products.find((p) => p.imageUrl)?.imageUrl ?? null;
}

export function Categories({ section, ctx }: { section: CategoriesSection; ctx: SectionContext }) {
  const byId = new Map(ctx.menu.categories.map((c) => [c.id, c]));
  const categories = section.categoryIds.length ? section.categoryIds.flatMap((id) => byId.get(id) ?? []) : ctx.menu.categories;
  if (!categories.length) return <Placeholder section={section} ctx={ctx} message="publish a few dishes and their categories appear here." />;
  const name = (c: MenuCategory) => localized(ctx.config, { en: c.name, hi: c.nameHi }, c.name);
  const count = (c: MenuCategory) => section.showCounts && <span className="text-sm opacity-80">{c.products.length} item{c.products.length === 1 ? "" : "s"}</span>;
  const heading = <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle="Browse the menu" action={seeMenu()} />;

  if (section.variant === "text") {
    return (
      <SectionShell section={section} ctx={ctx}>
        {heading}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/${c.slug}`} className="ros-card ros-press flex h-full flex-col justify-between p-4 text-text hover:border-primary/40">
                <span className="font-semibold">{name(c).primary}{name(c).secondary && <span lang="hi" className="block text-sm text-link">{name(c).secondary}</span>}</span>
                <span className="mt-2 text-muted">{count(c)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  }

  if (section.variant === "scroll") {
    return (
      <SectionShell section={section} ctx={ctx}>
        {heading}
        <ul className="ros-rail [grid-auto-columns:6.5rem]! sm:[grid-auto-columns:7.5rem]!">
          {categories.map((c) => {
            const img = categoryImage(c);
            return (
              <li key={c.id}>
                <Link href={`/${c.slug}`} className="ros-press flex flex-col items-center gap-2 text-center">
                  <span className="relative block size-20 overflow-hidden rounded-full bg-subtle ring-2 ring-border sm:size-24">
                    {img ? <Image src={img} alt="" fill sizes="96px" className="object-cover" /> : <span className="flex size-full items-center justify-center text-2xl font-bold text-faint" aria-hidden>{c.name.slice(0, 1)}</span>}
                  </span>
                  <span className="text-sm font-medium leading-tight ros-section-text">{name(c).primary}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </SectionShell>
    );
  }

  const ratio = section.variant === "square" ? "aspect-square" : section.variant === "landscape" ? "aspect-[16/9]" : "aspect-[4/5]";
  const overlay = section.variant === "image-cards";
  return (
    <SectionShell section={section} ctx={ctx}>
      {heading}
      <ul className={cx("grid gap-3", section.variant === "landscape" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
        {categories.map((c, i) => {
          const img = categoryImage(c);
          return (
            <li key={c.id}>
              <Link href={`/${c.slug}`} className={cx("ros-press group block overflow-hidden", overlay ? "relative rounded-[var(--ros-radius-card)]" : "ros-card")}>
                <span className={cx("relative block w-full overflow-hidden bg-subtle", ratio, !overlay && "rounded-image")}>
                  {img
                    ? <Image src={img} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" priority={ctx.index < 2 && i < 2} className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    : <span className="flex size-full items-center justify-center bg-primary-soft text-4xl font-bold text-link" aria-hidden>{c.name.slice(0, 1)}</span>}
                  {overlay && <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden />}
                </span>
                <span className={cx("flex flex-col", overlay ? "absolute inset-x-0 bottom-0 p-4 text-white" : "p-3 text-text")}>
                  <span className="ros-heading text-lg leading-tight">{name(c).primary}</span>
                  {name(c).secondary && <span lang="hi" className="text-sm opacity-90">{name(c).secondary}</span>}
                  {count(c)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

// Dish collections ----------------------------------------------------------------------------------------------

export function Featured({ section, ctx }: { section: FeaturedSection; ctx: SectionContext }) {
  const all = allProducts(ctx);
  const byId = new Map(all.map((p) => [p.id, p]));
  const products = (section.source === "picked" ? section.productIds.flatMap((id) => byId.get(id) ?? []) : all.filter((p) => p.available)).slice(0, section.limit);
  if (!products.length) return <Placeholder section={section} ctx={ctx} message={section.source === "picked" ? "pick the dishes to feature." : "publish a few dishes to show them here."} />;
  return (
    <SectionShell section={section} ctx={ctx}>
      <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle={section.source === "picked" ? "Chef's picks" : "From the menu"} action={seeMenu()} />
      <ProductCollection products={products} variant={section.variant} ctx={ctx} />
    </SectionShell>
  );
}

export function Bestsellers({ section, ctx }: { section: BestsellersSection; ctx: SectionContext }) {
  const byId = new Map(allProducts(ctx).map((p) => [p.id, p]));
  const products = ctx.menu.bestsellerIds.flatMap((id) => byId.get(id) ?? []).slice(0, section.limit);
  if (!products.length) {
    return <Placeholder section={section} ctx={ctx} message="appears automatically once dishes have real orders (the rules are under Menu → Bestsellers)." />;
  }
  return (
    <SectionShell section={section} ctx={ctx}>
      <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle="Bestsellers" action={seeMenu()} />
      <ProductCollection products={products} variant={section.variant} ctx={ctx} />
    </SectionShell>
  );
}

export function Combos({ section, ctx }: { section: CombosSection; ctx: SectionContext }) {
  const all = allProducts(ctx);
  const byId = new Map(all.map((p) => [p.id, p]));
  const products: MenuProduct[] = (section.productIds.length
    ? section.productIds.flatMap((id) => byId.get(id) ?? [])
    : all.filter((p) => p.badges.some((b) => b.kind === "combo"))).slice(0, section.limit);
  if (!products.length) return <Placeholder section={section} ctx={ctx} message="pick dishes here, or give dishes the “Combo” badge in Menu." />;
  return (
    <SectionShell section={section} ctx={ctx}>
      <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle="Combos & specials" />
      <ProductCollection products={products} variant={section.variant === "cards" ? "grid" : section.variant} ctx={ctx} />
    </SectionShell>
  );
}

// Offers ------------------------------------------------------------------------------------------------------

export function Offers({ section, ctx }: { section: OffersSection; ctx: SectionContext }) {
  const offers = ctx.offers;
  if (!offers.length) return <Placeholder section={section} ctx={ctx} message="shows your public offers while they're running." />;
  const heading = <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle="Offers"
    action={<Link href="/offers" className="text-sm font-medium ros-section-link hover:underline">All offers</Link>} />;
  if (section.variant === "banner") {
    const best = offers[0]!;
    return (
      <SectionShell section={section} ctx={ctx} padded={false} className="py-6">
        <div className="flex flex-col gap-4 rounded-[var(--ros-radius-xl)] border-2 border-dashed border-current/40 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Tag className="mt-1 size-6 shrink-0 ros-section-link" aria-hidden />
            <div>
              <p className="ros-heading text-2xl">{best.title}</p>
              <p className="mt-1 ros-section-muted">{best.summary}{best.newCustomerOnly ? " · first order only" : ""}</p>
            </div>
          </div>
          <CopyCode code={best.code} />
        </div>
      </SectionShell>
    );
  }
  if (section.variant === "cards") {
    return (
      <SectionShell section={section} ctx={ctx}>
        {heading}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => (
            <li key={o.code} className="flex flex-col justify-between gap-4 rounded-[var(--ros-radius-lg)] border border-dashed border-primary/40 bg-surface p-5 text-text">
              <div>
                <p className="text-lg font-semibold">{o.title}</p>
                <p className="mt-0.5 text-sm text-muted">{o.summary}{o.newCustomerOnly ? " · first order only" : ""}</p>
                <p className="mt-2 text-xs text-faint">Valid until {formatDateTime(o.endsAt, { dateStyle: "medium" })}</p>
              </div>
              <CopyCode code={o.code} />
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  }
  return (
    <SectionShell section={section} ctx={ctx} padded={false} className="py-5">
      <h2 className="sr-only">{localized(ctx.config, section.title, "Offers").primary}</h2>
      <ul className="ros-rail [grid-auto-columns:minmax(16rem,85%)]! sm:[grid-auto-columns:minmax(17rem,40%)]! lg:[grid-auto-columns:minmax(17rem,30%)]!">
        {offers.map((o) => (
          <li key={o.code} className="flex items-center gap-3 rounded-card border border-dashed border-primary/40 bg-primary-soft px-4 py-3">
            <Tag className="size-5 shrink-0 text-link" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-text">{o.title}</p>
              <p className="text-sm text-muted">Use <span className="font-mono font-semibold text-text">{o.code}</span> · {o.summary}</p>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

// Delivery ------------------------------------------------------------------------------------------------------

export function Delivery({ section, ctx }: { section: DeliverySection; ctx: SectionContext }) {
  const { config } = ctx;
  const o = config.outlet;
  const areas = config.deliveryAreas;
  if (!o || (!o.deliveryEnabled && !o.pickupEnabled)) return <Placeholder section={section} ctx={ctx} message="turn on delivery or pickup in Settings → Kitchen & hours." />;
  const eta = etaText(config);
  const fee = lowestFee(config);
  const free = freeDeliveryFrom(config);
  const facts = [
    eta,
    fee !== null && (fee === 0 ? "Free delivery" : `Delivery from ${formatMoney(fee, config.currency)}`),
    free !== null && `Free delivery above ${formatMoney(free, config.currency)}`,
    o.pickupEnabled && `Pickup ready in about ${o.prepMinutes} min`,
  ].filter(Boolean) as string[];
  const heading = <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle={o.deliveryEnabled ? "Delivered hot to your door" : "Order ahead for pickup"} />;

  if (section.variant === "areas" && areas.length) {
    return (
      <SectionShell section={section} ctx={ctx}>
        {heading}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => (
            <li key={a.name} className="ros-card p-4 text-text">
              <p className="flex items-center gap-2 font-semibold"><Bike className="size-4 text-link" aria-hidden />{a.name}</p>
              <p className="mt-1 text-sm text-muted">{a.etaMin}–{a.etaMax} min · {a.feeMinor ? formatMoney(a.feeMinor, config.currency) : "Free"}{a.freeDeliveryMinimumMinor ? ` (free above ${formatMoney(a.freeDeliveryMinimumMinor, config.currency)})` : ""}</p>
              {a.postalCodes.length > 0 && <p className="mt-1 text-xs text-faint">{a.postalCodes.slice(0, 6).join(", ")}{a.postalCodes.length > 6 ? ` +${a.postalCodes.length - 6} more` : ""}</p>}
              {a.radiusKm && <p className="mt-1 text-xs text-faint">Within {a.radiusKm} km</p>}
            </li>
          ))}
        </ul>
        <Link href="/delivery-areas" className="mt-4 inline-flex text-sm font-medium ros-section-link hover:underline">Delivery details</Link>
      </SectionShell>
    );
  }

  return (
    <SectionShell section={section} ctx={ctx}>
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          {heading}
          <ul className="flex flex-wrap gap-2">
            {facts.map((f) => <li key={f} className="rounded-chip border border-current/25 px-3 py-1.5 text-sm">{f}</li>)}
          </ul>
          {section.variant === "checker" && o.deliveryEnabled && areas.length > 0 && (
            <div className="mt-5"><DeliveryChecker areas={areas} currency={config.currency} pickup={o.pickupEnabled} /></div>
          )}
        </div>
        <Link href="/delivery-areas" className={buttonClass("outline", "md", "ros-press")}>Where we deliver</Link>
      </div>
    </SectionShell>
  );
}
