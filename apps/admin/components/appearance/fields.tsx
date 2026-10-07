"use client";
// Small, bounded inputs for the homepage builder: English + Hindi text, button targets, dish and category pickers.
// Every value maps to the controlled experience schema (packages/domain/src/experience.ts) — no free HTML or CSS.
import { useId, type ReactNode } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { CTA_DEFAULT_LABELS, CTA_TARGETS, type CallToAction, type CtaTarget, type LanguageMode, type LocalizedText } from "@restaurant-os/domain";
import type { AdminCategory, AdminProduct } from "@restaurant-os/types";
import { Field, Input, Select, Textarea, cx } from "@restaurant-os/ui";

/** English text, plus Hindi when the store shows Hindi (Hindi-only or bilingual). */
export function TextField({ label, value, onChange, language, multiline = false, max, placeholder, hint }: {
  label: string; value: LocalizedText; onChange: (value: LocalizedText) => void; language: LanguageMode; multiline?: boolean; max: number; placeholder?: string; hint?: ReactNode;
}) {
  const showHindi = language !== "en";
  const control = (lang: "en" | "hi") => (p: { id: string }) => multiline
    ? <Textarea {...p} lang={lang} rows={lang === "en" ? 4 : 3} maxLength={max} value={value[lang]} placeholder={lang === "en" ? placeholder : undefined} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
    : <Input {...p} lang={lang} maxLength={max} value={value[lang]} placeholder={lang === "en" ? placeholder : undefined} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />;
  return (
    <div className="space-y-2">
      <Field label={showHindi ? `${label} (English)` : label} hint={hint}>{control("en")}</Field>
      {showHindi && <Field label={`${label} (हिन्दी)`} hint={language === "bilingual" ? "Shown under the English text." : "Shown instead of English; English is used where this is empty."}>{control("hi")}</Field>}
    </div>
  );
}

const TARGET_LABELS: Record<CtaTarget, string> = {
  menu: "The menu", category: "A category", offers: "Offers page", "delivery-areas": "Delivery areas page", contact: "Contact & hours",
  whatsapp: "WhatsApp chat", call: "Call the restaurant", channels: "More ways to order (sheet)",
};

export function CtaField({ label, value, onChange, categories, language, allowNone = false }: {
  label: string; value: CallToAction | null; onChange: (value: CallToAction | null) => void; categories: AdminCategory[]; language: LanguageMode; allowNone?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2 rounded-[var(--ros-radius-md)] border border-border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <label htmlFor={id} className="sr-only">Goes to</label>
      <Select id={id} value={value?.target ?? ""} onChange={(e) => onChange(e.target.value ? { target: e.target.value as CtaTarget, label: value?.label ?? { en: "", hi: "" }, categorySlug: value?.categorySlug ?? "" } : null)}>
        {allowNone && <option value="">No button</option>}
        {CTA_TARGETS.map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
      </Select>
      {value?.target === "category" && (
        <Select aria-label="Category" value={value.categorySlug} onChange={(e) => onChange({ ...value, categorySlug: e.target.value })}>
          <option value="">Choose a category…</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
      )}
      {value && <TextField label="Button text" value={value.label} onChange={(l) => onChange({ ...value, label: l })} language={language} max={40} placeholder={CTA_DEFAULT_LABELS[value.target]} hint="Leave empty for the default." />}
    </fieldset>
  );
}

/** An ordered pick-list (dishes or categories): add from a select, reorder, remove. */
export function PickList<T extends { id: string; name: string }>({ label, items, selected, onChange, max, empty, renderMeta }: {
  label: string; items: T[]; selected: string[]; onChange: (ids: string[]) => void; max: number; empty: string; renderMeta?: (item: T) => ReactNode;
}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const chosen = selected.flatMap((id) => byId.get(id) ?? []);
  const move = (index: number, dir: -1 | 1) => {
    const next = [...selected];
    const [x] = next.splice(index, 1);
    next.splice(index + dir, 0, x!);
    onChange(next);
  };
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {chosen.length === 0 ? <p className="mb-2 text-xs text-muted">{empty}</p> : (
        <ol className="mb-2 divide-y divide-border rounded-[var(--ros-radius-md)] border border-border">
          {chosen.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.name}{renderMeta && <span className="ml-1 text-xs text-muted">{renderMeta(item)}</span>}</span>
              <button type="button" className="rounded p-1 text-muted hover:bg-subtle disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${item.name} up`}><ArrowUp className="size-3.5" /></button>
              <button type="button" className="rounded p-1 text-muted hover:bg-subtle disabled:opacity-30" disabled={i === chosen.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${item.name} down`}><ArrowDown className="size-3.5" /></button>
              <button type="button" className="rounded p-1 text-muted hover:bg-subtle" onClick={() => onChange(selected.filter((x) => x !== item.id))} aria-label={`Remove ${item.name}`}><X className="size-3.5" /></button>
            </li>
          ))}
        </ol>
      )}
      {chosen.length < max && (
        <Select aria-label={`Add to ${label.toLowerCase()}`} value="" onChange={(e) => e.target.value && onChange([...selected, e.target.value])}>
          <option value="">Add…</option>
          {items.filter((i) => !selected.includes(i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
      )}
    </div>
  );
}

export function dishOptions(products: AdminProduct[]) {
  return products.filter((p) => p.status === "ACTIVE").map((p) => ({ id: p.id, name: p.name }));
}

/** Small labelled number stepper for counts (dishes per section). */
export function CountField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} type="number" min={min} max={max} value={value} className={cx("w-20 text-right")}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n)))); }} />
    </div>
  );
}
