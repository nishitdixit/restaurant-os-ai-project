// Storefront brand experience (ADR-013): page composition, content and merchandising settings that sit next to
// the theme (ADR-012). Pure and shared by the API (validation + publish guardrail), the storefront (rendering) and
// the admin (builder + preview).
//
// Like the theme, an experience is never free-form markup or CSS: every value is an enum, a bounded number, a
// length-capped plain string or a reference id. Restaurant copy is a LocalizedText (English + Hindi) from day one.

export const EXPERIENCE_VERSION = 1 as const;

// Primitives ------------------------------------------------------------------------------------------------

export const LANGUAGE_MODES = ["en", "hi", "bilingual"] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

/** Restaurant-authored text. An empty string means "use the default" (or "not translated"). */
export interface LocalizedText {
  en: string;
  hi: string;
}

export function lt(en = "", hi = ""): LocalizedText {
  return { en, hi };
}

/** The text to show for a language mode: the primary line and, in bilingual mode, the second language. */
export function pickText(text: LocalizedText | null | undefined, mode: LanguageMode, fallback = ""): { primary: string; secondary: string | null } {
  const en = text?.en ?? "";
  const hi = text?.hi ?? "";
  if (mode === "hi") return { primary: hi || en || fallback, secondary: null };
  if (mode === "bilingual") {
    const primary = en || fallback;
    return { primary: primary || hi, secondary: primary && hi ? hi : null };
  }
  return { primary: en || fallback, secondary: null };
}

/** Plain string for places that take one line (alt text, aria labels, metadata). */
export function plainText(text: LocalizedText | null | undefined, mode: LanguageMode, fallback = ""): string {
  return pickText(text, mode, fallback).primary;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// Control characters other than newlines are stripped; text is rendered as plain text, never HTML.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

function str(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string") return "";
  let s = value.replace(CONTROL, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
}

function text(value: unknown, max: number, multiline = false): LocalizedText {
  if (typeof value === "string") return lt(str(value, max, multiline));
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { en: str(v.en, max, multiline), hi: str(v.hi, max, multiline) };
}

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback;
}

function ids(value: unknown, max: number): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(isUuid).map((v) => v.toLowerCase()))].slice(0, max) : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Calls to action -------------------------------------------------------------------------------------------

/** Where a button goes. Only in-store pages and the restaurant's own channels — never arbitrary URLs. */
export const CTA_TARGETS = ["menu", "category", "offers", "delivery-areas", "contact", "whatsapp", "call", "channels"] as const;
export type CtaTarget = (typeof CTA_TARGETS)[number];

export const CTA_DEFAULT_LABELS: Record<CtaTarget, string> = {
  menu: "Order direct",
  category: "See the menu",
  offers: "See offers",
  "delivery-areas": "Where we deliver",
  contact: "Visit us",
  whatsapp: "Order on WhatsApp",
  call: "Call to order",
  channels: "More ways to order",
};

export interface CallToAction {
  target: CtaTarget;
  /** Empty = the default label for the target. */
  label: LocalizedText;
  /** Only for target "category". */
  categorySlug: string;
}

function cta(value: unknown, fallback: CallToAction | null): CallToAction | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") return fallback;
  const v = obj(value);
  const target = pick(v.target, CTA_TARGETS, fallback?.target ?? "menu");
  const categorySlug = typeof v.categorySlug === "string" && SLUG.test(v.categorySlug) ? v.categorySlug.slice(0, 80) : "";
  if (target === "category" && !categorySlug) return { target: "menu", label: text(v.label, 40), categorySlug: "" };
  return { target, label: text(v.label, 40), categorySlug: target === "category" ? categorySlug : "" };
}

// Sections --------------------------------------------------------------------------------------------------

