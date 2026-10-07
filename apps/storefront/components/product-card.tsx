// Product card (ui/DESIGN_SYSTEM.md "ProductCard"): price, availability, diet and badges visible before any tap.
// One markup serves every dish layout (list · photo grid · compact · menu board; see .ros-product in globals.css),
// whether chosen by the theme, a homepage section or the customer's menu view.
import Image from "next/image";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import type { LanguageMode } from "@restaurant-os/domain";
import type { MenuProduct } from "@restaurant-os/types";
import { cx, formatMoney } from "@restaurant-os/ui";
import { dishDescription, dishName } from "@/lib/experience";
import { DietMark, DishBadges, SpiceLevel } from "./basics";
import { AddToCartButton } from "./product-ui";

export interface ProductCardProps {
  product: MenuProduct;
  currency: string;
  priority?: boolean;
  language?: LanguageMode;
  showBadges?: boolean;
}

export function ProductCard({ product, currency, priority = false, language = "en", showBadges = true }: ProductCardProps) {
  const fromPrice = product.modifierGroups.some((g) => g.minSelections > 0 && g.modifiers.some((m) => m.priceDeltaMinor < 0));
  const name = dishName(product, language);
  const description = dishDescription(product, language);
  const badges = showBadges ? product.badges : [];
  return (
    <article className={cx("ros-card ros-product", !product.available && "[&_.ros-product-media]:opacity-60 [&_.ros-product-media]:grayscale")} data-available={product.available}>
      <div className="ros-product-info">
        <div className="flex items-center gap-2">
          <DietMark dietary={product.dietary} />
          <SpiceLevel level={product.spiceLevel} />
        </div>
        <DishBadges badges={badges} className="ros-product-badges mt-1.5" />
        <div className="ros-product-title mt-1.5">
          <h3 className="font-semibold leading-snug">
            <Link href={`/menu/${product.slug}`} className="hover:underline">{name.primary}</Link>
            {name.secondary && <span lang="hi" className="mt-0.5 block text-sm font-medium text-link">{name.secondary}</span>}
          </h3>
          <p className="shrink-0 font-medium tabular-nums">{fromPrice ? "From " : ""}{formatMoney(product.priceMinor, currency)}</p>
        </div>
        {description && <p className="ros-product-desc mt-1.5 line-clamp-2 text-sm text-muted">{description}</p>}
        {product.modifierGroups.length > 0 && <p className="mt-1 text-xs text-faint">Customisable</p>}
      </div>
      {product.imageUrl ? (
        <Link href={`/menu/${product.slug}`} className="ros-product-media relative block w-full overflow-hidden bg-subtle" tabIndex={-1} aria-hidden>
          <Image src={product.imageUrl} alt="" fill sizes="(min-width: 768px) 320px, 50vw" className="object-cover" priority={priority} />
          <DishBadges badges={badges} max={1} className="ros-product-media-badges absolute right-2 top-2" />
        </Link>
      ) : (
        <div className="ros-product-media hidden w-full items-center justify-center bg-subtle text-faint cards-grid:flex" aria-hidden>
          <UtensilsCrossed className="size-7" />
          <DishBadges badges={badges} max={1} className="ros-product-media-badges absolute right-2 top-2" />
        </div>
      )}
      <div className="ros-product-action">
        <AddToCartButton product={product} />
      </div>
    </article>
  );
}
