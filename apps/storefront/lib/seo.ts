// Structured data (docs/SEO.md): accurate schema.org data that mirrors what the page shows.
import type { Menu, MenuProduct, StoreConfig } from "@restaurant-os/types";
import { SITE_URL } from "./site";

const DAY_NAMES: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

function price(minor: number) {
  return (minor / 100).toFixed(2);
}

export function restaurantJsonLd(config: StoreConfig) {
  const o = config.outlet;
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${SITE_URL}/#restaurant`,
    name: config.name,
    description: config.description || config.tagline || undefined,
    url: SITE_URL,
    image: config.logoUrl ?? undefined,
    logo: config.logoUrl ?? undefined,
    telephone: o?.phone ?? undefined,
    servesCuisine: config.cuisines.length ? config.cuisines : undefined,
    priceRange: "₹₹",
    hasMenu: `${SITE_URL}/menu`,
    acceptsReservations: false,
    address: o ? {
      "@type": "PostalAddress",
      streetAddress: [o.address.line1, o.address.line2].filter(Boolean).join(", ") || undefined,
      addressLocality: o.address.city || undefined,
      addressRegion: o.address.region || undefined,
      postalCode: o.address.postalCode || undefined,
      addressCountry: "IN",
    } : undefined,
    geo: o?.location ? { "@type": "GeoCoordinates", latitude: o.location.latitude, longitude: o.location.longitude } : undefined,
    openingHoursSpecification: o ? Object.entries(o.hours).flatMap(([day, ranges]) => (ranges ?? []).map(([opens, closes]) => ({
      "@type": "OpeningHoursSpecification", dayOfWeek: DAY_NAMES[day], opens, closes,
    }))) : undefined,
    potentialAction: { "@type": "OrderAction", target: `${SITE_URL}/menu`, deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModeOwnFleet", "http://purl.org/goodrelations/v1#DeliveryModePickUp"] },
    sameAs: [config.links.instagram, config.links.website, config.links.swiggy, config.links.zomato].filter(Boolean),
  };
}

function menuItem(p: MenuProduct, currency: string) {
  return {
    "@type": "MenuItem",
    name: p.name,
    description: p.description || undefined,
    url: `${SITE_URL}/menu/${p.slug}`,
    image: p.imageUrl ?? undefined,
    suitableForDiet: p.dietary === "VEG" || p.dietary === "VEGAN" ? `https://schema.org/${p.dietary === "VEGAN" ? "Vegan" : "Vegetarian"}Diet` : undefined,
    offers: { "@type": "Offer", price: price(p.priceMinor), priceCurrency: currency, availability: p.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  };
}

export function menuJsonLd(config: StoreConfig, menu: Menu) {
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: `${config.name} menu`,
    url: `${SITE_URL}/menu`,
    inLanguage: "en-IN",
    hasMenuSection: menu.categories.map((c) => ({
      "@type": "MenuSection",
      name: c.name,
      url: `${SITE_URL}/${c.slug}`,
      hasMenuItem: c.products.map((p) => menuItem(p, config.currency)),
    })),
  };
}

export function productJsonLd(config: StoreConfig, p: MenuProduct) {
  return { "@context": "https://schema.org", ...menuItem(p, config.currency), menuAddOn: p.modifierGroups.length ? p.modifierGroups.map((g) => ({
    "@type": "MenuSection", name: g.name, hasMenuItem: g.modifiers.map((m) => ({ "@type": "MenuItem", name: m.name, offers: { "@type": "Offer", price: price(p.priceMinor + m.priceDeltaMinor), priceCurrency: config.currency } })),
  })) : undefined };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
  };
}

/** Serialises JSON-LD safely inside a script tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
