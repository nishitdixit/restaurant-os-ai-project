"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import type { MenuProduct } from "@restaurant-os/types";
import { EmptyState, ErrorState, Input, Skeleton, buttonClass, formatMoney } from "@restaurant-os/ui";
import { DietMark } from "@/components/basics";
import { AddToCartButton } from "@/components/product-ui";
import { useStore } from "@/components/providers";
import { clientRequest } from "@/lib/api";

export function SearchClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { slug, currency } = useStore();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<MenuProduct[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    router.replace(term ? `/search?q=${encodeURIComponent(term)}` : "/search", { scroll: false });
    if (term.length < 2) { setResults(null); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await clientRequest<{ items: MenuProduct[] }>(`/v1/storefront/${slug}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        setResults(res.items);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, slug, router]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Search the menu</h1>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “biryani” or “paneer”" aria-label="Search dishes" className="h-12 pl-10 text-base" />
      </div>
      <div className="mt-6" aria-live="polite">
        {loading && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
        {!loading && error && <ErrorState title="Search isn't working right now" description="You can still browse the full menu." />}
        {!loading && !error && results && results.length === 0 && (
          <EmptyState title={`Nothing found for “${q.trim()}”`} description="Check the spelling or browse by category."
            action={<Link href="/menu" className={buttonClass("primary")}>Browse the menu</Link>} />
        )}
        {!loading && !error && results && results.length > 0 && (
          <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <DietMark dietary={p.dietary} />
                <div className="min-w-0 flex-1">
                  <Link href={`/menu/${p.slug}`} className="font-medium hover:underline">{p.name}</Link>
                  <p className="text-sm text-muted">{p.categoryName} · {formatMoney(p.priceMinor, currency)}</p>
                </div>
                <AddToCartButton product={p} />
              </li>
            ))}
          </ul>
        )}
        {!results && !loading && <p className="text-sm text-muted">Type at least two letters.</p>}
      </div>
    </div>
  );
}
