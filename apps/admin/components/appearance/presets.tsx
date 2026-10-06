"use client";
// Preset gallery: each card is a miniature of the restaurant's own storefront (name, logo, real dishes) rendered
// with that preset's tokens, so owners compare looks with their content rather than stock photos.
import type { CSSProperties } from "react";
import { Check, UtensilsCrossed } from "lucide-react";
import { applyPreset, themeVariables, THEME_PRESETS, type StoreTheme, type ThemePreset } from "@restaurant-os/domain";
import { Checkbox, cx, formatMoney } from "@restaurant-os/ui";

export interface PreviewContent {
  name: string;
  logoUrl: string | null;
  dishes: { name: string; priceMinor: number; imageUrl: string | null }[];
}

/** Scoped CSS variables: everything inside renders with `theme`, leaving the admin around it untouched. */
export function scopedThemeStyle(theme: StoreTheme): CSSProperties {
  const { "color-scheme": colorScheme, "--ros-root-font-size": _rootSize, ...vars } = themeVariables(theme);
  return { ...vars, colorScheme } as CSSProperties;
}

export function MiniStorefront({ theme, content, className }: { theme: StoreTheme; content: PreviewContent; className?: string }) {
  const c = theme.components;
  const grid = c.productLayout === "grid";
  const dishes = content.dishes.slice(0, grid ? 2 : c.productLayout === "compact" ? 3 : 2);
  const heroClass = c.hero === "minimal" ? "ros-card text-text" : "text-primary-contrast";
  const heroStyle: CSSProperties = c.hero === "gradient" ? { backgroundImage: "linear-gradient(135deg, var(--ros-hero-from), var(--ros-hero-to))" } : c.hero === "solid" ? { background: "var(--brand-primary)" } : {};
  return (
    <div style={scopedThemeStyle(theme)} className={cx("pointer-events-none select-none overflow-hidden bg-bg text-text", className)} aria-hidden>
      <div className="flex items-center gap-1.5 border-b border-header-border bg-header px-2.5 py-2 text-header-fg">
        {content.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={content.logoUrl} alt="" className="size-4 rounded-chip object-cover" />
          : <span className="flex size-4 items-center justify-center rounded-chip bg-accent text-[8px] font-bold text-accent-contrast">{content.name.slice(0, 1)}</span>}
        <span className="ros-heading truncate text-[11px]">{content.name}</span>
        <span className="ml-auto h-3.5 w-7 rounded-chip border border-header-border" />
      </div>
      <div className="space-y-2 p-2.5">
        <div className={cx("rounded-[var(--ros-radius-lg)] p-2.5", heroClass)} style={heroStyle}>
          <p className="ros-heading text-[13px] leading-tight">{content.name}</p>
          <span className={cx("ros-button-text mt-1.5 inline-flex h-4 items-center rounded-button px-2 text-[8px] font-semibold",
            c.hero === "minimal" ? "ros-btn-primary" : "bg-surface text-link")}>Order direct</span>
        </div>
        <div className="flex gap-1">
          {["Mains", "Breads", "Drinks"].map((label, i) => (
            <span key={label} className={cx("px-1.5 py-0.5 text-[8px] font-medium",
              c.categoryNav === "underline" ? cx("border-b-2", i === 0 ? "border-link text-text" : "border-transparent text-muted") : cx("rounded-chip", i === 0 ? "ros-btn-primary" : "bg-surface text-text ring-1 ring-border"))}>{label}</span>
          ))}
        </div>
        <div className={cx("grid gap-1.5", grid && "grid-cols-2")}>
          {dishes.map((d) => (
            <div key={d.name} className={cx("ros-card overflow-hidden", grid ? "pb-1.5" : "flex items-center gap-2 p-1.5")}>
              {c.productLayout !== "compact" && (
                <div className={cx("flex shrink-0 items-center justify-center overflow-hidden bg-subtle text-faint", grid ? "w-full" : "w-9 rounded-image")} style={{ aspectRatio: "var(--ros-image-ratio)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {d.imageUrl ? <img src={d.imageUrl} alt="" className="size-full object-cover" /> : <UtensilsCrossed className="size-3" />}
                </div>
              )}
              <div className={cx("min-w-0 flex-1", grid && "px-1.5 pt-1")}>
                <p className="truncate text-[9px] font-semibold">{d.name}</p>
                <p className="text-[8px] text-muted">{formatMoney(d.priceMinor)}</p>
              </div>
              {!grid && <span className="ros-btn-outline ros-button-text rounded-button px-1.5 py-0.5 text-[7px] font-medium">Add</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PresetGallery({ current, brandColor, keepBrandColor, onKeepBrandColor, onApply, content, disabled }: {
  current: StoreTheme; brandColor: string; keepBrandColor: boolean; onKeepBrandColor: (keep: boolean) => void;
  onApply: (theme: StoreTheme, preset: ThemePreset) => void; content: PreviewContent; disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-[var(--ros-radius-md)] bg-subtle px-3 py-2.5">
        <span className="size-5 shrink-0 rounded-full ring-1 ring-border" style={{ background: brandColor }} aria-hidden />
        <Checkbox label="Keep my brand colour" description={`Use ${brandColor} instead of each style's own colour`} checked={keepBrandColor}
          onChange={(e) => onKeepBrandColor(e.target.checked)} disabled={disabled} />
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {THEME_PRESETS.map((preset) => {
          const theme = applyPreset(preset, { keepBrandColor: keepBrandColor ? brandColor : null });
          const active = current.presetId === preset.id;
          return (
            <li key={preset.id}>
              <button type="button" disabled={disabled} onClick={() => onApply(theme, preset)} aria-pressed={active}
                aria-label={`Apply ${preset.name}: ${preset.description}`}
                className={cx("group w-full overflow-hidden rounded-[var(--ros-radius-lg)] border bg-surface text-left transition-shadow hover:shadow-[var(--ros-shadow-md)] disabled:cursor-not-allowed disabled:opacity-60",
                  active ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                <MiniStorefront theme={theme} content={content} className="h-44" />
                <div className="border-t border-border p-2.5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">{preset.name}{active && <Check className="size-4 text-success" aria-label="In use" />}</p>
                  <p className="text-xs text-muted">{preset.segment}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
