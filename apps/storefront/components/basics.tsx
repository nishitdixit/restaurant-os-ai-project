// Small presentational pieces shared by storefront pages (server-safe).
import type { DisplayBadge, Dietary, StoreConfig } from "@restaurant-os/types";
import { cx } from "@restaurant-os/ui";
import { Clock, Flame, PauseCircle } from "lucide-react";
import { jsonLdScript } from "@/lib/seo";

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}

const DIET: Record<Dietary, { label: string; color: string; shape: "circle" | "triangle" }> = {
  VEG: { label: "Vegetarian", color: "#067647", shape: "circle" },
  VEGAN: { label: "Vegan", color: "#067647", shape: "circle" },
  EGG: { label: "Contains egg", color: "#b54708", shape: "circle" },
  NON_VEG: { label: "Non-vegetarian", color: "#b42318", shape: "triangle" },
};

/** Indian food-type mark (square with dot / triangle). */
export function DietMark({ dietary, className = "" }: { dietary: Dietary | null; className?: string }) {
  if (!dietary) return null;
  const d = DIET[dietary];
  return (
    <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] ${className}`} style={{ borderColor: d.color }} title={d.label}>
      <span className="sr-only">{d.label}</span>
      {d.shape === "circle"
        ? <span className="size-2 rounded-full" style={{ background: d.color }} aria-hidden />
        : <span aria-hidden className="h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent" style={{ borderBottomColor: d.color }} />}
    </span>
  );
}

export function SpiceLevel({ level }: { level: number | null }) {
  if (!level) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-danger" title={`Spice level ${level} of 3`}>
      {Array.from({ length: level }, (_, i) => <Flame key={i} className="size-3.5" aria-hidden />)}
      <span className="sr-only">Spice level {level} of 3</span>
    </span>
  );
}

/** Explains when ordering is unavailable, with what the customer can do instead. */
export function StoreStatusBanner({ config }: { config: StoreConfig }) {
  const o = config.outlet;
  if (!o) return null;
  if (!o.acceptingOrders) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-[var(--ros-radius-lg)] border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
        <PauseCircle className="size-5 shrink-0" aria-hidden />
        <p><span className="font-semibold">Online orders are paused for a little while.</span> You can still browse the menu{o.phone ? <> or call us on <a className="underline" href={`tel:${o.phone}`}>{o.phone}</a></> : null}.</p>
      </div>
    );
  }
  if (!o.openNow) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-[var(--ros-radius-lg)] border border-border bg-subtle px-4 py-3 text-sm text-text">
        <Clock className="size-5 shrink-0 text-muted" aria-hidden />
        <p><span className="font-semibold">We&apos;re closed right now.</span>{o.nextOpening ? ` We open ${o.nextOpening}.` : ""} Browse the menu and order once we&apos;re open.</p>
      </div>
    );
  }
  return null;
}

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

const BADGE_TONE: Record<DisplayBadge["tone"], string> = {
  brand: "bg-primary text-primary-contrast",
  accent: "bg-accent text-accent-contrast",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-subtle text-text",
};

/** Dish badges: Bestseller (earned from real orders) and the restaurant's own (Signature, New, "Royal Feast"…). */
export function DishBadges({ badges, className, max = 2 }: { badges: DisplayBadge[]; className?: string; max?: number }) {
  if (!badges.length) return null;
  return (
    <ul className={cx("flex flex-wrap gap-1", className)} aria-label="Highlights">
      {badges.slice(0, max).map((b) => (
        <li key={`${b.kind}-${b.label}`} className={cx("ros-badge rounded-chip px-2 py-0.5 text-[11px] font-semibold uppercase leading-4 tracking-wide", BADGE_TONE[b.tone])}>{b.label}</li>
      ))}
    </ul>
  );
}
