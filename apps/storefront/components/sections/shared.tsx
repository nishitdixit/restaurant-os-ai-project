// Building blocks shared by homepage sections (ADR-013): the section shell (tone, reveal, preview hooks), headings,
// calls to action, the "add content" placeholder merchants see in preview, and dish collections.
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { sectionToneVariables, SECTION_LABELS, type LanguageMode, type LocalizedText, type Section, type StoreTheme } from "@restaurant-os/domain";
import type { Menu, MenuProduct, PublicOffer, StoreConfig } from "@restaurant-os/types";
import { cx } from "@restaurant-os/ui";
import { localized, type ResolvedCta } from "@/lib/experience";
import { orderChannels } from "../chrome";
import { OrderChannelsButton } from "../order-channels";
import { ProductCard } from "../product-card";

export interface SectionContext {
  config: StoreConfig;
  theme: StoreTheme;
  menu: Menu;
  offers: PublicOffer[];
  /** Verified merchant preview: empty sections show a placeholder instead of disappearing. */
  preview: boolean;
  language: LanguageMode;
  /** Index of the section on the page (the first section's images load eagerly). */
  index: number;
}

export function SectionShell({ section, ctx, children, className, padded = true, full = false, style }: {
  section: Section; ctx: SectionContext; children: ReactNode; className?: string; padded?: boolean; full?: boolean; style?: CSSProperties;
}) {
  const tone = sectionToneVariables(ctx.theme, section.tone);
  return (
    <section id={`section-${section.id}`} data-section-id={section.id} data-section-type={section.type} data-variant={section.variant} data-tone={section.tone}
      aria-label={section.title.en || section.title.hi ? undefined : SECTION_LABELS[section.type]}
      className={cx("ros-section ros-reveal", padded && "py-8 md:py-12", className)} style={{ ...tone, ...style } as CSSProperties}>
      {full ? children : <div className="ros-container">{children}</div>}
    </section>
  );
}

/** Eyebrow, title (+ Hindi line in bilingual mode) and subtitle, in the section's text colours. */
export function SectionHeading({ ctx, eyebrow, title, subtitle, fallbackTitle, align = "left", action, as: Tag = "h2" }: {
  ctx: SectionContext; eyebrow?: LocalizedText; title?: LocalizedText; subtitle?: LocalizedText; fallbackTitle: string;
  align?: "left" | "center"; action?: ReactNode; as?: "h1" | "h2";
}) {
  const e = localized(ctx.config, eyebrow);
  const t = localized(ctx.config, title, fallbackTitle);
  const s = localized(ctx.config, subtitle);
  if (!t.primary && !e.primary) return null;
  return (
    <div className={cx("mb-5 flex flex-wrap gap-3", align === "center" ? "flex-col items-center text-center" : "items-end justify-between")}>
      <div className={cx("min-w-0", align === "center" && "max-w-2xl")}>
        {e.primary && <p className="ros-eyebrow ros-section-link">{e.primary}</p>}
        {t.primary && (
          <Tag className={cx("ros-heading ros-section-text text-2xl md:text-3xl", e.primary && "mt-1.5")}>
            {t.primary}
            {t.secondary && <span lang="hi" className="mt-1 block text-lg font-semibold ros-section-link md:text-xl">{t.secondary}</span>}
          </Tag>
        )}
        {s.primary && <p className="mt-2 max-w-2xl ros-section-muted">{s.primary}</p>}
      </div>
      {action}
    </div>
  );
}

const CTA_STYLES = {
  primary: "ros-btn-primary",
  outline: "ros-btn-outline",
  /** On a brand or dark band, or a gradient banner: a light button with brand text. */
  light: "bg-surface text-link shadow-[var(--ros-shadow-sm)]",
  /** Outline in the current text colour (on banners and photos). */
  ghost: "border border-current/45 hover:bg-current/10",
} as const;

export function CtaButton({ cta, ctx, style = "primary", className }: { cta: ResolvedCta | null; ctx: SectionContext; style?: keyof typeof CTA_STYLES; className?: string }) {
  if (!cta) return null;
  const cls = cx("ros-button-text ros-press inline-flex h-12 items-center justify-center gap-2 rounded-button px-6 text-base font-semibold transition hover:brightness-95", CTA_STYLES[style], className);
  if (cta.href === null) {
    return <OrderChannelsButton channels={orderChannels(ctx.config)} storeName={ctx.config.name} label={cta.label} className={cls} />;
  }
  if (cta.external) return <a href={cta.href} target={cta.href.startsWith("tel:") ? undefined : "_blank"} rel="noopener noreferrer" className={cls} data-wa-cart={cta.target === "whatsapp" ? "" : undefined}>{cta.label}</a>;
  return <Link href={cta.href} className={cls}>{cta.label}</Link>;
}

/** What a merchant sees in preview for a section that has nothing to show yet (customers see nothing). */
export function Placeholder({ section, ctx, message }: { section: Section; ctx: SectionContext; message: string }) {
  if (!ctx.preview) return null;
  return (
    <SectionShell section={section} ctx={ctx}>
      <div className="flex items-center gap-3 rounded-[var(--ros-radius-lg)] border-2 border-dashed border-current/30 p-5 ros-section-muted">
        <ImagePlus className="size-6 shrink-0" aria-hidden />
        <p className="text-sm"><span className="font-semibold ros-section-text">{SECTION_LABELS[section.type]}</span> — {message} <span>(Only you see this note.)</span></p>
      </div>
    </SectionShell>
  );
}

export type CollectionVariant = "grid" | "list" | "rail" | "spotlight" | "cards";

/** A set of dishes as a homepage section shows them; the variant overrides the theme's dish layout locally. */
export function ProductCollection({ products, variant, ctx }: { products: MenuProduct[]; variant: CollectionVariant; ctx: SectionContext }) {
  const card = (p: MenuProduct, i: number) => (
    <ProductCard key={p.id} product={p} currency={ctx.config.currency} priority={ctx.index < 2 && i < 2} language={ctx.language} showBadges={ctx.config.experience.menu.showBadges} />
  );
  if (variant === "rail") {
    return <div className="ros-rail ros-product-list" data-layout="grid">{products.map(card)}</div>;
  }
  if (variant === "spotlight" && products.length > 2) {
    const [first, ...rest] = products;
    return (
      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="ros-product-list [&_.ros-product-media]:aspect-[4/3]" data-layout="grid" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>{card(first!, 0)}</div>
        <div className="ros-product-list content-start" data-layout="compact" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>{rest.map((p, i) => card(p, i + 1))}</div>
      </div>
    );
  }
  return <div className="ros-product-list" data-layout={variant === "list" ? "list" : "grid"}>{products.map(card)}</div>;
}