export const SECTION_TYPES = [
  "hero", "highlights", "categories", "featured", "bestsellers", "combos", "story", "gallery", "offers", "reviews", "delivery", "cta",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_VARIANTS = {
  hero: ["split", "centered", "image-left", "image-right", "full-bleed", "editorial", "minimal"],
  highlights: ["stats", "icons", "strip"],
  categories: ["image-cards", "square", "landscape", "text", "scroll"],
  featured: ["grid", "list", "rail", "spotlight"],
  bestsellers: ["grid", "list", "rail", "spotlight"],
  combos: ["cards", "rail", "list"],
  story: ["image-left", "image-right", "stacked", "overlay"],
  gallery: ["grid", "mosaic", "carousel"],
  offers: ["cards", "strip", "banner"],
  reviews: ["summary", "carousel", "wall"],
  delivery: ["banner", "areas", "checker"],
  cta: ["banner", "split", "minimal"],
} as const satisfies Record<SectionType, readonly string[]>;
export type SectionVariant<T extends SectionType> = (typeof SECTION_VARIANTS)[T][number];

/** How many of each section a homepage may have. */
export const SECTION_LIMITS: Record<SectionType, number> = {
  hero: 1, highlights: 2, categories: 1, featured: 3, bestsellers: 1, combos: 1, story: 3, gallery: 2, offers: 1, reviews: 1, delivery: 1, cta: 3,
};
export const MAX_SECTIONS = 20;

/** Section background: the page, a soft fill, the brand colour, or the theme inverted (dark band on light themes). */
export const SECTION_TONES = ["default", "subtle", "brand", "inverted"] as const;
export type SectionTone = (typeof SECTION_TONES)[number];

export const HERO_OPTIONS = {
  align: ["left", "center", "right"],
  height: ["compact", "standard", "tall"],
  /** Overlay for text placed on a photo; "none" is only allowed when text sits beside the photo. */
  overlay: ["none", "dark", "darker", "light"],
  imageFit: ["cover", "contain"],
} as const;
/** Hero variants whose text is drawn on top of the photo (they always get a readable overlay). */
export const HERO_TEXT_ON_IMAGE: readonly string[] = ["centered", "full-bleed"];

export const HIGHLIGHT_KINDS = ["custom", "orders", "rating", "hours", "delivery-time", "delivery-fee"] as const;
export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number];
export const HIGHLIGHT_ICONS = ["star", "flame", "leaf", "clock", "bike", "award", "heart", "shield", "chef", "sparkles", "map-pin", "utensils"] as const;
export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number];

export const REVIEW_SOURCES = ["google", "zomato", "swiggy", "tripadvisor", "other"] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];
export const REVIEW_SOURCE_LABELS: Record<ReviewSource, string> = { google: "Google", zomato: "Zomato", swiggy: "Swiggy", tripadvisor: "Tripadvisor", other: "Reviews" };

export const IMAGE_FITS = ["cover", "contain"] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

interface SectionBase<T extends SectionType> {
  id: string;
  type: T;
  enabled: boolean;
  variant: SectionVariant<T>;
  tone: SectionTone;
  /** Small label above the title (e.g. "AUTHENTIC VILLAGE DINING"). */
  eyebrow: LocalizedText;
  /** Empty = the section's default title. */
  title: LocalizedText;
  subtitle: LocalizedText;
}

export interface HeroSection extends SectionBase<"hero"> {
  imageId: string | null;
  align: (typeof HERO_OPTIONS.align)[number];
  height: (typeof HERO_OPTIONS.height)[number];
  overlay: (typeof HERO_OPTIONS.overlay)[number];
  imageFit: ImageFit;
  /** "Open now · Delivery in 20–45 min · from ₹20". */
  showStatus: boolean;
  showLogo: boolean;
  primaryCta: CallToAction;
  secondaryCta: CallToAction | null;
}

export interface HighlightItem {
  /** Automatic kinds are computed from real data and hidden when there is none; only "custom" uses the text below. */
  kind: HighlightKind;
  icon: HighlightIcon;
  value: LocalizedText;
  label: LocalizedText;
}
export interface HighlightsSection extends SectionBase<"highlights"> {
  items: HighlightItem[];
}

export interface CategoriesSection extends SectionBase<"categories"> {
  /** Empty = every category, in menu order. */
  categoryIds: string[];
  showCounts: boolean;
}

export interface FeaturedSection extends SectionBase<"featured"> {
  /** "picked": the merchant's dishes. "menu": the first available dishes, titled honestly ("From the menu"). */
  source: "picked" | "menu";
  productIds: string[];
  limit: number;
}

export interface BestsellersSection extends SectionBase<"bestsellers"> {
  limit: number;
}

export interface CombosSection extends SectionBase<"combos"> {
  /** Empty = dishes carrying the "Combo" badge. */
  productIds: string[];
  limit: number;
}

export interface StorySection extends SectionBase<"story"> {
  body: LocalizedText;
  imageId: string | null;
  imageFit: ImageFit;
  cta: CallToAction | null;
}

