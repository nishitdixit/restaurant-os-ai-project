// Hero (ADR-013): seven layouts — split, centered, image-left, image-right, full-bleed, editorial, minimal. On phones
// food stays above the fold: photo layouts show the photo first at a capped height, and text-only banners are
// compact instead of filling the screen.
import Image from "next/image";
import { Bike, Clock, MapPin } from "lucide-react";
import type { HeroSection } from "@restaurant-os/domain";
import { cx, formatMoney } from "@restaurant-os/ui";
import { etaText, freeDeliveryFrom, localized, lowestFee, media, resolveCta } from "@/lib/experience";
import { CtaButton, SectionShell, type SectionContext } from "./shared";

const OVERLAY: Record<HeroSection["overlay"], string> = {
  none: "",
  dark: "bg-black/55 text-white",
  darker: "bg-black/70 text-white",
  light: "bg-white/80 text-neutral-950",
};

const HEIGHT: Record<HeroSection["height"], string> = {
  compact: "min-h-[46svh] md:min-h-[24rem]",
  standard: "min-h-[58svh] md:min-h-[32rem]",
  tall: "min-h-[66svh] md:min-h-[40rem]",
};
/** Desktop-only heights (phones keep the natural, compact height). Literal classes so Tailwind generates them. */
const DESKTOP_HEIGHT: Record<HeroSection["height"], string> = {
  compact: "md:min-h-[24rem]",
  standard: "md:min-h-[32rem]",
  tall: "md:min-h-[40rem]",
};

const ALIGN: Record<HeroSection["align"], string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

function StatusLine({ ctx, className }: { ctx: SectionContext; className?: string }) {
  const { config } = ctx;
  const o = config.outlet;
  const eta = etaText(config);
  const fee = lowestFee(config);
  const free = freeDeliveryFrom(config);
  const items = [
    o && { icon: <Clock className="size-4" aria-hidden />, text: o.openNow ? "Open now" : o.nextOpening ? `Opens ${o.nextOpening}` : "Closed" },
    eta && { icon: <Bike className="size-4" aria-hidden />, text: eta },
    fee !== null && { icon: <MapPin className="size-4" aria-hidden />, text: free !== null ? `Free delivery above ${formatMoney(free, config.currency)}` : fee === 0 ? "Free delivery" : `Delivery from ${formatMoney(fee, config.currency)}` },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];
  if (!items.length) return null;
  return (
    <ul className={cx("flex flex-wrap gap-x-5 gap-y-2 text-sm", className)}>
      {items.map((i) => <li key={i.text} className="inline-flex items-center gap-1.5">{i.icon}{i.text}</li>)}
    </ul>
  );
}

