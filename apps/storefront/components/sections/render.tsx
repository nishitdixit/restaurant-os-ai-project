// Section renderer (ADR-013): the homepage is the restaurant's list of sections, each drawn by its own component.
// Disabled sections are skipped; a section with nothing to show renders nothing for customers (a placeholder in
// merchant preview).
import type { ReactNode } from "react";
import type { Section, StoreTheme } from "@restaurant-os/domain";
import type { Menu, PublicOffer, StoreConfig } from "@restaurant-os/types";
import { Bestsellers, Categories, Combos, Delivery, Featured, Offers } from "./commerce";
import { CallToActionBand, Gallery, Highlights, Reviews, Story } from "./content";
import { Hero } from "./hero";
import type { SectionContext } from "./shared";

function renderSection(section: Section, ctx: SectionContext): ReactNode {
  switch (section.type) {
    case "hero": return <Hero section={section} ctx={ctx} />;
    case "highlights": return <Highlights section={section} ctx={ctx} />;
    case "categories": return <Categories section={section} ctx={ctx} />;
    case "featured": return <Featured section={section} ctx={ctx} />;
    case "bestsellers": return <Bestsellers section={section} ctx={ctx} />;
    case "combos": return <Combos section={section} ctx={ctx} />;
    case "story": return <Story section={section} ctx={ctx} />;
    case "gallery": return <Gallery section={section} ctx={ctx} />;
    case "offers": return <Offers section={section} ctx={ctx} />;
    case "reviews": return <Reviews section={section} ctx={ctx} />;
    case "delivery": return <Delivery section={section} ctx={ctx} />;
    case "cta": return <CallToActionBand section={section} ctx={ctx} />;
  }
}

export function Sections({ config, theme, menu, offers }: { config: StoreConfig; theme: StoreTheme; menu: Menu; offers: PublicOffer[] }) {
  const sections = config.experience.sections.filter((s) => s.enabled);
  return (
    <>
      {sections.map((section, index) => (
        <div key={section.id} className="contents">
          {renderSection(section, { config, theme, menu, offers, preview: config.preview, language: config.experience.site.language, index })}
        </div>
      ))}
    </>
  );
}
