// Indexable category page (docs/SEO.md URL strategy: /{category}).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd, StoreStatusBanner } from "@/components/basics";
import { ProductCard } from "@/components/product-card";
import { breadcrumbJsonLd } from "@/lib/seo";
import { getConfig, getMenu, SITE_URL } from "@/lib/store";

type Params = { params: Promise<{ category: string }> };

async function load(slug: string) {
  const [config, menu] = await Promise.all([getConfig(), getMenu()]);
  const category = menu.categories.find((c) => c.slug === slug);
  return { config, menu, category };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category: slug } = await params;
  const { config, category } = await load(slug);
  if (!category) return { title: "Not found", robots: { index: false } };
  const names = category.products.slice(0, 4).map((p) => p.name).join(", ");
  return {
    title: `${category.name}`,
    description: category.description || `${category.name} at ${config.name}: ${names}. Order online for delivery or pickup.`,
    alternates: { canonical: `/${category.slug}` },
    openGraph: { title: `${category.name} · ${config.name}`, url: `/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: Params) {
  const { category: slug } = await params;
  const { config, menu, category } = await load(slug);
  if (!category) notFound();
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: config.name, url: SITE_URL }, { name: "Menu", url: `${SITE_URL}/menu` }, { name: category.name, url: `${SITE_URL}/${category.slug}` }])} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/" className="hover:underline">Home</Link> /</li>
          <li><Link href="/menu" className="hover:underline">Menu</Link> /</li>
          <li aria-current="page" className="text-text">{category.name}</li>
        </ol>
      </nav>
      <h1 className="mt-2 text-2xl ros-heading">{config.experience.site.language === "hi" && category.nameHi ? category.nameHi : category.name}
        {config.experience.site.language === "bilingual" && category.nameHi && <span lang="hi" className="mt-1 block text-lg font-medium text-link">{category.nameHi}</span>}</h1>
      {category.description && <p className="mt-1 text-muted">{category.description}</p>}
      <div className="mt-4"><StoreStatusBanner config={config} /></div>
      <div className="ros-product-list mt-4">
        {category.products.map((p, i) => <ProductCard key={p.id} product={p} currency={config.currency} priority={i < 2} language={config.experience.site.language} showBadges={config.experience.menu.showBadges} />)}
      </div>
      <section aria-labelledby="more" className="mt-10">
        <h2 id="more" className="text-lg ros-heading">More from the menu</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {menu.categories.filter((c) => c.id !== category.id).map((c) => (
            <li key={c.id}><Link href={`/${c.slug}`} className="inline-flex h-9 items-center rounded-chip bg-surface px-4 text-sm ring-1 ring-border hover:bg-subtle">{c.name}</Link></li>
          ))}
        </ul>
      </section>
    </>
  );
}