export interface GalleryImage { imageId: string; caption: LocalizedText }
export interface GallerySection extends SectionBase<"gallery"> {
  images: GalleryImage[];
}

export type OffersSection = SectionBase<"offers">;

export interface RatingSummary {
  /** 1.0–5.0, one decimal. */
  value: number;
  count: number;
  source: ReviewSource;
  /** Where customers can check the rating (required — a rating is never shown without its source). */
  url: string;
  /** "YYYY-MM": when the merchant read the figure. */
  asOf: string;
}
export interface Testimonial {
  quote: LocalizedText;
  author: string;
  source: ReviewSource;
  /** "YYYY-MM" or "". */
  date: string;
  rating: number | null;
}
export interface ReviewsSection extends SectionBase<"reviews"> {
  rating: RatingSummary | null;
  testimonials: Testimonial[];
}

export type DeliverySection = SectionBase<"delivery">;

export interface CtaSection extends SectionBase<"cta"> {
  imageId: string | null;
  primaryCta: CallToAction;
  secondaryCta: CallToAction | null;
}

export type Section =
  | HeroSection | HighlightsSection | CategoriesSection | FeaturedSection | BestsellersSection | CombosSection
  | StorySection | GallerySection | OffersSection | ReviewsSection | DeliverySection | CtaSection;
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;

// Site, menu and SEO settings ------------------------------------------------------------------------------

export const SITE_OPTIONS = {
  contentWidth: ["narrow", "standard", "wide"],
  header: ["standard", "centered", "minimal"],
  footer: ["detailed", "simple", "brand"],
} as const;

export const MENU_OPTIONS = {
  bestsellerWindowDays: [7, 14, 30, 60, 90],
} as const;

export interface ExperienceSite {
  language: LanguageMode;
  contentWidth: (typeof SITE_OPTIONS.contentWidth)[number];
  header: (typeof SITE_OPTIONS.header)[number];
  footer: (typeof SITE_OPTIONS.footer)[number];
  /** Shows "More ways to order" (WhatsApp, Swiggy, Zomato, call) next to "Order direct". */
  orderChannels: boolean;
  /** "Order on WhatsApp" buttons on dishes, the cart and checkout (shown only when a WhatsApp number is set). */
  whatsappOrdering: boolean;
}

export interface BestsellerRules {
  enabled: boolean;
  windowDays: (typeof MENU_OPTIONS.bestsellerWindowDays)[number];
  /** A dish needs at least this many paid orders in the window to be called a bestseller. */
  minOrders: number;
  /** At most this many dishes carry the badge. */
  limit: number;
}

export interface ExperienceMenu {
  /** Lets customers switch between photo cards and the dense menu board. */
  viewToggle: boolean;
  inlineSearch: boolean;
  vegFilter: boolean;
  showBadges: boolean;
  bestseller: BestsellerRules;
}

export interface ExperienceSeo {
  /** Empty = "<name> — Order online direct". */
  title: string;
  description: string;
  shareImageId: string | null;
}

export interface StoreExperience {
  version: typeof EXPERIENCE_VERSION;
  /** The preset whose layout this started from (informational). */
  layoutPresetId: string | null;
  site: ExperienceSite;
  menu: ExperienceMenu;
  seo: ExperienceSeo;
  sections: Section[];
}

// Defaults ------------------------------------------------------------------------------------------------

function base<T extends SectionType>(type: T, id: string, variant: SectionVariant<T>, extra: Partial<SectionBase<T>> = {}): SectionBase<T> {
  return { id, type, enabled: true, variant, tone: "default", eyebrow: lt(), title: lt(), subtitle: lt(), ...extra };
}

