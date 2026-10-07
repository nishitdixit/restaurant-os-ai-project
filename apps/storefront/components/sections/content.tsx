// Story and trust sections (ADR-013): highlights, story, gallery, reviews and call-to-action bands. Facts are either
// computed from real data (orders, hours, delivery) or written by the restaurant and labelled with their source —
// a rating always says where it comes from and when it was read; nothing is called "verified".
import Image from "next/image";
import type { ReactNode } from "react";
import {
  Award, Bike, ChefHat, Clock, ExternalLink, Flame, Heart, Leaf, MapPin, Quote, Shield, Sparkles, Star, UtensilsCrossed,
} from "lucide-react";
import {
  REVIEW_SOURCE_LABELS, type CtaSection, type GallerySection, type HighlightIcon, type HighlightItem, type HighlightsSection, type RatingSummary,
  type ReviewsSection, type SectionTone, type StorySection,
} from "@restaurant-os/domain";
import { cx, formatMoney } from "@restaurant-os/ui";
import { freeDeliveryFrom, localized, lowestFee, media, paragraphs, resolveCta } from "@/lib/experience";
import { CtaButton, Placeholder, SectionHeading, SectionShell, type SectionContext } from "./shared";

const ICONS: Record<HighlightIcon, ReactNode> = {
  star: <Star className="size-5" aria-hidden />, flame: <Flame className="size-5" aria-hidden />, leaf: <Leaf className="size-5" aria-hidden />,
  clock: <Clock className="size-5" aria-hidden />, bike: <Bike className="size-5" aria-hidden />, award: <Award className="size-5" aria-hidden />,
  heart: <Heart className="size-5" aria-hidden />, shield: <Shield className="size-5" aria-hidden />, chef: <ChefHat className="size-5" aria-hidden />,
  sparkles: <Sparkles className="size-5" aria-hidden />, "map-pin": <MapPin className="size-5" aria-hidden />, utensils: <UtensilsCrossed className="size-5" aria-hidden />,
};

/** Buttons that stay readable on the section's background. */
function ctaStyles(tone: SectionTone) {
  return tone === "brand" || tone === "inverted" ? { primary: "light" as const, secondary: "ghost" as const } : { primary: "primary" as const, secondary: "outline" as const };
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y && m ? new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 15))) : "";
}

function niceCount(n: number): string {
  const rounded = n >= 1000 ? Math.floor(n / 100) * 100 : n >= 100 ? Math.floor(n / 10) * 10 : n;
  return `${rounded.toLocaleString("en-IN")}+`;
}

function findRating(ctx: SectionContext): RatingSummary | null {
  const r = ctx.config.experience.sections.find((s): s is ReviewsSection => s.type === "reviews" && s.enabled && !!s.rating);
  return r?.rating ?? null;
}

// Highlights ----------------------------------------------------------------------------------------------------

/** Value + label for a highlight; null when the fact isn't available (never invented). */
function resolveHighlight(item: HighlightItem, ctx: SectionContext): { value: string; label: string } | null {
  const { config } = ctx;
  const custom = (fallbackValue: string | null, fallbackLabel: string) => {
    const value = localized(config, item.value, fallbackValue ?? "").primary;
    return value ? { value, label: localized(config, item.label, fallbackLabel).primary } : null;
  };
  switch (item.kind) {
    case "custom": {
      const value = localized(config, item.value).primary;
      const label = localized(config, item.label).primary;
      return value || label ? { value, label } : null;
    }
    case "orders": return config.stats.paidOrders !== null ? custom(niceCount(config.stats.paidOrders), "orders served") : null;
    case "rating": {
      const r = findRating(ctx);
      return r ? custom(`${r.value.toFixed(1)}★`, `on ${REVIEW_SOURCE_LABELS[r.source]}`) : null;
    }
    case "hours": {
      const o = config.outlet;
      if (!o) return null;
      return custom(o.openNow ? "Open now" : o.nextOpening ? `Opens ${o.nextOpening}` : "Closed", "today");
    }
    case "delivery-time": {
      const areas = config.deliveryAreas;
      if (!config.outlet?.deliveryEnabled || !areas.length) return null;
      return custom(`${Math.min(...areas.map((a) => a.etaMin))}–${Math.max(...areas.map((a) => a.etaMax))} min`, "delivery");
    }
    case "delivery-fee": {
      const free = freeDeliveryFrom(config);
      const fee = lowestFee(config);
      if (free !== null) return custom(`Free above ${formatMoney(free, config.currency)}`, "delivery");
      if (fee === null) return null;
      return custom(fee === 0 ? "Free" : formatMoney(fee, config.currency), fee === 0 ? "delivery" : "delivery from");
    }
  }
}

