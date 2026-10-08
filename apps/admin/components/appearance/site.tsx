"use client";
// Site-wide experience settings (ADR-013): page layout, language, menu presentation, bestseller rules and search &
// sharing. Controlled choices only.
import { MENU_OPTIONS, type StoreExperience, type StoreTheme } from "@restaurant-os/domain";
import { Field, Input, Select, Switch, Textarea } from "@restaurant-os/ui";
import { Segmented } from "./controls";
import { ImageField } from "./media";
import { PanelCard, type UpdateExperience } from "./sections";

type UpdateTheme = (fn: (t: StoreTheme) => StoreTheme) => void;

export function LayoutPanel({ experience, update }: { experience: StoreExperience; update: UpdateExperience }) {
  const site = experience.site;
  const set = <K extends keyof StoreExperience["site"]>(key: K, value: StoreExperience["site"][K]) => update((e) => ({ ...e, site: { ...e.site, [key]: value } }));
  return (
    <PanelCard title="Page layout" description="Header, footer, width and language for every page.">
      <Segmented label="Header" value={site.header} onChange={(v) => set("header", v)}
        options={[{ value: "standard", label: "Logo left" }, { value: "centered", label: "Logo centered" }, { value: "minimal", label: "Minimal" }]}
        hint={site.header === "minimal" ? "Logo, search and cart only; pages are in the menu button." : undefined} />
      <Segmented label="Footer" value={site.footer} onChange={(v) => set("footer", v)} options={[{ value: "detailed", label: "Detailed" }, { value: "simple", label: "Simple" }, { value: "brand", label: "Brand colour" }]} />
      <Segmented label="Content width" value={site.contentWidth} onChange={(v) => set("contentWidth", v)} options={[{ value: "narrow", label: "Narrow" }, { value: "standard", label: "Standard" }, { value: "wide", label: "Wide" }]} />
      <Segmented label="Language of your text" value={site.language} onChange={(v) => set("language", v)}
        options={[{ value: "en", label: "English" }, { value: "hi", label: "हिन्दी" }, { value: "bilingual", label: "Both" }]}
        hint="For your own text (titles, story, dish names). Hindi fields appear once you choose Hindi or Both; buttons and checkout stay in English for now." />
      <Switch label="“More ways to order”" description="Lets customers also reach you on WhatsApp, Swiggy, Zomato or by phone." checked={site.orderChannels} onCheckedChange={(v) => set("orderChannels", v)} />
      <Switch label="“Order on WhatsApp” buttons" description="On dishes, the cart and checkout. The WhatsApp message lists exactly what the customer picked (portion, add-ons, quantity). Needs a WhatsApp number in Settings → Brand."
        checked={site.whatsappOrdering} onCheckedChange={(v) => set("whatsappOrdering", v)} />
    </PanelCard>
  );
}