/** A complete, sensible section of each type (the builder's "Add section" starts from these). */
export function defaultSection<T extends SectionType>(type: T, id: string = type): SectionOf<T> {
  const sections: { [K in SectionType]: () => SectionOf<K> } = {
    hero: () => ({
      ...base("hero", id, "split"), imageId: null, align: "left", height: "standard", overlay: "dark", imageFit: "cover", showStatus: true, showLogo: true,
      primaryCta: { target: "menu", label: lt(), categorySlug: "" }, secondaryCta: { target: "channels", label: lt(), categorySlug: "" },
    }),
    highlights: () => ({
      ...base("highlights", id, "stats"),
      items: [
        { kind: "delivery-time", icon: "bike", value: lt(), label: lt() },
        { kind: "hours", icon: "clock", value: lt(), label: lt() },
        { kind: "orders", icon: "heart", value: lt(), label: lt() },
      ],
    }),
    categories: () => ({ ...base("categories", id, "image-cards"), categoryIds: [], showCounts: true }),
    featured: () => ({ ...base("featured", id, "grid"), source: "menu", productIds: [], limit: 6 }),
    bestsellers: () => ({ ...base("bestsellers", id, "rail"), limit: 8 }),
    combos: () => ({ ...base("combos", id, "cards"), productIds: [], limit: 6 }),
    story: () => ({ ...base("story", id, "image-left"), body: lt(), imageId: null, imageFit: "cover", cta: null }),
    gallery: () => ({ ...base("gallery", id, "grid"), images: [] }),
    offers: () => base("offers", id, "strip"),
    reviews: () => ({ ...base("reviews", id, "summary"), rating: null, testimonials: [] }),
    delivery: () => base("delivery", id, "banner"),
    cta: () => ({
      ...base("cta", id, "banner", { tone: "brand" }), imageId: null,
      primaryCta: { target: "menu", label: lt(), categorySlug: "" }, secondaryCta: null,
    }),
  };
  return (sections[type] as () => SectionOf<T>)();
}

export const DEFAULT_SITE: ExperienceSite = { language: "en", contentWidth: "standard", header: "standard", footer: "detailed", orderChannels: true, whatsappOrdering: true };
export const DEFAULT_MENU: ExperienceMenu = {
  viewToggle: false, inlineSearch: true, vegFilter: true, showBadges: true,
  bestseller: { enabled: true, windowDays: 30, minOrders: 5, limit: 6 },
};

/**
 * What a restaurant gets with no configuration: the original homepage, made section-driven. Sections without
 * content (no bestsellers yet, no combos, no story) are hidden on the live store until there is something to show.
 */
export function defaultExperience(): StoreExperience {
  return {
    version: EXPERIENCE_VERSION,
    layoutPresetId: null,
    site: { ...DEFAULT_SITE },
    menu: structuredClone(DEFAULT_MENU),
    seo: { title: "", description: "", shareImageId: null },
    sections: [
      defaultSection("hero"),
      defaultSection("offers"),
      defaultSection("categories"),
      defaultSection("bestsellers"),
      { ...defaultSection("combos"), variant: "rail" },
      defaultSection("featured"),
      { ...defaultSection("story"), variant: "stacked" },
      defaultSection("delivery"),
    ],
  };
}

// Normalisation ----------------------------------------------------------------------------------------------

