// Complete storefront presets (ADR-013 "Presets"): each theme preset (theme-presets.ts) is paired with a page
// composition, menu presentation, navigation, footer and merchandising defaults, so "Use this style" gives a
// restaurant a coherent, professionally designed website in one click. The design rationale for every preset is in
// ui/THEME_PRESETS.md.
//
// Applying a layout never destroys the restaurant's own content: story text, photos, reviews, highlights and
// picked dishes carry over to the matching section; sections the preset doesn't use are switched off, not deleted.
// The language setting, SEO text and bestseller rules are the restaurant's business and are kept as they are.
import {
  defaultExperience, defaultSection, EXPERIENCE_VERSION, lt, normalizeExperience,
  type ExperienceMenu, type ExperienceSite, type Section, type SectionOf, type SectionType, type SectionVariant, type StoreExperience,
} from "./experience.ts";
import { presetById, THEME_PRESETS } from "./theme-presets.ts";

/**
 * One section of a preset's homepage: type, layout choices and default titles (used when the restaurant has none).
 * Default copy stays neutral — it never claims anything about the restaurant's food or history (a café preset on a
 * biryani kitchen must not say "Coffee · Brunch"); highlights use only automatic, data-backed facts.
 */
export type PresetSection = { [T in SectionType]: { type: T; variant: SectionVariant<T> } & Partial<Omit<SectionOf<T>, "type" | "variant" | "id">> }[SectionType];

export interface PresetDesign {
  /** Who the preset is for (shown in the gallery). */
  archetype: string;
  /** One line of personality: "Cinematic, restrained and premium". */
  personality: string;
  /** Three to five design traits shown as chips: "Dark surfaces · editorial serif · wide photos". */
  traits: string[];
  site: Omit<ExperienceSite, "language">;
  /** Presentation only; the restaurant's bestseller rules, search and veg-filter choices are kept. */
  menu: Pick<ExperienceMenu, "viewToggle" | "showBadges">;
  sections: PresetSection[];
}

const t = (en: string) => lt(en);
const s = <T extends SectionType>(type: T, variant: SectionVariant<T>, extra: Partial<Omit<SectionOf<T>, "type" | "variant" | "id">> = {}): PresetSection =>
  ({ type, variant, ...extra }) as PresetSection;

