"use client";
import { createContext, useContext, type ReactNode } from "react";
import { Toaster } from "@restaurant-os/ui";
import { CartProvider } from "@/lib/cart";
import { CartDrawer, StickyCartBar } from "./cart-ui";

interface StoreInfo {
  slug: string;
  name: string;
  currency: string;
  canOrder: boolean;
}

const StoreContext = createContext<StoreInfo | null>(null);

export function useStore(): StoreInfo {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside Providers");
  return ctx;
}

export function Providers({ store, children }: { store: StoreInfo; children: ReactNode }) {
  return (
    <StoreContext.Provider value={store}>
      <CartProvider storeSlug={store.slug}>
        {children}
        <CartDrawer />
        <StickyCartBar />
        <Toaster />
      </CartProvider>
    </StoreContext.Provider>
  );
}
