"use client";
// "Customise" panel: every design token of the storefront theme, grouped the way an owner thinks about it.
// All inputs are bounded (pickers, sliders, segmented choices), so any combination produces a valid theme;
// readability problems are flagged next to the colour that causes them.
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, Wand2 } from "lucide-react";
import {
  contrastRatio, isHexColor, mixColors, PILL_RADIUS, RADIUS_MAX, readableTextOn, THEME_FONTS, type StoreTheme, type ThemeColorKey, type ThemeIssue,
} from "@restaurant-os/domain";
import { Button, cx } from "@restaurant-os/ui";
import { FONT_VARIABLE_CLASS } from "@/lib/fonts";

type Update = (fn: (theme: StoreTheme) => StoreTheme) => void;

export function Section({ title, description, children, defaultOpen = false }: { title: string; description?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-[var(--ros-radius-lg)] border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange, hint }: {
  label: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium" id={id}>{label}</p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1 rounded-[var(--ros-radius-md)] bg-subtle p-1">
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cx("min-h-8 flex-1 whitespace-nowrap rounded-[var(--ros-radius-sm)] px-2.5 text-xs font-medium transition-colors",
              value === o.value ? "bg-surface text-text shadow-[var(--ros-shadow-sm)]" : "text-muted hover:text-text")}>
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function ColorField({ label, colorKey, theme, update, issues, onFix }: {
  label: string; colorKey: ThemeColorKey; theme: StoreTheme; update: Update; issues: ThemeIssue[]; onFix: (issue: ThemeIssue) => void;
}) {
  const value = theme.colors[colorKey];
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const set = (next: string) => update((t) => ({ ...t, colors: { ...t.colors, [colorKey]: next.toLowerCase() } }));
  const problem = issues.find((i) => i.fix?.color === colorKey);
  return (
    <div>
      <div className="flex items-center gap-3">
        <input type="color" value={value} onChange={(e) => set(e.target.value)} aria-label={`${label} colour picker`}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-[var(--ros-radius-sm)] border border-border-strong bg-surface p-0.5" />
        <label className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">{label}</span>
          <input value={text} spellCheck={false} aria-invalid={!isHexColor(text) || undefined}
            onChange={(e) => { setText(e.target.value); if (isHexColor(e.target.value)) set(e.target.value); }}
            onBlur={() => setText(value)}
            className="mt-0.5 w-24 rounded border border-transparent bg-transparent px-1 font-mono text-xs text-muted hover:border-border focus:border-primary focus:outline-none" />
        </label>
      </div>
      {problem && (
        <div className="mt-1.5 flex items-start justify-between gap-2 rounded-[var(--ros-radius-sm)] bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          <span>{problem.message} <span className="whitespace-nowrap">({problem.ratio}:1, needs {problem.required}:1)</span></span>
          <button type="button" className="shrink-0 font-semibold underline" onClick={() => onFix(problem)}>Fix</button>
        </div>
      )}
    </div>
  );
}

function RadiusField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  const pill = value >= PILL_RADIUS;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium" id={id}>{label}</span>
        <span className="text-xs text-muted">{pill ? "Fully round" : `${value}px`}</span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <input type="range" min={0} max={RADIUS_MAX} step={1} value={pill ? RADIUS_MAX : value} disabled={pill}
          onChange={(e) => onChange(Number(e.target.value))} aria-labelledby={id} className="flex-1 accent-[var(--brand-primary)]" />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={pill} onChange={(e) => onChange(e.target.checked ? PILL_RADIUS : 12)} className="accent-[var(--brand-primary)]" />Round
        </label>
      </div>
    </div>
  );
}

