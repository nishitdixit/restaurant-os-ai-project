import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { EmptyState } from "@restaurant-os/ui";
import { JsonLd, StoreStatusBanner } from "@/components/basics";
import { CategoryNav } from "@/components/category-nav";
import { ProductCard } from "@/components/product-card";
import { menuJsonLd } from "@/lib/seo";
import { getConfig, getMenu } from "@/lib/store";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  return {
    title: "Menu",
    description: `Full menu of ${config.name} with prices. Order online for delivery or pickup.`,
    alternates: { canonical: "/menu" },
    openGraph: { title: `${config.name} menu`, url: "/menu" },
  };
}

export default async function MenuPage() {
  const [config, menu] = await Promise.all([getConfig(), getMenu()]);
  return (
    <>
      <JsonLd data={menuJsonLd(config, menu)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
        <Link href="/search" className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-sm text-muted hover:text-text">
          <Search className="size-4" aria-hidden />Search dishes
        </Link>
      </div>
      <div className="mt-4"><StoreStatusBanner config={config} /></div>
      {menu.categories.length === 0 ? (
        <EmptyState className="mt-6" title="The menu is being updated" description="Please check back in a little while." />
      ) : (
        <>
          {/* Rendered directly (not in a wrapper): a sticky element only sticks within its parent. */}
          <CategoryNav className="mt-4" categories={menu.categories.map((c) => ({ slug: c.slug, name: c.name }))} />
          {menu.categories.map((category, ci) => (
            <section key={category.id} id={`cat-${category.slug}`} aria-labelledby={`h-${category.slug}`} className="mt-8 scroll-mt-40 md:scroll-mt-32">
              <h2 id={`h-${category.slug}`} className="text-xl font-semibold">
                <Link href={`/${category.slug}`} className="hover:underline">{category.name}</Link>
                <span className="ml-2 text-sm font-normal text-muted">{category.products.length}</span>
              </h2>
              {category.description && <p className="mt-1 text-sm text-muted">{category.description}</p>}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {category.products.map((p, pi) => <ProductCard key={p.id} product={p} currency={config.currency} priority={ci === 0 && pi < 2} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
