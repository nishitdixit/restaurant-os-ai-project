"use client";
// Homepage builder (ADR-013): the site's layout settings and the ordered list of homepage sections — add, switch on
// and off, reorder and configure each one with controlled choices. Selecting a section scrolls the live preview to it.
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import {
  defaultSection, HERO_TEXT_ON_IMAGE, HIGHLIGHT_ICONS, HIGHLIGHT_KINDS, lt, MAX_SECTIONS, REVIEW_SOURCE_LABELS, REVIEW_SOURCES, SECTION_LABELS,
  SECTION_LIMITS, SECTION_TYPES, SECTION_VARIANTS, type ExperienceIssue, type HighlightItem, type LanguageMode, type Section, type SectionOf,
  type SectionType, type StoreExperience, type Testimonial,
} from "@restaurant-os/domain";
import type { AdminCategory, AdminProduct } from "@restaurant-os/types";
import { Badge, Button, Field, Input, Select, Switch, cx } from "@restaurant-os/ui";
import { Segmented } from "./controls";
import { CountField, CtaField, dishOptions, PickList, TextField } from "./fields";
import { ImageField, MediaPicker, useMediaLibrary, AltTextField } from "./media";

export type UpdateExperience = (fn: (e: StoreExperience) => StoreExperience) => void;

export interface BuilderData {
  products: AdminProduct[];
  categories: AdminCategory[];
  media: Record<string, { url: string; alt: string }>;
}

const VARIANT_LABELS: Record<string, string> = {
  split: "Split", centered: "Centered", "image-left": "Photo left", "image-right": "Photo right", "full-bleed": "Full-screen photo", editorial: "Editorial",
  minimal: "Minimal", stats: "Big numbers", icons: "Icon cards", strip: "One line", "image-cards": "Photo cards", square: "Square", landscape: "Wide",
  text: "Text only", scroll: "Circles (swipe)", grid: "Grid", list: "List", rail: "Swipe rail", spotlight: "Spotlight", cards: "Cards", stacked: "Stacked",
  overlay: "Text on photo", mosaic: "Mosaic", carousel: "Carousel", banner: "Banner", summary: "Rating + quotes", wall: "Wall of quotes", areas: "Area cards",
  checker: "Pincode checker",
};

const SECTION_HELP: Record<SectionType, string> = {
  hero: "The first thing customers see: your name, a photo and the order button.",
  highlights: "Up to six quick facts. Automatic ones (orders, rating, hours, delivery) show only real data.",
  categories: "Your menu categories with their photos.",
  featured: "Dishes you pick, or the first dishes on your menu.",
  bestsellers: "Your real bestsellers from paid orders — appears automatically once dishes have sold.",
  combos: "Dishes you pick, or every dish with the “Combo” badge.",
  story: "Your story, with a photo and an optional button.",
  gallery: "Photos of your food and place.",
  offers: "Your public offers while they're running.",
  reviews: "Your rating (with a link to where it comes from) and a few reviews.",
  delivery: "Delivery time, fees and where you deliver.",
  cta: "A band that sends customers to order.",
};

function nextId(type: SectionType, sections: Section[]): string {
  for (let i = 1; ; i++) {
    const id = i === 1 ? type : `${type}-${i}`;
    if (!sections.some((s) => s.id === id)) return id;
  }
}

/** Typed updater for one section. */
function useSectionUpdate<T extends SectionType>(section: SectionOf<T>, update: UpdateExperience) {
  return (patch: Partial<SectionOf<T>>) => update((e) => ({ ...e, sections: e.sections.map((s) => (s.id === section.id ? ({ ...s, ...patch } as Section) : s)) }));
}

