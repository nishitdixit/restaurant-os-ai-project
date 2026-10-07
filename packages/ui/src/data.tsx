"use client";
// Data display: money, dates, tables, timelines and cart lines. Currency and locale always come from
// data (docs/LOCALIZATION.md), never a hard-coded symbol.
import { Check, Circle, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./primitives.tsx";
import { cx, formatDateTime, formatMoney, relativeTime } from "./utils.ts";

export function Money({ minor, currency = "INR", locale = "en-IN", className, strike }: { minor: number; currency?: string; locale?: string; className?: string; strike?: boolean }) {
  const Tag = strike ? "s" : "span";
  return <Tag className={cx("tabular-nums", className)}>{formatMoney(minor, currency, locale)}</Tag>;
}

export function DateTime({ iso, options, className }: { iso: string; options?: Intl.DateTimeFormatOptions; className?: string }) {
  return <time dateTime={iso} className={className} title={formatDateTime(iso, { dateStyle: "full", timeStyle: "long" })}>{formatDateTime(iso, options)}</time>;
}

/** Self-updating "5 min ago" for live boards. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <time dateTime={iso} className={className} title={formatDateTime(iso)}>{relativeTime(iso, now)}</time>;
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  hideOnMobile?: boolean;
}

/** Table on desktop; rows collapse to stacked cards on narrow screens. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty, caption, selection }: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; empty?: ReactNode; caption?: string;
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
}) {
  if (!rows.length && empty) return <>{empty}</>;
  const allSelected = selection && rows.length > 0 && rows.every((r) => selection.selected.has(rowKey(r)));
  return (
    <div className="overflow-hidden rounded-[var(--ros-radius-lg)] border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="hidden bg-subtle text-left text-xs font-medium uppercase tracking-wide text-muted md:table-header-group">
          <tr>
            {selection && (
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="Select all" className="size-4 accent-[var(--brand-primary)]" checked={!!allSelected}
                  onChange={(e) => selection.onChange(e.target.checked ? new Set(rows.map(rowKey)) : new Set())} />
              </th>
            )}
            {columns.map((c) => <th key={c.key} scope="col" className={cx("px-3 py-2.5 font-medium", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr key={key} onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 md:table-row md:p-0", onRowClick && "cursor-pointer hover:bg-subtle/70")}>
                {selection && (
                  <td className="md:w-10 md:px-3 md:py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Select row" className="size-4 accent-[var(--brand-primary)]" checked={selection.selected.has(key)}
                      onChange={(e) => {
                        const next = new Set(selection.selected);
                        if (e.target.checked) next.add(key); else next.delete(key);
                        selection.onChange(next);
                      }} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={cx("md:px-3 md:py-3", c.align === "right" && "md:text-right", c.align === "center" && "md:text-center", c.hideOnMobile && "hidden md:table-cell", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading?: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return <div className="mt-4 flex justify-center"><Button variant="outline" loading={loading} onClick={onClick}>Load more</Button></div>;
}

export interface TimelineItem {
  label: ReactNode;
  at?: string | null;
  detail?: ReactNode;
  state: "done" | "current" | "upcoming" | "error";
}

/** Vertical progress timeline used for order status (customer) and history (admin). */
export function OrderTimeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cx("relative", className)}>
      {items.map((item, i) => (
        <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 && <span aria-hidden className={cx("absolute left-[11px] top-6 h-[calc(100%-1rem)] w-0.5", item.state === "done" ? "bg-success" : "bg-border")} />}
          <span className={cx("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full",
            item.state === "done" && "bg-success text-white", item.state === "current" && "bg-primary text-primary-contrast ring-4 ring-primary/20",
            item.state === "upcoming" && "border-2 border-border-strong bg-surface", item.state === "error" && "bg-danger text-white")}>
            {item.state === "done" ? <Check className="size-3.5" aria-hidden /> : item.state === "current" ? <Circle className="size-2.5 fill-current" aria-hidden /> : null}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cx("text-sm font-medium", item.state === "upcoming" ? "text-faint" : "text-text")}>
              {item.label}<span className="sr-only">{item.state === "done" ? " (done)" : item.state === "current" ? " (current)" : ""}</span>
            </p>
            {item.at && <p className="text-xs text-muted">{formatDateTime(item.at, { timeStyle: "short", dateStyle: "medium" })}</p>}
            {item.detail && <div className="mt-0.5 text-sm text-muted">{item.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function QuantityStepper({ value, onChange, min = 0, max = 50, label, size = "md", className }: { value: number; onChange: (value: number) => void; min?: number; max?: number; label: string; size?: "sm" | "md"; className?: string }) {
  const btn = size === "sm" ? "size-8" : "size-10";
  return (
    <div className={cx("inline-flex items-center justify-between rounded-full border border-border-strong bg-surface", className)} role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className={cx(btn, "flex items-center justify-center rounded-full text-text hover:bg-subtle disabled:opacity-40")} onClick={() => onChange(value - 1)} disabled={value <= min}
        aria-label={value - 1 <= 0 ? `Remove ${label}` : `Decrease ${label}`}>
        {value - 1 <= 0 && min === 0 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className={cx(btn, "flex items-center justify-center rounded-full text-text hover:bg-subtle disabled:opacity-40")} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function CartLine({ name, options, quantity, unitPriceMinor, lineTotalMinor, currency, problem, onQuantityChange }: {
  name: string; options?: string[]; quantity: number; unitPriceMinor: number; lineTotalMinor: number; currency: string; problem?: string | null;
  onQuantityChange?: (quantity: number) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className={cx("font-medium", problem && "text-muted line-through")}>{name}</p>
        {options && options.length > 0 && <p className="mt-0.5 text-sm text-muted">{options.join(" · ")}</p>}
        {problem && <p className="mt-1 text-sm font-medium text-danger">{problem}</p>}
        {!onQuantityChange && <p className="mt-0.5 text-sm text-muted">{quantity} × {formatMoney(unitPriceMinor, currency)}</p>}
      </div>
      <div className="flex flex-col items-end gap-2">
        <Money minor={lineTotalMinor} currency={currency} className="font-medium" />
        {onQuantityChange && <QuantityStepper value={quantity} onChange={onQuantityChange} label={name} size="sm" />}
      </div>
    </div>
  );
}

export function Stat({ label, value, delta, hint }: { label: ReactNode; value: ReactNode; delta?: { value: number; label: string } | null; hint?: ReactNode }) {
  return (
    <div className="rounded-[var(--ros-radius-lg)] border border-border bg-surface p-4 shadow-[var(--ros-shadow-sm)]">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {delta && (
        <p className={cx("mt-1 text-xs font-medium", delta.value > 0 ? "text-success" : delta.value < 0 ? "text-danger" : "text-muted")}>
          {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "•"} {delta.label}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