function normalizeSection(input: unknown, fallbackId: string): Section | null {
  const v = obj(input);
  const type = v.type;
  if (!SECTION_TYPES.includes(type as SectionType)) return null;
  const t = type as SectionType;
  const d = defaultSection(t, fallbackId) as Section;
  const common = {
    id: typeof v.id === "string" && /^[a-z0-9-]{1,40}$/.test(v.id) ? v.id : fallbackId,
    type: t,
    enabled: bool(v.enabled, true),
    variant: pick(v.variant, SECTION_VARIANTS[t] as readonly string[], d.variant),
    tone: pick(v.tone, SECTION_TONES, d.tone),
    eyebrow: text(v.eyebrow, 60),
    title: text(v.title, 120),
    subtitle: text(v.subtitle, 300, true),
  };
  switch (t) {
    case "hero": {
      const h = d as HeroSection;
      const variant = common.variant as HeroSection["variant"];
      let overlay = pick(v.overlay, HERO_OPTIONS.overlay, h.overlay);
      // Text on a photo must stay readable whatever the photo looks like.
      if (HERO_TEXT_ON_IMAGE.includes(variant) && overlay === "none") overlay = "dark";
      return {
        ...common, type: "hero", variant, imageId: isUuid(v.imageId) ? v.imageId.toLowerCase() : null,
        align: pick(v.align, HERO_OPTIONS.align, h.align), height: pick(v.height, HERO_OPTIONS.height, h.height), overlay,
        imageFit: pick(v.imageFit, IMAGE_FITS, h.imageFit), showStatus: bool(v.showStatus, true), showLogo: bool(v.showLogo, true),
        primaryCta: cta(v.primaryCta, h.primaryCta) ?? h.primaryCta, secondaryCta: cta(v.secondaryCta, h.secondaryCta),
      };
    }
    case "highlights": {
      const items = (Array.isArray(v.items) ? v.items : []).slice(0, 6).map((raw): HighlightItem => {
        const i = obj(raw);
        return { kind: pick(i.kind, HIGHLIGHT_KINDS, "custom"), icon: pick(i.icon, HIGHLIGHT_ICONS, "star"), value: text(i.value, 24), label: text(i.label, 60) };
      }).filter((i) => i.kind !== "custom" || i.value.en || i.value.hi || i.label.en || i.label.hi);
      return { ...common, type: "highlights", variant: common.variant as HighlightsSection["variant"], items: Array.isArray(v.items) ? items : (d as HighlightsSection).items };
    }
    case "categories":
      return { ...common, type: "categories", variant: common.variant as CategoriesSection["variant"], categoryIds: ids(v.categoryIds, 40), showCounts: bool(v.showCounts, true) };
    case "featured":
      return {
        ...common, type: "featured", variant: common.variant as FeaturedSection["variant"], source: pick(v.source, ["picked", "menu"] as const, "menu"),
        productIds: ids(v.productIds, 12), limit: int(v.limit, 2, 12, 6),
      };
    case "bestsellers":
      return { ...common, type: "bestsellers", variant: common.variant as BestsellersSection["variant"], limit: int(v.limit, 2, 12, 8) };
    case "combos":
      return { ...common, type: "combos", variant: common.variant as CombosSection["variant"], productIds: ids(v.productIds, 12), limit: int(v.limit, 2, 12, 6) };
    case "story":
      return {
        ...common, type: "story", variant: common.variant as StorySection["variant"], body: text(v.body, 2000, true),
        imageId: isUuid(v.imageId) ? v.imageId.toLowerCase() : null, imageFit: pick(v.imageFit, IMAGE_FITS, "cover"), cta: cta(v.cta, null),
      };
    case "gallery": {
      const seen = new Set<string>();
      const images = (Array.isArray(v.images) ? v.images : []).map((raw) => obj(raw)).filter((i) => isUuid(i.imageId))
        .map((i) => ({ imageId: (i.imageId as string).toLowerCase(), caption: text(i.caption, 120) }))
        .filter((i) => (seen.has(i.imageId) ? false : (seen.add(i.imageId), true))).slice(0, 24);
      return { ...common, type: "gallery", variant: common.variant as GallerySection["variant"], images };
    }
    case "offers":
      return { ...common, type: "offers", variant: common.variant as OffersSection["variant"] };
    case "reviews": {
      const r = obj(v.rating);
      const value = typeof r.value === "number" && r.value >= 1 && r.value <= 5 ? Math.round(r.value * 10) / 10 : null;
      const url = typeof r.url === "string" && /^https:\/\/[^\s<>"']{3,300}$/.test(r.url) ? r.url : "";
      const asOf = typeof r.asOf === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.asOf) ? r.asOf : "";
      // A rating is only kept with its source and date, so the storefront can always say where it comes from.
      const rating: RatingSummary | null = value !== null && url && asOf
        ? { value, count: int(r.count, 0, 10_000_000, 0), source: pick(r.source, REVIEW_SOURCES, "google"), url, asOf } : null;
      const testimonials = (Array.isArray(v.testimonials) ? v.testimonials : []).slice(0, 12).map((raw): Testimonial => {
        const q = obj(raw);
        return {
          quote: text(q.quote, 400, true), author: str(q.author, 60), source: pick(q.source, REVIEW_SOURCES, "google"),
          date: typeof q.date === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.date) ? q.date : "",
          rating: typeof q.rating === "number" && q.rating >= 1 && q.rating <= 5 ? Math.round(q.rating) : null,
        };
      }).filter((q) => (q.quote.en || q.quote.hi) && q.author);
      return { ...common, type: "reviews", variant: common.variant as ReviewsSection["variant"], rating, testimonials };
    }
    case "delivery":
      return { ...common, type: "delivery", variant: common.variant as DeliverySection["variant"] };
    case "cta": {
      const c = d as CtaSection;
      return {
        ...common, type: "cta", variant: common.variant as CtaSection["variant"], imageId: isUuid(v.imageId) ? v.imageId.toLowerCase() : null,
        primaryCta: cta(v.primaryCta, c.primaryCta) ?? c.primaryCta, secondaryCta: cta(v.secondaryCta, null),
      };
    }
  }
}

/**
 * Coerces any stored or submitted value into a valid experience: unknown keys and section types are dropped,
 * invalid values fall back to defaults, text is capped and stripped of control characters, per-type section
 * limits are enforced in page order and section ids are made unique.
 */