export function Highlights({ section, ctx }: { section: HighlightsSection; ctx: SectionContext }) {
  const items = section.items.flatMap((item) => {
    const r = resolveHighlight(item, ctx);
    return r ? [{ ...r, icon: item.icon }] : [];
  });
  if (!items.length) return <Placeholder section={section} ctx={ctx} message="add a few facts (the automatic ones appear once there is data)." />;
  const heading = <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle="" align="center" />;
  if (section.variant === "strip") {
    return (
      <SectionShell section={section} ctx={ctx} padded={false} className="py-5">
        {heading}
        <ul className="ros-rail [grid-auto-columns:max-content]! items-center gap-0! divide-x divide-current/20">
          {items.map((i) => (
            <li key={`${i.value}${i.label}`} className="flex items-center gap-2 px-5 first:pl-0">
              <span className="ros-section-link">{ICONS[i.icon]}</span>
              <span className="whitespace-nowrap"><span className="font-semibold">{i.value}</span> <span className="ros-section-muted">{i.label}</span></span>
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  }
  if (section.variant === "icons") {
    return (
      <SectionShell section={section} ctx={ctx}>
        {heading}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <li key={`${i.value}${i.label}`} className="ros-card flex items-start gap-3 p-5 text-text">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ros-radius-md)] bg-primary-soft text-link">{ICONS[i.icon]}</span>
              <span><span className="ros-heading block text-lg">{i.value}</span><span className="text-sm text-muted">{i.label}</span></span>
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  }
  return (
    <SectionShell section={section} ctx={ctx}>
      {heading}
      <ul className={cx("grid gap-3", items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
        {items.map((i) => (
          <li key={`${i.value}${i.label}`} className="rounded-[var(--ros-radius-lg)] border border-current/20 p-4 text-center sm:p-6">
            <span className="ros-heading block text-2xl ros-section-link sm:text-3xl">{i.value}</span>
            <span className="mt-1 block text-sm ros-section-muted">{i.label}</span>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

// Story ---------------------------------------------------------------------------------------------------------

export function Story({ section, ctx }: { section: StorySection; ctx: SectionContext }) {
  const { config } = ctx;
  const hasOwn = !!(section.title.en || section.title.hi || section.body.en || section.body.hi);
  const body = hasOwn ? localized(config, section.body) : { primary: config.description, secondary: null };
  const img = media(config, section.imageId);
  if (!hasOwn && !config.description && !img) return <Placeholder section={section} ctx={ctx} message="tell customers your story (or add an “About” text in Settings → Brand)." />;
  const cta = resolveCta(config, section.cta);
  const styles = ctaStyles(section.tone);
  const text = (onImage = false) => (
    <div className="min-w-0">
      <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle={`About ${config.name}`} align={section.variant === "stacked" ? "center" : "left"} />
      <div className={cx("space-y-3 text-base leading-relaxed sm:text-lg", onImage ? "opacity-95" : "ros-section-muted", section.variant === "stacked" && "mx-auto max-w-2xl text-center")}>
        {paragraphs(body.primary).map((p, i) => <p key={i}>{p}</p>)}
      </div>
      {cta && <div className={cx("mt-6", section.variant === "stacked" && "text-center")}><CtaButton cta={cta} ctx={ctx} style={onImage ? "light" : styles.primary} /></div>}
    </div>
  );
  if (img && section.variant === "overlay") {
    return (
      <SectionShell section={section} ctx={ctx} padded={false} full>
        <div className="relative isolate">
          <Image src={img.url} alt={img.alt} fill sizes="100vw" className="-z-10 object-cover" />
          <div className="bg-black/65 py-16 text-white md:py-24 [&_.ros-section-link]:text-white [&_.ros-section-muted]:text-white [&_.ros-section-text]:text-white">
            <div className="ros-container max-w-3xl">{text(true)}</div>
          </div>
        </div>
      </SectionShell>
    );
  }
  const picture = img && (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--ros-radius-xl)] bg-subtle">
      <Image src={img.url} alt={img.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className={section.imageFit === "contain" ? "object-contain p-4" : "object-cover"} />
    </div>
  );
  if (section.variant === "stacked" || !img) {
    return (
      <SectionShell section={section} ctx={ctx}>
        {picture && <div className="mx-auto mb-8 max-w-4xl">{picture}</div>}
        {text()}
      </SectionShell>
    );
  }
  return (
    <SectionShell section={section} ctx={ctx}>
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
        <div className={cx(section.variant === "image-right" && "md:order-2")}>{picture}</div>
        {text()}
      </div>
    </SectionShell>
  );
}

// Gallery -------------------------------------------------------------------------------------------------------

export function Gallery({ section, ctx }: { section: GallerySection; ctx: SectionContext }) {
  const images = section.images.flatMap((i) => {
    const m = media(ctx.config, i.imageId);
    return m ? [{ ...m, caption: localized(ctx.config, i.caption).primary }] : [];
  });
  if (!images.length) return <Placeholder section={section} ctx={ctx} message="add photos of your food and place." />;
  const heading = <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle="Gallery" />;
  const figure = (img: (typeof images)[number], ratio: string, sizes: string) => (
    <figure key={img.url} className="group">
      <div className={cx("relative w-full overflow-hidden rounded-image bg-subtle", ratio)}>
        <Image src={img.url} alt={img.alt} fill sizes={sizes} className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      {img.caption && <figcaption className="mt-2 text-sm ros-section-muted">{img.caption}</figcaption>}
    </figure>
  );
  if (section.variant === "carousel") {
    return (
      <SectionShell section={section} ctx={ctx}>
        {heading}
        <div className="ros-rail" tabIndex={0} aria-label="Photos — swipe or scroll sideways">{images.map((img) => figure(img, "aspect-[4/5]", "(min-width: 1024px) 25vw, 70vw"))}</div>
      </SectionShell>
    );
  }
  if (section.variant === "mosaic") {
    const ratios = ["aspect-[4/5]", "aspect-square", "aspect-[4/3]", "aspect-[3/4]"];
    return (
      <SectionShell section={section} ctx={ctx}>
        {heading}
        <div className="columns-2 gap-3 md:columns-3 [&>figure]:mb-3 [&>figure]:break-inside-avoid">
          {images.map((img, i) => figure(img, ratios[i % ratios.length]!, "(min-width: 768px) 33vw, 50vw"))}
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell section={section} ctx={ctx}>
      {heading}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{images.map((img) => figure(img, "aspect-square", "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"))}</div>
    </SectionShell>
  );
}

// Reviews -------------------------------------------------------------------------------------------------------

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx("inline-flex gap-0.5", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="relative inline-block size-4">
          <Star className="absolute size-4 opacity-30" />
          <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - n + 1)) * 100}%` }}>
            <Star className="size-4 fill-current" />
          </span>
        </span>
      ))}
    </span>
  );
}

export function Reviews({ section, ctx }: { section: ReviewsSection; ctx: SectionContext }) {
  const { config } = ctx;
  const { rating, testimonials } = section;
  if (!rating && !testimonials.length) return <Placeholder section={section} ctx={ctx} message="add your rating (with a link to where it comes from) or a few reviews." />;
  const summary = rating && (
    <div className="ros-card flex flex-wrap items-center gap-x-6 gap-y-3 p-5 text-text">
      <p className="ros-heading text-5xl leading-none">{rating.value.toFixed(1)}</p>
      <div>
        <Stars value={rating.value} className="text-warning" />
        <p className="mt-1 text-sm text-muted">
          <span className="sr-only">Rated {rating.value.toFixed(1)} out of 5 · </span>
          {rating.count > 0 && <>{rating.count.toLocaleString("en-IN")} ratings · </>}{REVIEW_SOURCE_LABELS[rating.source]} · as of {monthLabel(rating.asOf)}
        </p>
      </div>
      <a href={rating.url} target="_blank" rel="noopener noreferrer nofollow" className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
        Read the reviews on {REVIEW_SOURCE_LABELS[rating.source]}<ExternalLink className="size-3.5" aria-hidden />
      </a>
    </div>
  );
  const quote = (t: ReviewsSection["testimonials"][number], i: number) => {
    const q = localized(config, t.quote);
    return (
      <figure key={i} className="ros-card flex h-full flex-col gap-3 p-5 text-text">
        <Quote className="size-5 text-link" aria-hidden />
        {t.rating && <><Stars value={t.rating} className="text-warning" /><span className="sr-only">{t.rating} out of 5</span></>}
        <blockquote className="flex-1 leading-relaxed">“{q.primary}”</blockquote>
        <figcaption className="text-sm text-muted">— {t.author}{` · ${REVIEW_SOURCE_LABELS[t.source]}`}{t.date ? ` · ${monthLabel(t.date)}` : ""}</figcaption>
      </figure>
    );
  };
  return (
    <SectionShell section={section} ctx={ctx}>
      <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle="What our guests say" />
      {summary}
      {testimonials.length > 0 && (
        section.variant === "carousel"
          ? <div className="ros-rail mt-4" tabIndex={0} aria-label="Reviews — swipe or scroll sideways">{testimonials.map(quote)}</div>
          : section.variant === "wall"
            ? <div className="mt-4 columns-1 gap-3 sm:columns-2 lg:columns-3 [&>figure]:mb-3 [&>figure]:break-inside-avoid">{testimonials.map(quote)}</div>
            : <div className="mt-4 grid gap-3 md:grid-cols-3">{testimonials.slice(0, 3).map(quote)}</div>
      )}
    </SectionShell>
  );
}

// Call to action ------------------------------------------------------------------------------------------------

export function CallToActionBand({ section, ctx }: { section: CtaSection; ctx: SectionContext }) {
  const { config } = ctx;
  const primary = resolveCta(config, section.primaryCta);
  const secondary = resolveCta(config, section.secondaryCta);
  const img = media(config, section.imageId);
  const styles = ctaStyles(section.tone);
  const buttons = (center: boolean) => (
    <div className={cx("mt-6 flex flex-wrap gap-3", center && "justify-center")}>
      <CtaButton cta={primary} ctx={ctx} style={styles.primary} />
      <CtaButton cta={secondary} ctx={ctx} style={styles.secondary} className="text-sm" />
    </div>
  );
  if (section.variant === "split" && img) {
    return (
      <SectionShell section={section} ctx={ctx}>
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--ros-radius-xl)] bg-subtle">
            <Image src={img.url} alt={img.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
          <div>
            <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle={`Hungry? Order direct from ${config.name}`} />
            {buttons(false)}
          </div>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell section={section} ctx={ctx} className={section.variant === "minimal" ? "py-10" : "py-12 md:py-20"}>
      <SectionHeading ctx={ctx} eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} fallbackTitle={`Hungry? Order direct from ${config.name}`} align="center" />
      {buttons(true)}
    </SectionShell>
  );
}