function FontSelect({ label, value, onChange }: { label: string; value: StoreTheme["typography"]["headingFont"]; onChange: (id: StoreTheme["typography"]["headingFont"]) => void }) {
  const groups = [["sans", "Sans serif"], ["serif", "Serif"], ["slab", "Slab serif"], ["display", "Display"]] as const;
  const font = THEME_FONTS.find((f) => f.id === value)!;
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as typeof value)}
        className="h-10 w-full rounded-[var(--ros-radius-md)] border border-border-strong bg-surface px-3 text-sm">
        {groups.map(([category, name]) => (
          <optgroup key={category} label={name}>
            {THEME_FONTS.filter((f) => f.category === category).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
        ))}
      </select>
      <span className={cx("mt-1.5 block truncate text-lg text-text", FONT_VARIABLE_CLASS[value])} style={{ fontFamily: `var(--ff-${value})` }}>
        {font.label} — Paneer tikka · ₹249
      </span>
    </label>
  );
}

const HEADER_STYLES = [
  { label: "Light", apply: (t: StoreTheme) => ({ headerBackground: t.colors.surface, headerText: t.colors.text }) },
  { label: "Brand", apply: (t: StoreTheme) => ({ headerBackground: t.colors.primary, headerText: t.colors.primaryText }) },
  { label: "Dark", apply: (t: StoreTheme) => ({ headerBackground: t.mode === "dark" ? t.colors.background : mixColors(t.colors.text, "#000000", 0.2), headerText: t.mode === "dark" ? t.colors.text : "#ffffff" }) },
];