function CommonFields<T extends SectionType>({ section, set, language, titlePlaceholder }: { section: SectionOf<T>; set: (p: Partial<SectionOf<T>>) => void; language: LanguageMode; titlePlaceholder?: string }) {
  return (
    <>
      <Segmented label="Layout" value={section.variant as string} onChange={(v) => set({ variant: v } as Partial<SectionOf<T>>)}
        options={(SECTION_VARIANTS[section.type] as readonly string[]).map((v) => ({ value: v, label: VARIANT_LABELS[v] ?? v }))} />
      {section.type !== "hero" && (
        <Segmented label="Background" value={section.tone} onChange={(v) => set({ tone: v } as Partial<SectionOf<T>>)}
          options={[{ value: "default", label: "Page" }, { value: "subtle", label: "Soft" }, { value: "brand", label: "Brand" }, { value: "inverted", label: "Contrast" }]}
          hint="Alternating backgrounds give the page rhythm; text stays readable on every one." />
      )}
      <TextField label="Small label above the title" value={section.eyebrow} onChange={(v) => set({ eyebrow: v } as Partial<SectionOf<T>>)} language={language} max={60} placeholder="e.g. OUR KITCHEN" />
      <TextField label="Title" value={section.title} onChange={(v) => set({ title: v } as Partial<SectionOf<T>>)} language={language} max={120} placeholder={titlePlaceholder} hint="Leave empty for the default." />
      {section.type !== "offers" && <TextField label="Subtitle" value={section.subtitle} onChange={(v) => set({ subtitle: v } as Partial<SectionOf<T>>)} language={language} max={300} />}
    </>
  );
}

