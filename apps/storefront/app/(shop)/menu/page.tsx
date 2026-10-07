import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@restaurant-os/ui";
import { JsonLd, StoreStatusBanner } from "@/components/basics";
import { MenuBrowser } from "@/components/menu-browser";
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
      <h1 className="text-2xl ros-heading">Menu</h1>
      <div className="mt-4"><StoreStatusBanner config={config} /></div>
      {menu.categories.length === 0 ? (
        <EmptyState className="mt-6" title="The menu is being updated" description="Please check back in a little while." />
      ) : (
        <Suspense>
          <MenuBrowser menu={menu} currency={config.currency} language={config.experience.site.language} settings={config.experience.menu} storeSlug={config.slug} />
        </Suspense>
      )}
    </>
  );
}