export function ThemeControls({ theme, update, issues, onFix }: { theme: StoreTheme; update: Update; issues: ThemeIssue[]; onFix: (issue: ThemeIssue) => void }) {
  const color = (label: string, key: ThemeColorKey) => <ColorField key={key} label={label} colorKey={key} theme={theme} update={update} issues={issues} onFix={onFix} />;
  const set = <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => update((t) => ({ ...t, [key]: value }));
  const typo = <K extends keyof StoreTheme["typography"]>(key: K, value: StoreTheme["typography"][K]) => update((t) => ({ ...t, typography: { ...t.typography, [key]: value } }));
  const shape = (key: keyof StoreTheme["shape"], value: number) => update((t) => ({ ...t, shape: { ...t.shape, [key]: value } }));
  const comp = <K extends keyof StoreTheme["components"]>(key: K, value: StoreTheme["components"][K]) => update((t) => ({ ...t, components: { ...t.components, [key]: value } }));
  return (
    <div className="space-y-3">
      <Section title="Colours" description="Page, text, brand and header colours" defaultOpen>
        <Segmented label="Mode" value={theme.mode} onChange={(v) => set("mode", v)} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
          hint="Dark mode also switches status colours and form controls. Pick dark page colours to match." />
        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-faint">Page</p>
        {color("Background", "background")}{color("Cards & panels", "surface")}{color("Light fills", "subtle")}{color("Borders", "border")}
        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-faint">Text</p>
        {color("Main text", "text")}{color("Secondary text", "muted")}
        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-faint">Brand</p>
        {color("Brand colour (buttons)", "primary")}
        <div className="flex items-end gap-2">
          <div className="flex-1">{color("Text on brand colour", "primaryText")}</div>
          <Button size="sm" variant="ghost" icon={<Wand2 className="size-3.5" aria-hidden />} onClick={() => update((t) => ({ ...t, colors: { ...t.colors, primaryText: readableTextOn(t.colors.primary) } }))}>Auto</Button>
        </div>
        {color("Accent (badges, highlights)", "accent")}
        <div className="flex items-end gap-2">
          <div className="flex-1">{color("Text on accent", "accentText")}</div>
          <Button size="sm" variant="ghost" icon={<Wand2 className="size-3.5" aria-hidden />} onClick={() => update((t) => ({ ...t, colors: { ...t.colors, accentText: readableTextOn(t.colors.accent) } }))}>Auto</Button>
        </div>
        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-faint">Header</p>
        <div className="flex gap-1.5">
          {HEADER_STYLES.map((h) => <Button key={h.label} size="sm" variant="outline" onClick={() => update((t) => ({ ...t, colors: { ...t.colors, ...h.apply(t) } }))}>{h.label}</Button>)}
        </div>
        {color("Header background", "headerBackground")}{color("Header text", "headerText")}
        <p className="text-xs text-muted">Brand colour on cards: {contrastRatio(theme.colors.primary, theme.colors.surface).toFixed(1)}:1</p>
      </Section>

      <Section title="Typography" description="Fonts, size and lettering">
        <FontSelect label="Heading font" value={theme.typography.headingFont} onChange={(v) => typo("headingFont", v)} />
        <FontSelect label="Body font" value={theme.typography.bodyFont} onChange={(v) => typo("bodyFont", v)} />
        <Segmented label="Text size" value={theme.typography.scale} onChange={(v) => typo("scale", v)} options={[{ value: "sm", label: "Small" }, { value: "md", label: "Regular" }, { value: "lg", label: "Large" }]} />
        <Segmented label="Heading weight" value={theme.typography.headingWeight} onChange={(v) => typo("headingWeight", v)}
          options={[{ value: 500, label: "Medium" }, { value: 600, label: "Semibold" }, { value: 700, label: "Bold" }, { value: 800, label: "Heavy" }]} />
        <Segmented label="Headings" value={theme.typography.headingCase} onChange={(v) => typo("headingCase", v)} options={[{ value: "normal", label: "Aa Normal" }, { value: "uppercase", label: "AA Capitals" }]} />
        <Segmented label="Button labels" value={theme.typography.buttonCase} onChange={(v) => typo("buttonCase", v)} options={[{ value: "normal", label: "Aa Normal" }, { value: "uppercase", label: "AA Capitals" }]} />
      </Section>

      <Section title="Shape" description="Corner rounding and borders">
        <RadiusField label="Buttons" value={theme.shape.button} onChange={(v) => shape("button", v)} />
        <RadiusField label="Cards" value={theme.shape.card} onChange={(v) => shape("card", v)} />
        <RadiusField label="Inputs" value={theme.shape.input} onChange={(v) => shape("input", v)} />
        <RadiusField label="Chips & tags" value={theme.shape.chip} onChange={(v) => shape("chip", v)} />
        <RadiusField label="Photos" value={theme.shape.image} onChange={(v) => shape("image", v)} />
        <Segmented label="Border thickness" value={theme.borderWidth} onChange={(v) => set("borderWidth", v)} options={[{ value: 1, label: "Fine (1px)" }, { value: 2, label: "Bold (2px)" }]} />
      </Section>

      <Section title="Depth & spacing" description="Shadows and how airy the layout feels">
        <Segmented label="Shadows" value={theme.shadow} onChange={(v) => set("shadow", v)}
          options={[{ value: "none", label: "None" }, { value: "soft", label: "Soft" }, { value: "strong", label: "Strong" }, { value: "offset", label: "Offset" }]}
          hint={theme.shadow === "offset" ? "Offset draws solid outlines and block shadows in the text colour (bold, poster-like)." : undefined} />
        <Segmented label="Spacing" value={theme.density} onChange={(v) => set("density", v)} options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "airy", label: "Airy" }]} />
      </Section>

      <Section title="Components" description="Buttons, cards and the banner colour">
        <Segmented label="Main buttons" value={theme.components.button} onChange={(v) => comp("button", v)} options={[{ value: "solid", label: "Solid" }, { value: "soft", label: "Soft" }, { value: "outline", label: "Outline" }]} />
        <Segmented label="Cards" value={theme.components.card} onChange={(v) => comp("card", v)} options={[{ value: "bordered", label: "Bordered" }, { value: "elevated", label: "Raised" }, { value: "flat", label: "Flat" }]} />
        <Segmented label="Banner without a photo" value={theme.components.hero} onChange={(v) => comp("hero", v)} options={[{ value: "gradient", label: "Gradient" }, { value: "solid", label: "Solid" }, { value: "minimal", label: "Card" }]}
          hint="Dish layout, category bar, photo shape and badges are under the Menu tab." />
      </Section>

      <Section title="Motion" description="Small animations when scrolling and adding to the cart">
        <Segmented label="Motion" value={theme.motion} onChange={(v) => set("motion", v)} options={[{ value: "none", label: "None" }, { value: "subtle", label: "Subtle" }, { value: "expressive", label: "Expressive" }]}
          hint="Customers who turn off animations on their phone never see any." />
      </Section>
    </div>
  );
}
