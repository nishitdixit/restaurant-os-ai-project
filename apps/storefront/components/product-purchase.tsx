"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MenuProduct } from "@restaurant-os/types";
import { Button, formatMoney, QuantityStepper, toast } from "@restaurant-os/ui";
import { useCart } from "@/lib/cart";
import { OptionGroups, useOptionSelection } from "./product-ui";
import { useStore } from "./providers";

/** Inline option selection + add to cart on the product page. */
export function ProductPurchase({ product }: { product: MenuProduct }) {
  const { add, setOpen } = useCart();
  const { currency } = useStore();
  const router = useRouter();
  const selection = useOptionSelection(product);
  const [quantity, setQuantity] = useState(1);
  const [tried, setTried] = useState(false);

  if (!product.available) {
    return (
      <div className="rounded-[var(--ros-radius-lg)] border border-border bg-subtle p-4">
        <p className="font-medium">{product.unavailableReason ?? "Out of stock"}</p>
        <p className="mt-1 text-sm text-muted">This dish isn&apos;t available right now. Have a look at the rest of the menu.</p>
        <Button variant="outline" className="mt-3" onClick={() => router.push("/menu")}>Back to menu</Button>
      </div>
    );
  }

  const submit = (goToCart: boolean) => {
    setTried(true);
    if (selection.problems.length) return;
    add({ productId: product.id, slug: product.slug, name: product.name, modifierIds: selection.modifierIds, optionLabels: selection.optionLabels, unitPriceMinor: selection.unitPriceMinor, imageUrl: product.imageUrl }, quantity);
    toast.success(`${quantity} × ${product.name} added`);
    if (goToCart) setOpen(true);
  };

  return (
    <div className="space-y-5">
      {product.modifierGroups.length > 0 && <OptionGroups product={product} selection={selection} />}
      {tried && selection.problems.length > 0 && <p role="alert" className="text-sm font-medium text-danger">{selection.problems[0]!.message} to continue.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={quantity} onChange={(q) => setQuantity(Math.max(1, q))} min={1} label={product.name} />
        <Button size="lg" className="flex-1" onClick={() => submit(true)}>Add to order · {formatMoney(selection.unitPriceMinor * quantity, currency)}</Button>
      </div>
    </div>
  );
}
