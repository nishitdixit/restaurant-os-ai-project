"use client";
// Menu browsing (ADR-013 "Menu experience"): inline search over the loaded menu (English and Hindi names, categories,
// tags), a veg-only filter, suggestions and recent searches, and — when the restaurant allows it — a switch between
// photo cards and the dense menu board. Filtering is instant and client-side; the full menu is server-rendered for
// SEO and works without JavaScript.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { History, LayoutGrid, Leaf, ListTree, Search, X } from "lucide-react";
import type { ExperienceMenu, LanguageMode } from "@restaurant-os/domain";
import type { Menu, MenuProduct } from "@restaurant-os/types";
import { EmptyState, buttonClass, cx } from "@restaurant-os/ui";
import { dishName } from "@/lib/experience";
import { CategoryNav } from "./category-nav";
import { ProductCard } from "./product-card";

type View = "auto" | "grid" | "board";

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function matches(p: MenuProduct, categoryName: string, terms: string[]): boolean {
  const haystack = fold([p.name, p.nameHi, p.description, p.descriptionHi, categoryName, ...p.tags].join(" "));
  return terms.every((t) => haystack.includes(t));
}

function readList(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as string[]; } catch { return []; }
}

export function MenuBrowser({ menu, currency, language, settings, storeSlug }: {
  menu: Menu; currency: string; language: LanguageMode; settings: ExperienceMenu; storeSlug: string;
}) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [vegOnly, setVegOnly] = useState(false);
  const [view, setView] = useState<View>("auto");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const recentKey = `ros-recent-searches:${storeSlug}`;
  const viewKey = `ros-menu-view:${storeSlug}`;

  useEffect(() => {
    setRecent(readList(recentKey).slice(0, 5));
    try { const v = localStorage.getItem(viewKey) as View | null; if (v === "grid" || v === "board") setView(v); } catch { /* ignore */ }
    if (params.get("search") === "1") input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const terms = fold(q.trim()).split(/\s+/).filter((t) => t.length > 0);
  const filtered = useMemo(() => menu.categories
    .map((c) => ({ ...c, products: c.products.filter((p) => (!vegOnly || p.dietary === "VEG" || p.dietary === "VEGAN") && (!terms.length || matches(p, `${c.name} ${c.nameHi}`, terms))) }))
    .filter((c) => c.products.length > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [menu, vegOnly, terms.join(" ")]);
  const count = filtered.reduce((n, c) => n + c.products.length, 0);
  const filtering = terms.length > 0 || vegOnly;

  const remember = (term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    const next = [t, ...readList(recentKey).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 5);
    setRecent(next);
    try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const chooseView = (v: View) => {
    setView(v);
    try { localStorage.setItem(viewKey, v); } catch { /* ignore */ }
  };

  // Suggestions while the box is empty: recent searches, then real bestsellers (or categories when there are none).
  const all = menu.categories.flatMap((c) => c.products);
  const bestsellers = menu.bestsellerIds.flatMap((id) => all.find((p) => p.id === id) ?? []).slice(0, 4).map((p) => dishName(p, language).primary);
  const suggestions = bestsellers.length ? bestsellers : menu.categories.slice(0, 5).map((c) => c.name);
  const showSuggestions = settings.inlineSearch && focused && !q.trim() && (recent.length > 0 || suggestions.length > 0);
  const layout = view === "auto" ? undefined : view;

  return (
    <>
      {(settings.inlineSearch || settings.vegFilter || settings.viewToggle) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {settings.inlineSearch && (
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input ref={input} type="search" value={q} placeholder="Search dishes" aria-label="Search the menu" enterKeyHint="search"
                onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => { window.setTimeout(() => setFocused(false), 150); remember(q); }}
                onKeyDown={(e) => { if (e.key === "Enter") { remember(q); input.current?.blur(); } if (e.key === "Escape") setQ(""); }}
                className="h-11 w-full rounded-input border-[length:var(--ros-control-border-width)] border-border-strong bg-surface pl-9 pr-9 text-[15px] text-text placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              {q && <button type="button" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-subtle"><X className="size-4" /></button>}
            </div>
          )}
          {settings.vegFilter && (
            <button type="button" onClick={() => setVegOnly((v) => !v)} aria-pressed={vegOnly}
              className={cx("ros-press inline-flex h-11 items-center gap-2 rounded-chip border px-4 text-sm font-medium",
                vegOnly ? "border-success bg-success-soft text-success" : "border-border-strong bg-surface text-text hover:bg-subtle")}>
              <Leaf className="size-4" aria-hidden />Veg only
            </button>
          )}
          {settings.viewToggle && (
            <div role="radiogroup" aria-label="Menu view" className="inline-flex h-11 items-center rounded-chip border border-border-strong bg-surface p-1">
              {([["grid", "Photos", <LayoutGrid key="g" className="size-4" aria-hidden />], ["board", "Menu board", <ListTree key="b" className="size-4" aria-hidden />]] as const).map(([v, label, icon]) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => chooseView(view === v ? "auto" : v)}
                  className={cx("inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-sm font-medium", view === v ? "ros-btn-primary" : "text-muted hover:text-text")}>
                  {icon}{label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showSuggestions && (
                <div className="ros-fade-up mt-2 rounded-[var(--ros-radius-md)] border border-border bg-surface p-2 shadow-[var(--ros-shadow-sm)]" aria-label="Search suggestions">
                  {recent.length > 0 && (
                    <>
                      <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-faint">Recent</p>
                      {recent.map((r) => (
                        <button key={r} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ(r)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-subtle">
                          <History className="size-4 text-muted" aria-hidden />{r}
                        </button>
                      ))}
                    </>
                  )}
                  <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-faint">{bestsellers.length ? "Popular here" : "Try"}</p>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                    {suggestions.map((s) => <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ(s)} className="rounded-chip bg-subtle px-3 py-1.5 text-sm hover:bg-border">{s}</button>)}
                  </div>
                </div>
              )}
      {filtering && <p className="mt-3 text-sm text-muted" aria-live="polite">{count ? `${count} dish${count === 1 ? "" : "es"}${vegOnly ? " · veg only" : ""}` : ""}</p>}

      {filtered.length === 0 ? (
        <EmptyState className="mt-6" title={q.trim() ? `Nothing found for “${q.trim()}”` : "No veg dishes right now"} description="Try another word, or clear the filters."
          action={<button type="button" className={buttonClass("primary")} onClick={() => { setQ(""); setVegOnly(false); }}>Show the full menu</button>} />
      ) : (
        <>
          {/* Rendered directly (not in a wrapper): a sticky element only sticks within its parent. */}
          <CategoryNav className="mt-4" categories={filtered.map((c) => ({ slug: c.slug, name: c.name }))} />
          {filtered.map((category, ci) => (
            <section key={category.id} id={`cat-${category.slug}`} aria-labelledby={`h-${category.slug}`} className="mt-8">
              <h2 id={`h-${category.slug}`} className="text-xl ros-heading">
                <Link href={`/${category.slug}`} className="hover:underline">{language === "hi" && category.nameHi ? category.nameHi : category.name}</Link>
                {language === "bilingual" && category.nameHi && <span lang="hi" className="ml-2 text-base font-medium text-link">{category.nameHi}</span>}
                <span className="ml-2 text-sm font-normal text-muted">{category.products.length}</span>
              </h2>
              {category.description && <p className="mt-1 text-sm text-muted">{category.description}</p>}
              <div className="ros-product-list mt-3" data-layout={layout}>
                {category.products.map((p, pi) => (
                  <ProductCard key={p.id} product={p} currency={currency} priority={ci === 0 && pi < 2} language={language} showBadges={settings.showBadges} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