export function normalizeExperience(input: unknown, fallback: StoreExperience = defaultExperience()): StoreExperience {
  const e = obj(input);
  const site = obj(e.site);
  const menu = obj(e.menu);
  const bs = obj(menu.bestseller);
  const seo = obj(e.seo);
  const counts = new Map<SectionType, number>();
  const usedIds = new Set<string>();
  const sections: Section[] = [];
  const rawSections = Array.isArray(e.sections) ? e.sections : fallback.sections;
  for (const [index, raw] of rawSections.entries()) {
    if (sections.length >= MAX_SECTIONS) break;
    const section = normalizeSection(raw, `${String(obj(raw).type ?? "section")}-${index + 1}`.replace(/[^a-z0-9-]/g, "").slice(0, 40) || `section-${index + 1}`);
    if (!section) continue;
    const n = counts.get(section.type) ?? 0;
    if (n >= SECTION_LIMITS[section.type]) continue;
    counts.set(section.type, n + 1);
    let id = section.id;
    for (let i = 2; usedIds.has(id); i++) id = `${section.id.slice(0, 36)}-${i}`;
    usedIds.add(id);
    sections.push({ ...section, id });
  }
  return {
    version: EXPERIENCE_VERSION,
    layoutPresetId: typeof e.layoutPresetId === "string" && /^[a-z0-9-]{1,40}$/.test(e.layoutPresetId) ? e.layoutPresetId : e.layoutPresetId === null ? null : fallback.layoutPresetId,
    site: {
      language: pick(site.language, LANGUAGE_MODES, fallback.site.language),
      contentWidth: pick(site.contentWidth, SITE_OPTIONS.contentWidth, fallback.site.contentWidth),
      header: pick(site.header, SITE_OPTIONS.header, fallback.site.header),
      footer: pick(site.footer, SITE_OPTIONS.footer, fallback.site.footer),
      orderChannels: bool(site.orderChannels, fallback.site.orderChannels),
      whatsappOrdering: bool(site.whatsappOrdering, fallback.site.whatsappOrdering),
    },
    menu: {
      viewToggle: bool(menu.viewToggle, fallback.menu.viewToggle),
      inlineSearch: bool(menu.inlineSearch, fallback.menu.inlineSearch),
      vegFilter: bool(menu.vegFilter, fallback.menu.vegFilter),
      showBadges: bool(menu.showBadges, fallback.menu.showBadges),
      bestseller: {
        enabled: bool(bs.enabled, fallback.menu.bestseller.enabled),
        windowDays: pick(bs.windowDays, MENU_OPTIONS.bestsellerWindowDays, fallback.menu.bestseller.windowDays),
        minOrders: int(bs.minOrders, 1, 100, fallback.menu.bestseller.minOrders),
        limit: int(bs.limit, 1, 12, fallback.menu.bestseller.limit),
      },
    },
    seo: {
      title: str(seo.title, 70),
      description: str(seo.description, 160),
      shareImageId: isUuid(seo.shareImageId) ? seo.shareImageId.toLowerCase() : null,
    },
    sections,
  };
}

// References ---------------------------------------------------------------------------------------------------

/** Every media id an experience uses (the API checks they belong to the restaurant; the storefront resolves URLs). */
export function experienceMediaIds(experience: StoreExperience): string[] {
  const out = new Set<string>();
  if (experience.seo.shareImageId) out.add(experience.seo.shareImageId);
  for (const s of experience.sections) {
    if ((s.type === "hero" || s.type === "story" || s.type === "cta") && s.imageId) out.add(s.imageId);
    if (s.type === "gallery") for (const i of s.images) out.add(i.imageId);
  }
  return [...out];
}

/** Drops references the restaurant doesn't own (ids from another tenant, deleted media) — used by the API on save. */
export function filterExperienceReferences(experience: StoreExperience, allowed: { media: Set<string>; products: Set<string>; categories: Set<string> }): StoreExperience {
  const media = (id: string | null) => (id && allowed.media.has(id) ? id : null);
  const sections = experience.sections.map((s): Section => {
    switch (s.type) {
      case "hero": return { ...s, imageId: media(s.imageId) };
      case "story": return { ...s, imageId: media(s.imageId) };
      case "cta": return { ...s, imageId: media(s.imageId) };
      case "gallery": return { ...s, images: s.images.filter((i) => allowed.media.has(i.imageId)) };
      case "featured": return { ...s, productIds: s.productIds.filter((id) => allowed.products.has(id)) };
      case "combos": return { ...s, productIds: s.productIds.filter((id) => allowed.products.has(id)) };
      case "categories": return { ...s, categoryIds: s.categoryIds.filter((id) => allowed.categories.has(id)) };
      default: return s;
    }
  });
  return { ...experience, seo: { ...experience.seo, shareImageId: media(experience.seo.shareImageId) }, sections };
}