export function MenuPanel({ experience, update, theme, updateTheme }: { experience: StoreExperience; update: UpdateExperience; theme: StoreTheme; updateTheme: UpdateTheme }) {
  const menu = experience.menu;
  const set = <K extends keyof StoreExperience["menu"]>(key: K, value: StoreExperience["menu"][K]) => update((e) => ({ ...e, menu: { ...e.menu, [key]: value } }));
  const rules = menu.bestseller;
  const setRule = <K extends keyof typeof rules>(key: K, value: (typeof rules)[K]) => update((e) => ({ ...e, menu: { ...e.menu, bestseller: { ...e.menu.bestseller, [key]: value } } }));
  const comp = <K extends keyof StoreTheme["components"]>(key: K, value: StoreTheme["components"][K]) => updateTheme((t) => ({ ...t, components: { ...t.components, [key]: value } }));
  return (
    <div className="space-y-3">
      <PanelCard title="Dishes" description="How the menu looks to customers.">
        <Segmented label="Dish layout" value={theme.components.productLayout} onChange={(v) => comp("productLayout", v)}
          options={[{ value: "list", label: "List" }, { value: "grid", label: "Photo grid" }, { value: "compact", label: "Compact" }, { value: "board", label: "Menu board" }]}
          hint={theme.components.productLayout === "board" ? "Like a printed menu: name and price on one line, no photos." : undefined} />
        <Switch label="Let customers switch view" description="Adds a Photos / Menu board switch on the menu page." checked={menu.viewToggle} onCheckedChange={(v) => set("viewToggle", v)} />
        <Segmented label="Category bar" value={theme.components.categoryNav} onChange={(v) => comp("categoryNav", v)} options={[{ value: "pills", label: "Pills" }, { value: "underline", label: "Tabs" }]} />
        <Segmented label="Photo shape" value={theme.components.imageRatio} onChange={(v) => comp("imageRatio", v)} options={[{ value: "square", label: "Square" }, { value: "landscape", label: "4:3" }, { value: "wide", label: "16:9" }]} />
        <Switch label="Search box on the menu" checked={menu.inlineSearch} onCheckedChange={(v) => set("inlineSearch", v)} />
        <Switch label="“Veg only” filter" checked={menu.vegFilter} onCheckedChange={(v) => set("vegFilter", v)} />
      </PanelCard>
      <PanelCard title="Badges" description="Bestseller, Signature, New, Chef's choice… Set badges on each dish in Menu.">
        <Switch label="Show badges on dishes" checked={menu.showBadges} onCheckedChange={(v) => set("showBadges", v)} />
        <Segmented label="Badge style" value={theme.components.badge} onChange={(v) => comp("badge", v)} options={[{ value: "pill", label: "Pill" }, { value: "quiet", label: "Quiet label" }, { value: "sticker", label: "Sticker" }]} />
      </PanelCard>
      <PanelCard title="Bestsellers" description="Calculated from real paid orders — never set by hand.">
        <Switch label="Mark bestsellers" checked={rules.enabled} onCheckedChange={(v) => setRule("enabled", v)} />
        {rules.enabled && (
          <>
            <Field label="Look at orders from the last">
              {(p) => <Select {...p} value={rules.windowDays} onChange={(e) => setRule("windowDays", Number(e.target.value) as typeof rules.windowDays)}>
                {MENU_OPTIONS.bestsellerWindowDays.map((d) => <option key={d} value={d}>{d} days</option>)}
              </Select>}
            </Field>
            <Field label="A dish needs at least this many orders" hint="So a dish isn't called a bestseller after one or two orders.">
              {(p) => <Input {...p} type="number" min={1} max={100} value={rules.minOrders} onChange={(e) => setRule("minOrders", Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />}
            </Field>
            <Field label="Mark at most">
              {(p) => <Input {...p} type="number" min={1} max={12} value={rules.limit} onChange={(e) => setRule("limit", Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />}
            </Field>
          </>
        )}
      </PanelCard>
    </div>
  );
}

export function SeoPanel({ experience, update, media, storeName }: { experience: StoreExperience; update: UpdateExperience; media: Record<string, { url: string; alt: string }>; storeName: string }) {
  const seo = experience.seo;
  const set = <K extends keyof StoreExperience["seo"]>(key: K, value: StoreExperience["seo"][K]) => update((e) => ({ ...e, seo: { ...e.seo, [key]: value } }));
  return (
    <PanelCard title="Search & sharing" description="How your homepage appears in Google and when shared on WhatsApp.">
      <Field label="Page title" hint={`${seo.title.length}/70 · Empty uses “${storeName} — Order online direct”.`}>
        {(p) => <Input {...p} maxLength={70} value={seo.title} onChange={(e) => set("title", e.target.value)} />}
      </Field>
      <Field label="Description" hint={`${seo.description.length}/160 · Empty uses your “About” text.`}>
        {(p) => <Textarea {...p} maxLength={160} rows={3} value={seo.description} onChange={(e) => set("description", e.target.value)} />}
      </Field>
      <ImageField label="Share image" imageId={seo.shareImageId} onChange={(id) => set("shareImageId", id)} kind="banner" media={media} hint="Shown when your link is shared. Empty uses a generated card with your name." />
      <div className="rounded-[var(--ros-radius-md)] border border-border p-3">
        <p className="text-xs text-muted">Google preview</p>
        <p className="mt-1 truncate text-base text-[#1a0dab]">{seo.title || `${storeName} — Order online direct`}</p>
        <p className="line-clamp-2 text-sm text-muted">{seo.description || "Your About text from Settings → Brand."}</p>
      </div>
    </PanelCard>
  );
}