export function Hero({ section, ctx }: { section: HeroSection; ctx: SectionContext }) {
  const { config } = ctx;
  const img = media(config, section.imageId);
  const title = localized(config, section.title, config.name);
  const subtitle = localized(config, section.subtitle, config.tagline);
  const eyebrow = localized(config, section.eyebrow, config.cuisines.join(" · "));
  const primary = resolveCta(config, section.primaryCta);
  const secondary = resolveCta(config, section.secondaryCta);
  const align = ALIGN[section.align];
  const centered = section.align === "center";
  const Title = (
    <h1 className={cx("ros-heading text-4xl leading-[1.05] sm:text-5xl", section.variant === "editorial" && "text-[2.75rem] uppercase sm:text-6xl lg:text-7xl")}>
      {title.primary}
      {title.secondary && <span lang="hi" className="mt-2 block text-2xl font-semibold sm:text-3xl">{title.secondary}</span>}
    </h1>
  );
  const Text = ({ onImage = false, light = false }: { onImage?: boolean; light?: boolean }) => (
    <div className={cx("flex min-w-0 flex-col gap-4", align)}>
      {config.logoUrl && section.showLogo && !onImage && section.variant !== "editorial" && (
        <Image src={config.logoUrl} alt="" width={56} height={56} className="hidden size-14 rounded-image bg-white object-cover sm:block" priority />
      )}
      {eyebrow.primary && <p className={cx("ros-eyebrow", !onImage && !light && "ros-section-link")}>{eyebrow.primary}</p>}
      {Title}
      {subtitle.primary && <p className={cx("max-w-xl text-base sm:text-lg", onImage || light ? "opacity-90" : "ros-section-muted", centered && "mx-auto")}>{subtitle.primary}</p>}
      {section.showStatus && <StatusLine ctx={ctx} className={cx(onImage || light ? "opacity-95" : "ros-section-muted", centered && "justify-center", section.align === "right" && "justify-end")} />}
      <div className={cx("mt-1 flex flex-wrap gap-3", centered && "justify-center", section.align === "right" && "justify-end")}>
        <CtaButton cta={primary} ctx={ctx} style={light ? "light" : "primary"} />
        <CtaButton cta={secondary} ctx={ctx} style={onImage || light ? "ghost" : "outline"} className="text-sm" />
      </div>
    </div>
  );
  const photo = (sizes: string, className: string, fit = section.imageFit) => img && (
    <div className={cx("relative overflow-hidden bg-subtle", className)}>
      <Image src={img.url} alt={img.alt} fill sizes={sizes} priority={ctx.index === 0} className={fit === "contain" ? "object-contain p-4" : "object-cover"} />
    </div>
  );

  // Minimal: a compact strip — name, line and the order button. Never fills the screen.
  if (section.variant === "minimal") {
    return (
      <SectionShell section={section} ctx={ctx} padded={false} className="py-6 md:py-10">
        <div className="ros-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="min-w-0">
            {eyebrow.primary && <p className="ros-eyebrow text-link">{eyebrow.primary}</p>}
            <h1 className="ros-heading mt-1 text-3xl sm:text-4xl">{title.primary}{title.secondary && <span lang="hi" className="mt-1 block text-xl">{title.secondary}</span>}</h1>
            {subtitle.primary && <p className="mt-2 text-muted">{subtitle.primary}</p>}
            {section.showStatus && <StatusLine ctx={ctx} className="mt-3 text-muted" />}
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <CtaButton cta={primary} ctx={ctx} />
            <CtaButton cta={secondary} ctx={ctx} style="outline" className="text-sm" />
          </div>
        </div>
      </SectionShell>
    );
  }

  // Full-bleed / centered with a photo: the photo fills the band and text sits on a readable overlay.
  if (img && (section.variant === "full-bleed" || section.variant === "centered")) {
    const full = section.variant === "full-bleed";
    return (
      <SectionShell section={section} ctx={ctx} padded={false} full={full} className={full ? "" : "py-4 md:py-8"}>
        <div className={cx("relative isolate flex overflow-hidden", HEIGHT[section.height], full ? "" : "rounded-[var(--ros-radius-xl)]")}>
          <Image src={img.url} alt={img.alt} fill sizes="100vw" priority={ctx.index === 0} className="-z-10 object-cover" />
          <div className={cx("flex w-full flex-col justify-end", full ? "" : "justify-center", OVERLAY[section.overlay])}>
            <div className={cx(full ? "ros-container py-10 md:py-14" : "px-6 py-10 sm:px-12")}><Text onImage /></div>
          </div>
        </div>
      </SectionShell>
    );
  }

  // Split: two halves, the photo running to the edge of the screen on large screens; photo first on phones.
  if (img && section.variant === "split") {
    return (
      <SectionShell section={section} ctx={ctx} padded={false} full>
        <div className={cx("grid md:grid-cols-2", DESKTOP_HEIGHT[section.height])}>
          {photo("(min-width: 768px) 50vw, 100vw", "aspect-[4/3] max-h-[44svh] w-full md:order-2 md:aspect-auto md:max-h-none md:min-h-full", section.imageFit)}
          <div className="flex items-center">
            <div className="w-full px-4 py-8 md:px-10 md:py-14 lg:px-16" style={{ maxWidth: "calc(var(--ros-content-width) / 2)", marginInlineStart: "auto" }}><Text /></div>
          </div>
        </div>
      </SectionShell>
    );
  }

  // Image left / right: a framed photo card beside the text, inside the content width.
  if (img && (section.variant === "image-left" || section.variant === "image-right")) {
    return (
      <SectionShell section={section} ctx={ctx} padded={false} className="py-6 md:py-12">
        <div className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
          {photo("(min-width: 768px) 50vw, 100vw", cx("aspect-[4/3] max-h-[42svh] w-full rounded-[var(--ros-radius-xl)] md:max-h-none", section.variant === "image-right" && "md:order-2"))}
          <Text />
        </div>
      </SectionShell>
    );
  }

  // Editorial: an oversized display headline with a captioned photo card (the photo comes first on phones).
  if (section.variant === "editorial") {
    return (
      <SectionShell section={section} ctx={ctx} padded={false} className="py-8 md:py-16">
        <div className="grid items-center gap-8 md:grid-cols-[1.25fr_1fr] md:gap-14">
          {img && (
            <figure className="ros-card p-3 md:order-2">
              {photo("(min-width: 768px) 40vw, 100vw", "aspect-[16/10] w-full rounded-image md:aspect-[4/3]")}
              {img.alt && <figcaption className="ros-heading mt-3 px-1 text-lg">{img.alt}</figcaption>}
            </figure>
          )}
          <Text />
        </div>
      </SectionShell>
    );
  }

  // No photo yet: the theme's banner (gradient, solid brand colour or a card), kept compact on phones.
  return (
    <SectionShell section={section} ctx={ctx} padded={false} className="py-4 md:py-8">
      <div className={cx(
        "overflow-hidden rounded-[var(--ros-radius-xl)] bg-[linear-gradient(135deg,var(--ros-hero-from),var(--ros-hero-to))] p-6 text-primary-contrast shadow-[var(--ros-shadow-md)] sm:p-10",
        "hero-solid:bg-primary hero-solid:bg-none hero-minimal:ros-card hero-minimal:bg-none hero-minimal:text-text",
        // Without a photo the banner is as tall as its text; only "tall" adds room (the photo layouts use the full heights).
        section.height === "tall" && "md:min-h-[24rem]", "md:flex md:items-center",
      )}>
        <div className="w-full"><Banner ctx={ctx} section={section} /></div>
      </div>
    </SectionShell>
  );
}

