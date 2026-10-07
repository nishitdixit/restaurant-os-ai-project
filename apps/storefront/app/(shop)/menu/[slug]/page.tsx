// Product page (docs/SEO.md: /menu/{product-slug}) with full option selection.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { MenuProduct } from "@restaurant-os/types";
import { formatMoney } from "@restaurant-os/ui";
import { DietMark, DishBadges, JsonLd, SpiceLevel, StoreStatusBanner } from "@/components/basics";
import { ProductGallery } from "@/components/product-gallery";
import { dishDescription, dishName } from "@/lib/experience";
import { ProductPurchase } from "@/components/product-purchase";
import { serverGet } from "@/lib/api";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo";
import { getConfig, previewQuery, SITE_URL, storeSlug } from "@/lib/store";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [config, store, pq] = await Promise.all([getConfig(), storeSlug(), previewQuery()]);
  const product = await serverGet<MenuProduct>(`/v1/storefront/${store}/products/${encodeURIComponent(slug)}${pq}`, pq ? 0 : 15);
  return { config, product };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { config, product } = await load(slug);
  if (!product) return { title: "Not found", robots: { index: false } };
  const description = product.description || `${product.name} at ${config.name} — ${formatMoney(product.priceMinor, config.currency)}. Order online.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/menu/${product.slug}` },
    openGraph: { title: `${product.name} · ${config.name}`, description, url: `/menu/${product.slug}`, images: product.imageUrl ? [{ url: product.imageUrl, alt: product.name }] : undefined },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const { config, product } = await load(slug);
  if (!product) notFound();
  const name = dishName(product, config.experience.site.language);
  const description = dishDescription(product, config.experience.site.language);
  return (
    <>
      <JsonLd data={productJsonLd(config, product)} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Menu", url: `${SITE_URL}/menu` }, { name: product.categoryName, url: `${SITE_URL}/${product.categorySlug}` }, { name: product.name, url: `${SITE_URL}/menu/${product.slug}` }])} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/menu" className="hover:underline">Menu</Link> /</li>
          <li><Link href={`/${product.categorySlug}`} className="hover:underline">{product.categoryName}</Link> /</li>
          <li aria-current="page" className="text-text">{product.name}</li>
        </ol>
      </nav>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <ProductGallery name={product.name} images={[...(product.imageUrl ? [{ url: product.imageUrl, alt: product.name }] : []), ...product.gallery]} />
        <div>
          <div className="flex items-center gap-2"><DietMark dietary={product.dietary} /><SpiceLevel level={product.spiceLevel} /></div>
          {config.experience.menu.showBadges && <DishBadges badges={product.badges} max={4} className="mt-3" />}
          <h1 className="mt-2 text-3xl ros-heading">{name.primary}{name.secondary && <span lang="hi" className="mt-1 block text-xl font-medium text-link">{name.secondary}</span>}</h1>
          <p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(product.priceMinor, config.currency)}</p>
          {description && <p className="mt-3 text-muted">{description}</p>}
          {product.longDescription && <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{product.longDescription}</p>}
          {(product.allergens.length > 0 || product.tags.length > 0) && (
            <dl className="mt-4 space-y-1 text-sm">
              {product.allergens.length > 0 && <div><dt className="inline font-medium">Allergens: </dt><dd className="inline text-muted">{product.allergens.join(", ")}</dd></div>}
              {product.tags.length > 0 && <div><dt className="sr-only">Tags</dt><dd className="flex flex-wrap gap-1.5">{product.tags.map((t) => <span key={t} className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">{t}</span>)}</dd></div>}
            </dl>
          )}
          <div className="mt-4"><StoreStatusBanner config={config} /></div>
          <div className="mt-6"><ProductPurchase product={product} /></div>
        </div>
      </div>
    </>
  );
}
