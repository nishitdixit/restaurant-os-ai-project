// Product card (ui/DESIGN_SYSTEM.md "ProductCard"): price, availability and diet visible before any tap.
import Image from "next/image";
import Link from "next/link";
import type { MenuProduct } from "@restaurant-os/types";
import { cx, formatMoney } from "@restaurant-os/ui";
import { DietMark, SpiceLevel } from "./basics";
import { AddToCartButton } from "./product-ui";

export function ProductCard({ product, currency, priority = false }: { product: MenuProduct; currency: string; priority?: boolean }) {
  const fromPrice = product.modifierGroups.some((g) => g.minSelections > 0 && g.modifiers.some((m) => m.priceDeltaMinor < 0));
  return (
    <article className={cx("flex gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]", !product.available && "opacity-75")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <DietMark dietary={product.dietary} />
          <SpiceLevel level={product.spiceLevel} />
        </div>
        <h3 className="mt-1.5 font-semibold leading-snug">
          <Link href={`/menu/${product.slug}`} className="hover:underline">{product.name}</Link>
        </h3>
        <p className="mt-1 font-medium tabular-nums">{fromPrice ? "From " : ""}{formatMoney(product.priceMinor, currency)}</p>
        {product.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{product.description}</p>}
        {product.modifierGroups.length > 0 && <p className="mt-1 text-xs text-faint">Customisable</p>}
      </div>
      <div className="flex w-28 shrink-0 flex-col items-center gap-2 sm:w-32">
        {product.imageUrl ? (
          <Link href={`/menu/${product.slug}`} className="relative block aspect-square w-full overflow-hidden rounded-[var(--radius-md)] bg-subtle" tabIndex={-1} aria-hidden>
            <Image src={product.imageUrl} alt="" fill sizes="128px" className="object-cover" priority={priority} />
          </Link>
        ) : null}
        <AddToCartButton product={product} />
      </div>
    </article>
  );
}
