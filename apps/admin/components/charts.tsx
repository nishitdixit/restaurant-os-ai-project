"use client";
// Minimal, accessible charts for the owner dashboard (single series, one validated hue: #175cd3).
// Columns <= 24px with 4px rounded data-ends, hairline grid, per-mark hover/focus tooltip, and a
// table view so no value is gated behind hovering.
import { useMemo, useState } from "react";
import { formatDateTime, formatMoney } from "@restaurant-os/ui";

const HUE = "#175cd3";

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

function compactMoney(minor: number, currency: string) {
  const rupees = minor / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, notation: rupees >= 10000 ? "compact" : "standard", maximumFractionDigits: rupees >= 10000 ? 1 : 0 }).format(rupees);
}

export function DailyColumns({ data, currency, title }: { data: { date: string; grossSalesMinor: number; orders: number }[]; currency: string; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const width = 720, height = 220, left = 56, bottom = 24, top = 8;
  const plotW = width - left - 8, plotH = height - top - bottom;
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.grossSalesMinor))), [data]);
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(2, band - 2));
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / 8);
  const a = active !== null ? data[active] : null;

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between gap-3">
        <figcaption className="text-sm font-semibold">{title}</figcaption>
        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setTable(!table)}>{table ? "Show chart" : "View as table"}</button>
      </div>
      {table ? (
        <div className="max-h-72 overflow-y-auto rounded-[var(--ros-radius-md)] border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-subtle text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 text-right font-medium">Paid orders</th><th className="px-3 py-2 text-right font-medium">Sales</th></tr></thead>
            <tbody className="divide-y divide-border">{data.map((d) => <tr key={d.date}><td className="px-3 py-1.5">{formatDateTime(`${d.date}T12:00:00Z`, { dateStyle: "medium" })}</td><td className="px-3 py-1.5 text-right tabular-nums">{d.orders}</td><td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(d.grossSalesMinor, currency)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title}. Use the table view for exact values.`} onPointerLeave={() => setActive(null)}>
            {ticks.map((t) => {
              const y = top + plotH - (t / max) * plotH;
              return (
                <g key={t}>
                  <line x1={left} x2={width - 8} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} />
                  <text x={left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">{compactMoney(t, currency)}</text>
                </g>
              );
            })}
            {data.map((d, i) => {
              const h = d.grossSalesMinor > 0 ? Math.max(2, (d.grossSalesMinor / max) * plotH) : 0;
              const x = left + i * band + (band - barW) / 2;
              const y = top + plotH - h;
              const r = Math.min(4, barW / 2, h);
              return (
                <g key={d.date} tabIndex={0} role="graphics-symbol" aria-label={`${d.date}: ${formatMoney(d.grossSalesMinor, currency)}, ${d.orders} orders`}
                  onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} className="outline-none">
                  <rect x={left + i * band} y={top} width={band} height={plotH} fill="transparent" />
                  {h > 0 && <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`} fill={HUE} opacity={active === null || active === i ? 1 : 0.55} />}
                  {i % labelEvery === 0 && <text x={left + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--color-muted)">{formatDateTime(`${d.date}T12:00:00Z`, { day: "numeric", month: "short" })}</text>}
                </g>
              );
            })}
            <line x1={left} x2={width - 8} y1={top + plotH} y2={top + plotH} stroke="var(--color-border-strong)" strokeWidth={1} />
          </svg>
          {a && active !== null && (
            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[var(--ros-radius-md)] border border-border bg-surface px-3 py-2 text-xs shadow-[var(--ros-shadow-md)]"
              style={{ left: `${((left + active * band + band / 2) / width) * 100}%` }}>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(a.grossSalesMinor, currency)}</p>
              <p className="text-muted">{a.orders} paid order{a.orders === 1 ? "" : "s"} · {formatDateTime(`${a.date}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" })}</p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Horizontal bar list: label + value as text tokens, bar as the mark. */
export function BarList({ rows, valueLabel }: { rows: { label: string; value: number; display: string }[]; valueLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">No data for this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="sr-only"><tr><th>Name</th><th>{valueLabel}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="w-full py-1.5 pr-3">
              <span className="block">{r.label}</span>
              <span className="mt-1 block h-2 rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: HUE }} aria-hidden />
            </td>
            <td className="whitespace-nowrap py-1.5 text-right align-top tabular-nums font-medium">{r.display}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
