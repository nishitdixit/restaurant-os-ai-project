// Storefront side of the brand experience (ADR-013): language, links for calls to action, media lookup and the few
// CSS variables an experience adds next to the theme's. Server-safe (no hooks).
import { CTA_DEFAULT_LABELS, pickText, type CallToAction, type LanguageMode, type LocalizedText, type StoreExperience } from "@restaurant-os/domain";
import type { MediaRef, MenuProduct, StoreConfig } from "@restaurant-os/types";

export const CONTENT_WIDTHS: Record<StoreExperience["site"]["contentWidth"], string> = { narrow: "64rem", standard: "72rem", wide: "80rem" };

/** CSS variables an experience contributes on <html> (next to the theme's). */
export function experienceVariables(experience: StoreExperience): Record<string, string> {
  return { "--ros-content-width": CONTENT_WIDTHS[experience.site.contentWidth] };
}

export function language(config: StoreConfig): LanguageMode {
  return config.experience.site.language;
}

/** Primary text (+ second language in bilingual mode) for restaurant copy. */
export function localized(config: StoreConfig, text: LocalizedText | null | undefined, fallback = "") {
  return pickText(text, language(config), fallback);
}

/** A dish's name in the store's language mode: primary line plus the Hindi line in bilingual mode. */
export function dishName(product: Pick<MenuProduct, "name" | "nameHi">, mode: LanguageMode) {
  return pickText({ en: product.name, hi: product.nameHi }, mode, product.name);
}

export function dishDescription(product: Pick<MenuProduct, "description" | "descriptionHi">, mode: LanguageMode): string {
  return pickText({ en: product.description, hi: product.descriptionHi }, mode).primary;
}

export function media(config: StoreConfig, id: string | null | undefined): MediaRef | null {
  return id ? config.media[id] ?? null : null;
}

/** The restaurant's WhatsApp number in wa.me form (country code, digits only); null when not usable. */
export function whatsappNumber(number: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

export function whatsappLink(number: string, text?: string): string | null {
  const full = whatsappNumber(number);
  return full ? `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
}

export interface ResolvedCta {
  label: string;
  /** null for "channels" (opens the "More ways to order" sheet). */
  href: string | null;
  external: boolean;
  target: CallToAction["target"];
}

/** Where a call to action goes and what it says; null when the restaurant can't support it (e.g. no WhatsApp). */
export function resolveCta(config: StoreConfig, cta: CallToAction | null | undefined): ResolvedCta | null {
  if (!cta) return null;
  const label = localized(config, cta.label, CTA_DEFAULT_LABELS[cta.target]).primary;
  switch (cta.target) {
    case "menu": return { label, href: "/menu", external: false, target: cta.target };
    case "category": return { label, href: `/${cta.categorySlug}`, external: false, target: cta.target };
    case "offers": return { label, href: "/offers", external: false, target: cta.target };
    case "delivery-areas": return { label, href: "/delivery-areas", external: false, target: cta.target };
    case "contact": return { label, href: "/contact", external: false, target: cta.target };
    case "whatsapp": {
      const href = whatsappLink(config.links.whatsapp, `Hi ${config.name}, I'd like to place an order.`);
      return href ? { label, href, external: true, target: cta.target } : null;
    }
    case "call": return config.outlet?.phone ? { label, href: `tel:${config.outlet.phone}`, external: true, target: cta.target } : null;
    case "channels": return hasOtherChannels(config) ? { label, href: null, external: false, target: cta.target } : null;
  }
}

/** True when there is somewhere else to order (WhatsApp, Swiggy, Zomato or a phone number). */
export function hasOtherChannels(config: StoreConfig): boolean {
  return !!(whatsappLink(config.links.whatsapp) || config.links.swiggy || config.links.zomato || config.outlet?.phone);
}

/** "Delivery in 20–45 min" / "Pickup in about 20 min". */
export function etaText(config: StoreConfig): string | null {
  const o = config.outlet;
  if (!o) return null;
  const areas = config.deliveryAreas;
  if (o.deliveryEnabled && areas.length) {
    const min = Math.min(...areas.map((a) => a.etaMin));
    const max = Math.max(...areas.map((a) => a.etaMax));
    return `Delivery in ${min}–${max} min`;
  }
  if (o.pickupEnabled) return `Pickup in about ${o.prepMinutes} min`;
  return null;
}

/** The lowest delivery fee across areas, or null without delivery. */
export function lowestFee(config: StoreConfig): number | null {
  return config.deliveryAreas.length ? Math.min(...config.deliveryAreas.map((a) => a.feeMinor)) : null;
}

/** The lowest free-delivery threshold across areas that have one. */
export function freeDeliveryFrom(config: StoreConfig): number | null {
  const thresholds = config.deliveryAreas.map((a) => a.freeDeliveryMinimumMinor).filter((v): v is number => v !== null);
  return thresholds.length ? Math.min(...thresholds) : null;
}

/** Plain paragraphs from a multi-line text (blank line = new paragraph). */
export function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}