export const PRESET_DESIGNS: Record<string, PresetDesign> = {
  classic: {
    archetype: "Any restaurant",
    personality: "Clean, familiar and quick to order from",
    traits: ["Neutral greys", "Split banner", "Photo categories", "List menu"],
    site: { contentWidth: "standard", header: "standard", footer: "detailed", orderChannels: true },
    menu: { viewToggle: false, showBadges: true },
    sections: [
      s("hero", "split"), s("offers", "strip"), s("categories", "image-cards"), s("bestsellers", "rail"), s("combos", "rail"),
      s("featured", "grid", { source: "menu" }), s("story", "stacked"), s("delivery", "banner"),
    ],
  },
  "saffron-house": {
    archetype: "Biryani & North Indian — family orders and celebrations",
    personality: "Rich, generous and proud of its heritage",
    traits: ["Ivory & maroon", "Playfair headings", "Photo on the right", "Family feasts", "Centered header"],
    site: { contentWidth: "standard", header: "centered", footer: "brand", orderChannels: true },
    menu: { viewToggle: true, showBadges: true },
    sections: [
      s("hero", "image-right", { height: "standard" }),
      s("highlights", "stats", { tone: "subtle" }),
      s("bestsellers", "spotlight", { title: t("House favourites") }),
      s("combos", "cards", { title: t("Family feasts"), subtitle: t("Made to share.") }),
      s("categories", "square"),
      s("story", "image-left", { eyebrow: t("Our kitchen") }),
      s("reviews", "summary"),
      s("cta", "banner", { tone: "brand", title: t("Dinner sorted? We'll bring it hot.") }),
      s("delivery", "checker"),
    ],
  },
  rapid: {
    archetype: "Quick service — burgers, rolls, pizza; impulse and deal-driven",
    personality: "Loud, fast and built to get you to the deal",
    traits: ["Red & yellow", "Heavy capitals", "Deal banner first", "Meal-deal rail", "Expressive motion"],
    site: { contentWidth: "wide", header: "standard", footer: "simple", orderChannels: true },
    menu: { viewToggle: false, showBadges: true },
    sections: [
      s("hero", "full-bleed", { height: "compact", overlay: "darker" }),
      s("offers", "banner"),
      s("combos", "rail", { title: t("Meal deals") }),
      s("categories", "scroll", { title: t("What are you craving?") }),
      s("bestsellers", "grid", { title: t("Bestsellers") }),
      s("featured", "rail", { source: "menu", title: t("Hot picks") }),
      s("delivery", "banner", { tone: "brand" }),
    ],
  },
  "cafe-linen": {
    archetype: "Cafés & brunch — slow mornings, coffee and pickup orders",
    personality: "Calm, considered and photographic",
    traits: ["Linen & charcoal", "Fraunces serif", "Editorial banner", "Story & gallery", "Quiet labels"],
    site: { contentWidth: "narrow", header: "centered", footer: "simple", orderChannels: false },
    menu: { viewToggle: true, showBadges: true },
    sections: [
      s("hero", "editorial"),
      s("story", "image-right", { eyebrow: t("Our café") }),
      s("featured", "list", { source: "menu", title: t("On the menu today") }),
      s("gallery", "mosaic", { title: t("Around the café") }),
      s("highlights", "icons"),
      s("reviews", "wall", { tone: "subtle" }),
      s("cta", "minimal", { title: t("Order ahead, skip the queue"), primaryCta: { target: "menu", label: t("Order now"), categorySlug: "" } }),
    ],
  },
  noir: {
    archetype: "Fine dining & premium — special occasions, chef-led menus",
    personality: "Cinematic, restrained and premium",
    traits: ["Dark surfaces", "Editorial serif", "Full-screen photo", "Wide imagery", "No discount banners"],
    site: { contentWidth: "narrow", header: "centered", footer: "brand", orderChannels: false },
    menu: { viewToggle: true, showBadges: true },
    sections: [
      s("hero", "full-bleed", { height: "tall", overlay: "darker", align: "center", showStatus: false }),
      s("story", "overlay", { eyebrow: t("The kitchen") }),
      s("featured", "spotlight", { source: "menu", title: t("Signatures") }),
      s("gallery", "carousel"),
      s("reviews", "carousel"),
      s("cta", "minimal", { title: t("An evening in, done properly"), primaryCta: { target: "menu", label: t("View the menu"), categorySlug: "" } }),
    ],
  },
  "fresh-bowl": {
    archetype: "Healthy food, salads & juices — weekday lunches, repeat ordering",
    personality: "Light, friendly and fresh",
    traits: ["Leaf green & citrus", "Rounded shapes", "Airy split banner", "Icon highlights", "Delivery checker"],
    site: { contentWidth: "standard", header: "standard", footer: "detailed", orderChannels: true },
    menu: { viewToggle: false, showBadges: true },
    sections: [
      s("hero", "split", { height: "standard" }),
      s("highlights", "icons", { items: [
        { kind: "delivery-time", icon: "bike", value: lt(), label: lt() },
        { kind: "delivery-fee", icon: "map-pin", value: lt(), label: lt() },
        { kind: "rating", icon: "star", value: lt(), label: lt() },
        { kind: "orders", icon: "heart", value: lt(), label: lt() },
      ] }),
      s("categories", "landscape"),
      s("bestsellers", "grid", { title: t("Most ordered") }),
      s("offers", "cards"),
      s("story", "stacked", { tone: "subtle" }),
      s("delivery", "checker"),
    ],
  },
  "sugar-bloom": {
    archetype: "Bakeries, cakes & desserts — gifting, birthdays, occasions",
    personality: "Sweet, joyful and made for gifting",
    traits: ["Blush & raspberry", "Rounded display type", "Photo-first", "Sticker badges", "Expressive motion"],
    site: { contentWidth: "standard", header: "centered", footer: "brand", orderChannels: true },
    menu: { viewToggle: false, showBadges: true },
    sections: [
      s("hero", "centered", { height: "standard", overlay: "light", align: "center" }),
      s("categories", "square", { title: t("Something sweet") }),
      s("bestsellers", "rail", { title: t("Most loved") }),
      s("combos", "cards", { title: t("Celebration boxes") }),
      s("gallery", "grid", { title: t("Fresh from our kitchen") }),
      s("reviews", "carousel", { tone: "subtle" }),
      s("cta", "banner", { tone: "brand", title: t("Celebrating something? Order ahead.") }),
    ],
  },
  "banana-leaf": {
    archetype: "South Indian, tiffin & meals — breakfast rush, long menus, regulars",
    personality: "Traditional warmth, cleanly organised",
    traits: ["Leaf green header", "Turmeric accent", "Lora serif", "Tabbed long menu", "No-nonsense speed"],
    site: { contentWidth: "standard", header: "standard", footer: "brand", orderChannels: true },
    menu: { viewToggle: true, showBadges: true },
    sections: [
      s("hero", "image-left", { height: "compact" }),
      s("highlights", "strip", { tone: "subtle" }),
      s("categories", "scroll"),
      s("combos", "list", { title: t("Meals & combos") }),
      s("featured", "list", { source: "menu", title: t("Everyday favourites") }),
      s("offers", "strip"),
      s("delivery", "areas"),
    ],
  },
  "street-pop": {
    archetype: "Street food, chaat & food trucks — playful, quick, shareable",
    personality: "Loud, fun and impossible to miss",
    traits: ["Sunny yellow", "Thick outlines", "Offset shadows", "Sticker badges", "Swipe rails"],
    site: { contentWidth: "wide", header: "standard", footer: "brand", orderChannels: true },
    menu: { viewToggle: false, showBadges: true },
    sections: [
      s("hero", "full-bleed", { height: "compact", overlay: "dark" }),
      s("offers", "banner"),
      s("bestsellers", "rail", { title: t("Crowd favourites") }),
      s("categories", "scroll"),
      s("highlights", "strip", { tone: "inverted" }),
      s("gallery", "carousel", { title: t("Straight from the counter") }),
      s("cta", "banner", { tone: "brand", title: t("Hungry? Order now!") }),
    ],
  },
  "cloud-kitchen-pro": {
    archetype: "Delivery-first & multi-brand kitchens — speed and repeat orders",
    personality: "Efficient, neutral and menu-first",
    traits: ["Cool greys & blue", "Compact list", "Minimal banner", "Category circles", "No motion"],
    site: { contentWidth: "wide", header: "minimal", footer: "simple", orderChannels: true },
    menu: { viewToggle: false, showBadges: true },
    sections: [
      s("hero", "minimal"),
      s("offers", "strip"),
      s("categories", "scroll", { title: t("Order by category") }),
      s("bestsellers", "rail", { title: t("Reorder favourites") }),
      s("featured", "list", { source: "menu", title: t("Full menu"), limit: 12 }),
      s("delivery", "banner"),
    ],
  },
  trattoria: {
    archetype: "Pizza, pasta & Italian — family dinners, sharing",
    personality: "Warm, generous neighbourhood trattoria",
    traits: ["Tomato & basil", "Slab-serif headings", "Framed photo banner", "Landscape photos", "Family deals"],
    site: { contentWidth: "standard", header: "standard", footer: "brand", orderChannels: true },
    menu: { viewToggle: true, showBadges: true },
    sections: [
      s("hero", "image-left", { height: "tall" }),
      s("featured", "grid", { source: "menu", title: t("From our kitchen") }),
      s("story", "image-left", { eyebrow: t("La famiglia") }),
      s("categories", "landscape"),
      s("combos", "cards", { title: t("Family deals") }),
      s("reviews", "summary", { tone: "subtle" }),
      s("delivery", "banner"),
    ],
  },
  "chai-adda": {
    archetype: "Tea, snacks & quick bites — regulars, evening cravings",
    personality: "Cosy, chatty and like a corner chai stall",
    traits: ["Kraft browns", "Dark header", "Menu board", "Chai + snack combos", "Sticker badges"],
    site: { contentWidth: "standard", header: "standard", footer: "detailed", orderChannels: true },
    menu: { viewToggle: true, showBadges: true },
    sections: [
      s("hero", "image-left", { height: "compact" }),
      s("highlights", "strip"),
      s("combos", "rail", { title: t("Perfect pairings") }),
      s("bestsellers", "list", { title: t("Regulars' favourites") }),
      s("story", "stacked", { tone: "subtle" }),
      s("offers", "cards"),
      s("delivery", "checker"),
    ],
  },
  "wok-ember": {
    archetype: "Pan-Asian, grills & late-night — bold flavours, night-time ordering",
    personality: "Dark, sharp and appetising",
    traits: ["Charcoal & chilli", "Capitals", "Full-bleed banner", "Spotlight dishes", "Photo mosaic"],
    site: { contentWidth: "wide", header: "standard", footer: "brand", orderChannels: true },
    menu: { viewToggle: false, showBadges: true },
    sections: [
      s("hero", "full-bleed", { height: "standard", overlay: "darker" }),
      s("categories", "image-cards"),
      s("bestsellers", "spotlight", { title: t("Fired up tonight") }),
      s("combos", "rail", { title: t("Combos") }),
      s("gallery", "mosaic"),
      s("offers", "banner"),
      s("cta", "banner", { tone: "inverted", title: t("Late-night cravings? We're on it.") }),
    ],
  },
};

