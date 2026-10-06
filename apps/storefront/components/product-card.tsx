// Product card (ui/DESIGN_SYSTEM.md "ProductCard"): price, availability and diet visible before any tap.
// One markup serves the theme's three dish layouts (list · grid · compact; see .ros-product in globals.css).
import Image from "next/image";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import type { MenuProduct } from "@restaurant-os/types";
import { cx, formatMoney } from "@restaurant-os/ui";
import { DietMark, SpiceLevel } from "./basics";
import { AddToCartButton } from "./product-ui";

export function ProductCard({ product, currency, priority = false }: { product: MenuProduct; currency: string; priority?: boolean }) {
  const fromPrice = product.modifierGroups.some((g) => g.minSelections > 0 && g.modifiers.some((m) => m.priceDeltaMinor < 0));
  return (
    <article className={cx("ros-card ros-product", !product.available && "opacity-75")}>
      <div className="ros-product-info">
        <div className="flex items-center gap-2">
          <DietMark dietary={product.dietary} />
          <SpiceLevel level={product.spiceLevel} />
        </div>
        <h3 className="mt-1.5 font-semibold leading-snug">
          <Link href={`/menu/${product.slug}`} className="hover:underline">{product.name}</Link>
        </h3>
        <p className="mt-1 font-medium tabular-nums">{fromPrice ? "From " : ""}{formatMoney(product.priceMinor, currency)}</p>
        {product.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted cards-compact:line-clamp-1">{product.description}</p>}
        {product.modifierGroups.length > 0 && <p className="mt-1 text-xs text-faint">Customisable</p>}
      </div>
      {product.imageUrl ? (
        <Link href={`/menu/${product.slug}`} className="ros-product-media relative block w-full overflow-hidden bg-subtle" tabIndex={-1} aria-hidden>
          <Image src={product.imageUrl} alt="" fill sizes="(min-width: 768px) 320px, 50vw" className="object-cover" priority={priority} />
        </Link>
      ) : (
        <div className="ros-product-media hidden w-full items-center justify-center bg-subtle text-faint cards-grid:flex" aria-hidden>
          <UtensilsCrossed className="size-7" />
        </div>
      )}
      <div className="ros-product-action">
        <AddToCartButton product={product} />
      </div>
    </article>
  );
}
