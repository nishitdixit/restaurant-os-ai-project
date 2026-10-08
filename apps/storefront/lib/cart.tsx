"use client";
// Cart state, preserved across visits in localStorage (docs/WEBSTORE.md "preserve cart state").
// Display prices here are hints only; every total the customer commits to comes from the server quote.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** A chosen option with its group, so the "Order on WhatsApp" message can say "Portion: Full" (ADR-014). */
export interface CartOption {
  group: string;
  name: string;
  priceDeltaMinor: number;
}

export interface CartItem {
  key: string;
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  modifierIds: string[];
  optionLabels: string[];
  /** Missing on carts saved before option groups were stored. */
  options?: CartOption[];
  unitPriceMinor: number;
  imageUrl: string | null;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotalMinor: number;
  ready: boolean;
  add: (item: Omit<CartItem, "key" | "quantity">, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const MAX_QTY = 50;

export function lineKey(productId: string, modifierIds: string[]) {
  return `${productId}:${[...modifierIds].sort().join(",")}`;
}

export function CartProvider({ storeSlug, children }: { storeSlug: string; children: ReactNode }) {
  const storageKey = `ros-cart:${storeSlug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: CartItem[]; savedAt?: number };
        // Carts older than a week are stale menus; start fresh.
        if (parsed.items && (!parsed.savedAt || Date.now() - parsed.savedAt < 7 * 24 * 3600 * 1000)) setItems(parsed.items.filter((i) => i.quantity > 0));
      }
    } catch { /* storage unavailable: in-memory cart only */ }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ items, savedAt: Date.now() })); } catch { /* ignore */ }
  }, [items, ready, storageKey]);

  const add = useCallback<CartContextValue["add"]>((item, quantity = 1) => {
    const key = lineKey(item.productId, item.modifierIds);
    setItems((current) => {
      const existing = current.find((i) => i.key === key);
      if (existing) return current.map((i) => (i.key === key ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + quantity), unitPriceMinor: item.unitPriceMinor } : i));
      return [...current, { ...item, key, quantity: Math.min(MAX_QTY, quantity) }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) => (quantity <= 0 ? current.filter((i) => i.key !== key) : current.map((i) => (i.key === key ? { ...i, quantity: Math.min(MAX_QTY, quantity) } : i))));
  }, []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    ready,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotalMinor: items.reduce((n, i) => n + i.unitPriceMinor * i.quantity, 0),
    add,
    setQuantity,
    remove: (key) => setItems((current) => current.filter((i) => i.key !== key)),
    clear: () => setItems([]),
    open,
    setOpen,
  }), [items, ready, add, setQuantity, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
