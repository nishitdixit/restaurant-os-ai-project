// Storefront theme → <html> attributes (ADR-012). Values come from the domain theme engine, which only emits
// validated tokens, so they are safe to render into a style attribute.
import type { CSSProperties } from "react";
import { classicTheme, themeAttributes, themeVariables, type StoreTheme } from "@restaurant-os/domain";
import type { StoreConfig } from "@restaurant-os/types";

/** The admin origin allowed to drive the live theme preview (it embeds the storefront in an iframe). */
export const ADMIN_ORIGIN = (process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");

export function storeTheme(config: StoreConfig): StoreTheme {
  return config.theme ?? classicTheme(config.primaryColor);
}

export function themeHtmlProps(theme: StoreTheme): { style: CSSProperties } & Record<string, string | CSSProperties> {
  const { "color-scheme": colorScheme, ...vars } = themeVariables(theme);
  return { style: { ...vars, colorScheme } as CSSProperties, ...themeAttributes(theme) };
}