/** Text on the theme banner: light buttons on the brand colour, normal ones on the minimal card. */
function Banner({ section, ctx }: { section: HeroSection; ctx: SectionContext }) {
  const { config } = ctx;
  const title = localized(config, section.title, config.name);
  const subtitle = localized(config, section.subtitle, config.tagline);
  const eyebrow = localized(config, section.eyebrow, config.cuisines.join(" · "));
  const primary = resolveCta(config, section.primaryCta);
  const secondary = resolveCta(config, section.secondaryCta);
  const centered = section.align === "center";
  return (
    <div className={cx("flex gap-4", centered ? "flex-col items-center text-center" : "items-start", section.align === "right" && "flex-row-reverse text-right")}>
      {config.logoUrl && section.showLogo && !centered && <Image src={config.logoUrl} alt="" width={64} height={64} className="hidden size-16 rounded-image bg-white object-cover sm:block" priority />}
      <div className="min-w-0">
        {eyebrow.primary && <p className="text-sm font-medium opacity-90">{eyebrow.primary}</p>}
        <h1 className="ros-heading mt-1 text-3xl sm:text-4xl">{title.primary}{title.secondary && <span lang="hi" className="mt-1 block text-xl font-semibold">{title.secondary}</span>}</h1>
        {subtitle.primary && <p className={cx("mt-2 max-w-xl text-base opacity-90 sm:text-lg", centered && "mx-auto")}>{subtitle.primary}</p>}
        {section.showStatus && <StatusLine ctx={ctx} className={cx("mt-5 opacity-95", centered && "justify-center")} />}
        <div className={cx("mt-6 flex flex-wrap gap-3", centered && "justify-center", section.align === "right" && "justify-end")}>
          <span className="contents hero-minimal:hidden"><CtaButton cta={primary} ctx={ctx} style="light" /></span>
          <span className="hidden hero-minimal:contents"><CtaButton cta={primary} ctx={ctx} style="primary" /></span>
          <CtaButton cta={secondary} ctx={ctx} style="ghost" className="text-sm hero-minimal:border-border-strong" />
        </div>
      </div>
    </div>
  );
}
