"use client";
// Add-to-cart flows. Items with options open an option sheet that enforces the merchant's min/max
// rules before anything is added; prices shown here are confirmed again by the server quote.
import { useMemo, useState } from "react";
import Image from "next/image";
import type { MenuProduct } from "@restaurant-os/types";
import { Button, Drawer, cx, formatMoney, QuantityStepper, toast } from "@restaurant-os/ui";
import { Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStore } from "./providers";

function initialSelection(product: MenuProduct): Record<string, string[]> {
  // Pre-select the first available option of single-choice required groups (e.g. "Regular" portion).
  return Object.fromEntries(product.modifierGroups.map((g) => {
    const first = g.modifiers.find((m) => m.available);
    return [g.id, g.minSelections === 1 && g.maxSelections === 1 && first ? [first.id] : []];
  }));
}

export function useOptionSelection(product: MenuProduct) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initialSelection(product));
  const toggle = (groupId: string, modifierId: string) => {
    const group = product.modifierGroups.find((g) => g.id === groupId)!;
    setSelected((current) => {
      const now = current[groupId] ?? [];
      if (group.maxSelections === 1) return { ...current, [groupId]: now.includes(modifierId) && group.minSelections === 0 ? [] : [modifierId] };
      if (now.includes(modifierId)) return { ...current, [groupId]: now.filter((id) => id !== modifierId) };
      if (now.length >= group.maxSelections) return current;
      return { ...current, [groupId]: [...now, modifierId] };
    });
  };
  const problems = product.modifierGroups.flatMap((g) => {
    const count = (selected[g.id] ?? []).length;
    return count < g.minSelections ? [{ groupId: g.id, message: g.minSelections === 1 ? `Choose ${g.name.toLowerCase()}` : `Choose at least ${g.minSelections}` }] : [];
  });
  const modifierIds = product.modifierGroups.flatMap((g) => selected[g.id] ?? []);
  const chosen = product.modifierGroups.flatMap((g) => g.modifiers.filter((m) => (selected[g.id] ?? []).includes(m.id)));
  const unitPriceMinor = product.priceMinor + chosen.reduce((s, m) => s + m.priceDeltaMinor, 0);
  return { selected, toggle, problems, modifierIds, optionLabels: chosen.map((m) => m.name), unitPriceMinor, reset: () => setSelected(initialSelection(product)) };
}

export function OptionGroups({ product, selection }: { product: MenuProduct; selection: ReturnType<typeof useOptionSelection> }) {
  const { currency } = useStore();
  return (
    <div className="space-y-5">
      {product.modifierGroups.map((g) => {
        const multi = g.maxSelections > 1;
        const missing = selection.problems.find((p) => p.groupId === g.id);
        return (
          <fieldset key={g.id}>
            <legend className="flex w-full items-baseline justify-between gap-3">
              <span className="font-semibold">{g.name}</span>
              <span className={cx("text-xs", missing ? "font-medium text-danger" : "text-muted")}>
                {g.minSelections > 0 ? "Required" : "Optional"}{multi ? ` · up to ${g.maxSelections}` : ""}
              </span>
            </legend>
            <div className="mt-2 divide-y divide-border rounded-[var(--radius-md)] border border-border">
              {g.modifiers.map((m) => {
                const checked = (selection.selected[g.id] ?? []).includes(m.id);
                const full = multi && !checked && (selection.selected[g.id] ?? []).length >= g.maxSelections;
                return (
                  <label key={m.id} className={cx("flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2", (!m.available || full) && "cursor-not-allowed opacity-50")}>
                    <input type={multi ? "checkbox" : "radio"} name={`group-${g.id}`} checked={checked} disabled={!m.available || full}
                      onChange={() => selection.toggle(g.id, m.id)} className="size-4 accent-[var(--brand-primary)]" />
                    <span className="flex-1 text-sm">{m.name}{!m.available && <span className="ml-2 text-xs text-muted">(unavailable)</span>}</span>
                    {m.priceDeltaMinor !== 0 && <span className="text-sm text-muted">{m.priceDeltaMinor > 0 ? "+" : "−"}{formatMoney(Math.abs(m.priceDeltaMinor), currency)}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function AddToCartButton({ product, size = "md", label = "Add" }: { product: MenuProduct; size?: "md" | "lg"; label?: string }) {
  const { add } = useCart();
  const { canOrder } = useStore();
  const [open, setOpen] = useState(false);
  const hasOptions = product.modifierGroups.length > 0;

  if (!product.available) {
    return <span className="inline-flex h-10 items-center rounded-[var(--radius-md)] bg-subtle px-3 text-sm font-medium text-muted">{product.unavailableReason ?? "Out of stock"}</span>;
  }
  const quickAdd = () => {
    add({ productId: product.id, slug: product.slug, name: product.name, modifierIds: [], optionLabels: [], unitPriceMinor: product.priceMinor, imageUrl: product.imageUrl });
    toast.success(`${product.name} added`, { description: canOrder ? undefined : "You can check out once we're open.", action: undefined });
  };
  return (
    <>
      <Button size={size} variant={size === "lg" ? "primary" : "outline"} onClick={hasOptions ? () => setOpen(true) : quickAdd} icon={<Plus className="size-4" aria-hidden />}
        aria-label={`${label} ${product.name}${hasOptions ? " (choose options)" : ""}`}>
        {label}
      </Button>
      {hasOptions && <OptionSheet product={product} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function OptionSheet({ product, open, onOpenChange }: { product: MenuProduct; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { add } = useCart();
  const { currency } = useStore();
  const selection = useOptionSelection(product);
  const [quantity, setQuantity] = useState(1);
  const [tried, setTried] = useState(false);
  const total = useMemo(() => selection.unitPriceMinor * quantity, [selection.unitPriceMinor, quantity]);
  const submit = () => {
    setTried(true);
    if (selection.problems.length) return;
    add({ productId: product.id, slug: product.slug, name: product.name, modifierIds: selection.modifierIds, optionLabels: selection.optionLabels, unitPriceMinor: selection.unitPriceMinor, imageUrl: product.imageUrl }, quantity);
    toast.success(`${product.name} added`);
    onOpenChange(false);
    selection.reset();
    setQuantity(1);
    setTried(false);
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={product.name} description={product.description || undefined}
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={(q) => setQuantity(Math.max(1, q))} min={1} label={product.name} />
          <Button size="lg" className="flex-1" onClick={submit}>Add · {formatMoney(total, currency)}</Button>
        </div>
      }>
      {product.imageUrl && (
        <div className="relative mb-4 aspect-[16/9] overflow-hidden rounded-[var(--radius-lg)] bg-subtle">
          <Image src={product.imageUrl} alt={product.name} fill sizes="480px" className="object-cover" />
        </div>
      )}
      <OptionGroups product={product} selection={selection} />
      {tried && selection.problems.length > 0 && <p role="alert" className="mt-4 text-sm font-medium text-danger">{selection.problems[0]!.message} to continue.</p>}
    </Drawer>
  );
}