// Guardrails ---------------------------------------------------------------------------------------------------

export interface ExperienceIssue {
  key: string;
  /** The section the issue belongs to (null = site-wide). */
  sectionId: string | null;
  /** Plain-language explanation for the merchant. */
  message: string;
}

export interface ExperienceCheck {
  /** Block publishing. */
  errors: ExperienceIssue[];
  /** Shown in the builder; publishing is still allowed. */
  warnings: ExperienceIssue[];
}

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero banner", highlights: "Highlights", categories: "Categories", featured: "Featured dishes", bestsellers: "Bestsellers",
  combos: "Combos & specials", story: "Story", gallery: "Gallery", offers: "Offers", reviews: "Reviews", delivery: "Delivery", cta: "Call to action",
};

/**
 * Publishing rules (BUSINESS_RULES "Storefront brand experience"): every photo shown on the homepage needs alt text
 * for screen readers. Warnings flag sections that will be hidden because they have nothing to show, and missing
 * translations in Hindi or bilingual mode.
 */
export function checkExperience(experience: StoreExperience, media: { altText: (id: string) => string | undefined }): ExperienceCheck {
  const errors: ExperienceIssue[] = [];
  const warnings: ExperienceIssue[] = [];
  const label = (s: Section) => SECTION_LABELS[s.type];
  const needsAlt = (s: Section, id: string | null, what: string) => {
    if (!id) return;
    const alt = media.altText(id);
    if (alt === undefined) warnings.push({ key: `missing-image-${s.id}-${id}`, sectionId: s.id, message: `${label(s)}: a photo was removed from your library, so it won't show.` });
    else if (!alt.trim()) errors.push({ key: `alt-${s.id}-${id}`, sectionId: s.id, message: `${label(s)}: describe the ${what} for people using screen readers (alt text).` });
  };
  for (const s of experience.sections) {
    if (!s.enabled) continue;
    if (s.type === "hero") needsAlt(s, s.imageId, "banner photo");
    if (s.type === "story") {
      needsAlt(s, s.imageId, "story photo");
      if (!s.body.en && !s.body.hi && !s.title.en && !s.title.hi) warnings.push({ key: `empty-${s.id}`, sectionId: s.id, message: `${label(s)}: add your story — until then it shows your "About" text, or stays hidden.` });
    }
    if (s.type === "cta") needsAlt(s, s.imageId, "photo");
    if (s.type === "gallery") {
      for (const i of s.images) needsAlt(s, i.imageId, "photo");
      if (!s.images.length) warnings.push({ key: `empty-${s.id}`, sectionId: s.id, message: `${label(s)}: add photos — it's hidden until then.` });
    }
    if (s.type === "featured" && s.source === "picked" && !s.productIds.length) warnings.push({ key: `empty-${s.id}`, sectionId: s.id, message: `${label(s)}: pick some dishes — it's hidden until then.` });
    if (s.type === "reviews" && !s.rating && !s.testimonials.length) warnings.push({ key: `empty-${s.id}`, sectionId: s.id, message: `${label(s)}: add your rating (with a link to where it comes from) or a few reviews — it's hidden until then.` });
  }
  if (experience.seo.shareImageId && media.altText(experience.seo.shareImageId) === undefined) {
    warnings.push({ key: "seo-share-image", sectionId: null, message: "Search & sharing: the share image was removed from your library." });
  }
  if (experience.site.language !== "en") {
    const untranslated = experience.sections.filter((s) => s.enabled && ((s.title.en && !s.title.hi) || (s.subtitle.en && !s.subtitle.hi) || (s.type === "story" && s.body.en && !s.body.hi)));
    if (untranslated.length) {
      warnings.push({ key: "translations", sectionId: null, message: `Hindi text is missing in ${untranslated.length} section${untranslated.length === 1 ? "" : "s"}; the English text is shown instead.` });
    }
  }
  return { errors, warnings };
}