export function presetDesign(presetId: string | null | undefined): PresetDesign {
  return (presetId && PRESET_DESIGNS[presetId]) || PRESET_DESIGNS.classic!;
}

/** The fields of each section type that hold the restaurant's own content (kept when a layout is applied). */
const CONTENT_KEYS: Partial<Record<SectionType, string[]>> = {
  hero: ["imageId", "primaryCta", "secondaryCta", "showLogo"],
  highlights: ["items"],
  categories: ["categoryIds", "showCounts"],
  featured: ["source", "productIds"],
  combos: ["productIds"],
  story: ["body", "imageId", "imageFit", "cta"],
  gallery: ["images"],
  reviews: ["rating", "testimonials"],
  cta: ["imageId", "primaryCta", "secondaryCta"],
};

const hasText = (v: { en: string; hi: string }) => !!(v.en || v.hi);

/** A preset's homepage as a complete experience (for a brand-new restaurant, or the gallery preview). */
export function presetExperience(presetId: string): StoreExperience {
  return applyLayoutPreset(defaultExperience(), presetId, { keepContent: false });
}

/**
 * Applies a preset's layout to an experience. Sections follow the preset's order, variants and tones; each takes
 * over the content of the restaurant's existing section of the same type (titles too, when the restaurant wrote
 * one). Sections the preset doesn't use are kept, switched off, at the end.
 */
