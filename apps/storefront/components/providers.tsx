"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { LanguageMode } from "@restaurant-os/domain";
import { Toaster } from "@restaurant-os/ui";
import { CartProvider } from "@/lib/cart";
import { CartDrawer, StickyCartBar } from "./cart-ui";
import { WhatsAppCartLinks } from "./whatsapp-order";

interface StoreInfo {
  slug: string;
  name: string;
  currency: string;
  canOrder: boolean;
  /** Restaurant copy language (experience site setting). */
  language: LanguageMode;
  /** Show dish badges (Bestseller, Signature…). */
  showBadges: boolean;
  /** WhatsApp number (wa.me form) when "Order on WhatsApp" buttons are on and a number is set; else null. */
  whatsapp: string | null;
  /** For the cart's delivery hint before an address is known. */
  delivery: { enabled: boolean; lowestFeeMinor: number | null; freeFromMinor: number | null; sameFreeThresholdEverywhere: boolean };
}

const StoreContext = createContext<StoreInfo | null>(null);

export function useStore(): StoreInfo {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside Providers");
  return ctx;
}

export function Providers({ store, mode = "light", children }: { store: StoreInfo; mode?: "light" | "dark"; children: ReactNode }) {
  return (
    <StoreContext.Provider value={store}>
      <CartProvider storeSlug={store.slug}>
        {children}
        <CartDrawer />
        <StickyCartBar />
        <WhatsAppCartLinks />
        <Toaster theme={mode} />
      </CartProvider>
    </StoreContext.Provider>
  );
}