function HeroEditor({ section, update, data, language }: { section: SectionOf<"hero">; update: UpdateExperience; data: BuilderData; language: LanguageMode }) {
  const set = useSectionUpdate(section, update);
  const onImage = HERO_TEXT_ON_IMAGE.includes(section.variant);
  return (
    <>
      <CommonFields section={section} set={set} language={language} titlePlaceholder="Your restaurant's name" />
      <ImageField label="Banner photo" imageId={section.imageId} onChange={(imageId) => set({ imageId })} kind="hero" media={data.media}
        hint="A bright, close photo of your best dish. Without a photo the banner uses your brand colour." />
      <Segmented label="Text alignment" value={section.align} onChange={(align) => set({ align })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      <Segmented label="Height" value={section.height} onChange={(height) => set({ height })} options={[{ value: "compact", label: "Compact" }, { value: "standard", label: "Standard" }, { value: "tall", label: "Tall" }]}
        hint="On phones the banner never hides the food: photos come first and are capped in height." />
      {onImage && (
        <Segmented label="Photo overlay" value={section.overlay === "none" ? "dark" : section.overlay} onChange={(overlay) => set({ overlay })}
          options={[{ value: "dark", label: "Dark" }, { value: "darker", label: "Darker" }, { value: "light", label: "Light" }]} hint="Keeps text readable on any photo." />
      )}
      {!onImage && section.variant !== "minimal" && (
        <Segmented label="Photo fit" value={section.imageFit} onChange={(imageFit) => set({ imageFit })} options={[{ value: "cover", label: "Fill (crop)" }, { value: "contain", label: "Whole photo" }]} />
      )}
      <Switch label="Show open/delivery line" checked={section.showStatus} onCheckedChange={(showStatus) => set({ showStatus })} />
      <Switch label="Show logo" checked={section.showLogo} onCheckedChange={(showLogo) => set({ showLogo })} />
      <CtaField label="Main button" value={section.primaryCta} onChange={(v) => v && set({ primaryCta: v })} categories={data.categories} language={language} />
      <CtaField label="Second button" value={section.secondaryCta} onChange={(v) => set({ secondaryCta: v })} categories={data.categories} language={language} allowNone />
    </>
  );
}

const HIGHLIGHT_LABELS: Record<HighlightItem["kind"], string> = {
  custom: "Your own fact", orders: "Orders served (automatic)", rating: "Your rating (from Reviews)", hours: "Open now / opening time",
  "delivery-time": "Delivery time (automatic)", "delivery-fee": "Delivery fee (automatic)",
};

function HighlightsEditor({ section, update, language }: { section: SectionOf<"highlights">; update: UpdateExperience; language: LanguageMode }) {
  const set = useSectionUpdate(section, update);
  const setItem = (i: number, patch: Partial<HighlightItem>) => set({ items: section.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <>
      <CommonFields section={section} set={set} language={language} />
      <div className="space-y-3">
        <p className="text-sm font-medium">Facts</p>
        {section.items.map((item, i) => (
          <div key={i} className="space-y-2 rounded-[var(--ros-radius-md)] border border-border p-3">
            <div className="flex gap-2">
              <Select aria-label="Fact" value={item.kind} onChange={(e) => setItem(i, { kind: e.target.value as HighlightItem["kind"] })}>
                {HIGHLIGHT_KINDS.map((k) => <option key={k} value={k}>{HIGHLIGHT_LABELS[k]}</option>)}
              </Select>
              <Select aria-label="Icon" className="w-32" value={item.icon} onChange={(e) => setItem(i, { icon: e.target.value as HighlightItem["icon"] })}>
                {HIGHLIGHT_ICONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
              <Button size="sm" variant="ghost" aria-label="Remove fact" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => set({ items: section.items.filter((_, j) => j !== i) })} />
            </div>
            {item.kind === "custom" ? (
              <>
                <TextField label="Value" value={item.value} onChange={(value) => setItem(i, { value })} language={language} max={24} placeholder="e.g. Since 1987" />
                <TextField label="Label" value={item.label} onChange={(label) => setItem(i, { label })} language={language} max={60} placeholder="e.g. family recipes" />
              </>
            ) : <p className="text-xs text-muted">Filled in from your real data, and hidden when there isn't any yet.</p>}
          </div>
        ))}
        {section.items.length < 6 && <Button size="sm" variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={() => set({ items: [...section.items, { kind: "custom", icon: "star", value: lt(), label: lt() }] })}>Add a fact</Button>}
      </div>
    </>
  );
}

function GalleryEditor({ section, update, data, language }: { section: SectionOf<"gallery">; update: UpdateExperience; data: BuilderData; language: LanguageMode }) {
  const set = useSectionUpdate(section, update);
  const [open, setOpen] = useState(false);
  const library = useMediaLibrary();
  return (
    <>
      <CommonFields section={section} set={set} language={language} titlePlaceholder="Gallery" />
      <div className="space-y-3">
        <p className="text-sm font-medium">Photos ({section.images.length}/24)</p>
        {section.images.map((img, i) => {
          const asset = library.data?.find((m) => m.id === img.imageId);
          const url = asset?.url ?? data.media[img.imageId]?.url;
          return (
            <div key={img.imageId} className="flex gap-3 rounded-[var(--ros-radius-md)] border border-border p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url && <img src={url} alt="" className="size-16 shrink-0 rounded-[var(--ros-radius-sm)] object-cover" />}
              <div className="min-w-0 flex-1 space-y-2">
                {asset && <AltTextField asset={asset} />}
                <TextField label="Caption (optional)" value={img.caption} onChange={(caption) => set({ images: section.images.map((x, j) => (j === i ? { ...x, caption } : x)) })} language={language} max={120} />
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" className="rounded p-1 text-muted hover:bg-subtle disabled:opacity-30" disabled={i === 0} aria-label="Move photo up"
                  onClick={() => { const n = [...section.images]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; set({ images: n }); }}><ArrowUp className="size-4" /></button>
                <button type="button" className="rounded p-1 text-muted hover:bg-subtle disabled:opacity-30" disabled={i === section.images.length - 1} aria-label="Move photo down"
                  onClick={() => { const n = [...section.images]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; set({ images: n }); }}><ArrowDown className="size-4" /></button>
                <button type="button" className="rounded p-1 text-muted hover:bg-subtle" aria-label="Remove photo" onClick={() => set({ images: section.images.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button>
              </div>
            </div>
          );
        })}
        {section.images.length < 24 && <Button size="sm" variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Add a photo</Button>}
        <MediaPicker open={open} onOpenChange={setOpen} kind="gallery" onPick={(a) => !section.images.some((x) => x.imageId === a.id) && set({ images: [...section.images, { imageId: a.id, caption: lt() }] })} />
      </div>
    </>
  );
}

function ReviewsEditor({ section, update, language }: { section: SectionOf<"reviews">; update: UpdateExperience; language: LanguageMode }) {
  const set = useSectionUpdate(section, update);
  const r = section.rating;
  const [draft, setDraft] = useState({ value: r ? String(r.value) : "", count: r ? String(r.count) : "", source: r?.source ?? "google", url: r?.url ?? "", asOf: r?.asOf ?? "" });
  const saveRating = (next: typeof draft) => {
    setDraft(next);
    const value = Number(next.value);
    // Kept only when complete and checkable (value, https source link, month) — the server enforces the same.
    set({ rating: value >= 1 && value <= 5 && /^https:\/\//.test(next.url) && /^\d{4}-\d{2}$/.test(next.asOf)
      ? { value: Math.round(value * 10) / 10, count: Math.max(0, Math.round(Number(next.count) || 0)), source: next.source, url: next.url, asOf: next.asOf } : null });
  };
  const setQuote = (i: number, patch: Partial<Testimonial>) => set({ testimonials: section.testimonials.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <>
      <CommonFields section={section} set={set} language={language} titlePlaceholder="What our guests say" />
      <fieldset className="space-y-2 rounded-[var(--ros-radius-md)] border border-border p-3">
        <legend className="px-1 text-sm font-medium">Your rating</legend>
        <p className="text-xs text-muted">Shown with its source and date and a link customers can check. It's never called “verified”.</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rating (1–5)">{(p) => <Input {...p} inputMode="decimal" value={draft.value} onChange={(e) => saveRating({ ...draft, value: e.target.value })} placeholder="4.6" />}</Field>
          <Field label="Number of ratings">{(p) => <Input {...p} inputMode="numeric" value={draft.count} onChange={(e) => saveRating({ ...draft, count: e.target.value.replace(/\D/g, "") })} />}</Field>
          <Field label="Source">{(p) => <Select {...p} value={draft.source} onChange={(e) => saveRating({ ...draft, source: e.target.value as typeof draft.source })}>{REVIEW_SOURCES.map((s) => <option key={s} value={s}>{REVIEW_SOURCE_LABELS[s]}</option>)}</Select>}</Field>
          <Field label="As of (month)">{(p) => <Input {...p} type="month" value={draft.asOf} onChange={(e) => saveRating({ ...draft, asOf: e.target.value })} />}</Field>
        </div>
        <Field label="Link to your reviews" hint="https:// link to your Google, Zomato or Swiggy page.">{(p) => <Input {...p} type="url" value={draft.url} onChange={(e) => saveRating({ ...draft, url: e.target.value.trim() })} />}</Field>
        {!r && (draft.value || draft.url) && <p className="text-xs font-medium text-warning">Add the rating, an https link and the month to show it.</p>}
      </fieldset>
      <div className="space-y-3">
        <p className="text-sm font-medium">Reviews ({section.testimonials.length}/12)</p>
        {section.testimonials.map((t, i) => (
          <div key={i} className="space-y-2 rounded-[var(--ros-radius-md)] border border-border p-3">
            <TextField label="Quote" value={t.quote} onChange={(quote) => setQuote(i, { quote })} language={language} max={400} multiline />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name">{(p) => <Input {...p} value={t.author} maxLength={60} onChange={(e) => setQuote(i, { author: e.target.value })} />}</Field>
              <Field label="Source">{(p) => <Select {...p} value={t.source} onChange={(e) => setQuote(i, { source: e.target.value as Testimonial["source"] })}>{REVIEW_SOURCES.map((s) => <option key={s} value={s}>{REVIEW_SOURCE_LABELS[s]}</option>)}</Select>}</Field>
              <Field label="Month">{(p) => <Input {...p} type="month" value={t.date} onChange={(e) => setQuote(i, { date: e.target.value })} />}</Field>
              <Field label="Stars">{(p) => <Select {...p} value={t.rating ?? ""} onChange={(e) => setQuote(i, { rating: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</Select>}</Field>
            </div>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => set({ testimonials: section.testimonials.filter((_, j) => j !== i) })}>Remove</Button>
          </div>
        ))}
        {section.testimonials.length < 12 && <Button size="sm" variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={() => set({ testimonials: [...section.testimonials, { quote: lt(), author: "", source: "google", date: "", rating: 5 }] })}>Add a review</Button>}
        <p className="text-xs text-muted">Only add real reviews you have permission to show, with the reviewer's name as it appears on the source.</p>
      </div>
    </>
  );
}

function SectionEditor({ section, update, data, language }: { section: Section; update: UpdateExperience; data: BuilderData; language: LanguageMode }) {
  switch (section.type) {
    case "hero": return <HeroEditor section={section} update={update} data={data} language={language} />;
    case "highlights": return <HighlightsEditor section={section} update={update} language={language} />;
    case "gallery": return <GalleryEditor section={section} update={update} data={data} language={language} />;
    case "reviews": return <ReviewsEditor section={section} update={update} language={language} />;
    default: return <SimpleEditor section={section} update={update} data={data} language={language} />;
  }
}

function SimpleEditor({ section, update, data, language }: { section: Section; update: UpdateExperience; data: BuilderData; language: LanguageMode }) {
  const set = useSectionUpdate(section as SectionOf<SectionType>, update) as (p: Record<string, unknown>) => void;
  const dishes = dishOptions(data.products);
  const titles: Partial<Record<SectionType, string>> = { categories: "Browse the menu", featured: "From the menu", bestsellers: "Bestsellers", combos: "Combos & specials", story: "About us", offers: "Offers", delivery: "Delivered hot to your door", cta: "Hungry? Order direct" };
  return (
    <>
      <CommonFields section={section as SectionOf<SectionType>} set={set} language={language} titlePlaceholder={titles[section.type]} />
      {section.type === "categories" && (
        <>
          <PickList label="Categories to show" items={data.categories.map((c) => ({ id: c.id, name: c.name }))} selected={section.categoryIds} onChange={(categoryIds) => set({ categoryIds })} max={40}
            empty="All categories, in menu order. Pick some to choose which and in what order." />
          <Switch label="Show the number of dishes" checked={section.showCounts} onCheckedChange={(showCounts) => set({ showCounts })} />
          <p className="text-xs text-muted">Category photos are set in Menu → Categories; without one, the first dish photo is used.</p>
        </>
      )}
      {section.type === "featured" && (
        <>
          <Segmented label="Dishes" value={section.source} onChange={(source) => set({ source })} options={[{ value: "picked", label: "I'll pick them" }, { value: "menu", label: "First on my menu" }]} />
          {section.source === "picked" && <PickList label="Featured dishes" items={dishes} selected={section.productIds} onChange={(productIds) => set({ productIds })} max={12} empty="Pick up to 12 dishes." />}
          <CountField label="How many to show" value={section.limit} min={2} max={12} onChange={(limit) => set({ limit })} />
        </>
      )}
      {section.type === "bestsellers" && (
        <>
          <CountField label="How many to show" value={section.limit} min={2} max={12} onChange={(limit) => set({ limit })} />
          <p className="text-xs text-muted">Bestsellers come from real paid orders (rules under the Menu tab). Until a dish qualifies, customers don't see this section.</p>
        </>
      )}
      {section.type === "combos" && (
        <>
          <PickList label="Combos & specials" items={dishes} selected={section.productIds} onChange={(productIds) => set({ productIds })} max={12} empty="Shows every dish with the “Combo” badge. Pick dishes to choose them yourself." />
          <CountField label="How many to show" value={section.limit} min={2} max={12} onChange={(limit) => set({ limit })} />
        </>
      )}
      {section.type === "story" && (
        <>
          <TextField label="Your story" value={section.body} onChange={(body) => set({ body })} language={language} max={2000} multiline hint="Leave a blank line between paragraphs. Without a story, your “About” text is used." />
          <ImageField label="Photo" imageId={section.imageId} onChange={(imageId) => set({ imageId })} kind="story" media={data.media} />
          <Segmented label="Photo fit" value={section.imageFit} onChange={(imageFit) => set({ imageFit })} options={[{ value: "cover", label: "Fill (crop)" }, { value: "contain", label: "Whole photo" }]} />
          <CtaField label="Button" value={section.cta} onChange={(cta) => set({ cta })} categories={data.categories} language={language} allowNone />
        </>
      )}
      {section.type === "cta" && (
        <>
          {section.variant === "split" && <ImageField label="Photo" imageId={section.imageId} onChange={(imageId) => set({ imageId })} kind="banner" media={data.media} />}
          <CtaField label="Main button" value={section.primaryCta} onChange={(v) => v && set({ primaryCta: v })} categories={data.categories} language={language} />
          <CtaField label="Second button" value={section.secondaryCta} onChange={(secondaryCta) => set({ secondaryCta })} categories={data.categories} language={language} allowNone />
        </>
      )}
      {section.type === "offers" && <p className="text-xs text-muted">Shows your public, running offers (Offers page in the menu). Hidden when there are none.</p>}
      {section.type === "delivery" && <p className="text-xs text-muted">Uses your delivery areas, fees and free-delivery amounts (Delivery areas page).</p>}
    </>
  );
}

export function SectionsPanel({ experience, update, data, issues, selected, onSelect }: {
  experience: StoreExperience; update: UpdateExperience; data: BuilderData; issues: ExperienceIssue[]; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const sections = experience.sections;
  const counts = (t: SectionType) => sections.filter((s) => s.type === t).length;
  const move = (index: number, dir: -1 | 1) => update((e) => {
    const next = [...e.sections];
    const [x] = next.splice(index, 1);
    next.splice(index + dir, 0, x!);
    return { ...e, sections: next };
  });
  const add = (type: SectionType) => {
    const id = nextId(type, sections);
    update((e) => ({ ...e, sections: [...e.sections, defaultSection(type, id)] }));
    setAdding(false);
    onSelect(id);
  };
  return (
    <div className="space-y-2">
      {sections.map((s, i) => {
        const open = selected === s.id;
        const problems = issues.filter((x) => x.sectionId === s.id);
        return (
          <div key={s.id} className={cx("rounded-[var(--ros-radius-lg)] border bg-surface", open ? "border-primary ring-1 ring-primary/20" : "border-border", !s.enabled && "opacity-70")}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button type="button" onClick={() => onSelect(open ? null : s.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <ChevronDown className={cx("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{s.title.en || SECTION_LABELS[s.type]}</span>
                  <span className="block truncate text-xs text-muted">{s.title.en ? `${SECTION_LABELS[s.type]} · ` : ""}{VARIANT_LABELS[s.variant] ?? s.variant}{s.enabled ? "" : " · hidden"}</span>
                </span>
                {problems.length > 0 && <Badge tone="warning" className="ml-auto shrink-0">{problems.length}</Badge>}
              </button>
              <button type="button" className="rounded p-1 text-muted hover:bg-subtle disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${SECTION_LABELS[s.type]} up`}><ArrowUp className="size-4" /></button>
              <button type="button" className="rounded p-1 text-muted hover:bg-subtle disabled:opacity-30" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${SECTION_LABELS[s.type]} down`}><ArrowDown className="size-4" /></button>
              <Switch size="sm" checked={s.enabled} ariaLabel={`Show ${SECTION_LABELS[s.type]}`} onCheckedChange={(enabled) => update((e) => ({ ...e, sections: e.sections.map((x) => (x.id === s.id ? { ...x, enabled } : x)) }))} />
            </div>
            {open && (
              <div className="space-y-4 border-t border-border px-4 py-4">
                <p className="text-xs text-muted">{SECTION_HELP[s.type]}</p>
                {problems.map((p) => <p key={p.key} className="rounded-[var(--ros-radius-sm)] bg-warning-soft px-3 py-2 text-xs text-warning">{p.message}</p>)}
                <SectionEditor section={s} update={update} data={data} language={experience.site.language} />
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {counts(s.type) < SECTION_LIMITS[s.type] && sections.length < MAX_SECTIONS && (
                    <Button size="sm" variant="ghost" icon={<Copy className="size-4" aria-hidden />} onClick={() => {
                      const id = nextId(s.type, sections);
                      update((e) => { const idx = e.sections.findIndex((x) => x.id === s.id); const next = [...e.sections]; next.splice(idx + 1, 0, { ...structuredClone(s), id }); return { ...e, sections: next }; });
                      onSelect(id);
                    }}>Duplicate</Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" aria-hidden />}
                    onClick={() => { update((e) => ({ ...e, sections: e.sections.filter((x) => x.id !== s.id) })); onSelect(null); }}>Remove section</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {sections.length < MAX_SECTIONS && (
        adding ? (
          <div className="rounded-[var(--ros-radius-lg)] border border-dashed border-border-strong p-3">
            <p className="mb-2 text-sm font-medium">Add a section</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SECTION_TYPES.filter((t) => counts(t) < SECTION_LIMITS[t]).map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => add(t)} className="h-full w-full rounded-[var(--ros-radius-md)] border border-border bg-surface p-3 text-left hover:border-primary/50">
                    <span className="block text-sm font-semibold">{SECTION_LABELS[t]}</span>
                    <span className="block text-xs text-muted">{SECTION_HELP[t]}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        ) : <Button variant="outline" block icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>Add a section</Button>
      )}
    </div>
  );
}

export function PanelCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-[var(--ros-radius-lg)] border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