export function applyLayoutPreset(current: StoreExperience, presetId: string, options: { keepContent?: boolean } = {}): StoreExperience {
  const design = presetDesign(presetId);
  const keep = options.keepContent !== false;
  // Titles that are just the previous preset's default copy aren't the restaurant's own words: they are replaced.
  const previous = current.layoutPresetId ? PRESET_DESIGNS[current.layoutPresetId] : undefined;
  const previousCopy = (type: SectionType, key: "eyebrow" | "title" | "subtitle") =>
    previous?.sections.filter((x) => x.type === type).map((x) => (x as { [k: string]: unknown })[key] as { en: string; hi: string } | undefined).filter(Boolean) ?? [];
  const isOwnText = (type: SectionType, key: "eyebrow" | "title" | "subtitle", value: { en: string; hi: string }) =>
    hasText(value) && !previousCopy(type, key).some((d) => d!.en === value.en && d!.hi === value.hi);
  const pool = keep ? [...current.sections] : [];
  const used = new Set<Section>();
  const sections: Section[] = design.sections.map((spec, index) => {
    const existing = pool.find((x) => x.type === spec.type && !used.has(x));
    if (existing) used.add(existing);
    const base = defaultSection(spec.type, existing?.id ?? `${spec.type}-${index + 1}`) as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = { ...base, ...spec, enabled: true, tone: spec.tone ?? "default", id: existing?.id ?? base.id };
    if (existing) {
      const old = existing as unknown as Record<string, unknown>;
      for (const key of CONTENT_KEYS[spec.type] ?? []) {
        // A picked "featured" list stays picked; the preset only decides how it looks.
        if (key === "source" && spec.type === "featured" && (old.productIds as string[]).length === 0) continue;
        if (key === "items" && !(old.items as unknown[]).length) continue;
        next[key] = old[key];
      }
      for (const key of ["eyebrow", "title", "subtitle"] as const) if (isOwnText(spec.type, key, existing[key])) next[key] = existing[key];
    }
    return next as unknown as Section;
  });
  const leftovers = pool.filter((x) => !used.has(x)).map((x) => ({ ...x, enabled: false }));
  return normalizeExperience({
    version: EXPERIENCE_VERSION,
    layoutPresetId: presetId,
    site: { ...design.site, language: current.site.language },
    menu: { ...current.menu, ...design.menu },
    seo: current.seo,
    sections: [...sections, ...leftovers],
  }, current);
}

/** Every theme preset has a page design (enforced by tests). */
export function presetsWithoutDesign(): string[] {
  return THEME_PRESETS.map((p) => p.id).filter((id) => !PRESET_DESIGNS[id] || !presetById(id));
}
