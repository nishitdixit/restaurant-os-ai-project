// Homepage: the restaurant's own composition of sections (ADR-013), from Appearance → Homepage. With no
// configuration it renders the default composition (packages/domain defaultExperience()).
import type { PublicOffer } from "@restaurant-os/types";
import { JsonLd, StoreStatusBanner } from "@/components/basics";
import { Sections } from "@/components/sections/render";
import { serverGet } from "@/lib/api";
import { restaurantJsonLd } from "@/lib/seo";
import { storeTheme } from "@/lib/theme";
import { getConfig, getMenu, previewQuery, storeSlug } from "@/lib/store";

export default async function HomePage() {
  const [config, menu, slug, pq] = await Promise.all([getConfig(), getMenu(), storeSlug(), previewQuery()]);
  const offers = (await serverGet<{ items: PublicOffer[] }>(`/v1/storefront/${slug}/offers${pq}`, pq ? 0 : 60))?.items ?? [];
  const status = <StoreStatusBanner config={config} />;
  return (
    <>
      <JsonLd data={restaurantJsonLd(config)} />
      {status && <div className="ros-container pt-4 empty:hidden">{status}</div>}
      <Sections config={config} theme={storeTheme(config)} menu={menu} offers={offers} />
    </>
  );
}
