"use client";
// Live theme preview (merchant preview only). The admin's Appearance editor embeds the storefront in an iframe and
// posts the theme being edited; this applies it instantly, without saving anything. Messages are accepted only
// from the admin origin and are normalised by the domain theme engine before use.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { normalizeTheme, themeAttributes, themeVariables, type StoreTheme } from "@restaurant-os/domain";
import { ADMIN_ORIGIN } from "@/lib/theme";

function apply(theme: StoreTheme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVariables(theme))) root.style.setProperty(key, value);
  for (const [key, value] of Object.entries(themeAttributes(theme))) root.setAttribute(key, value);
}

export function ThemePreviewBridge() {
  const latest = useRef<StoreTheme | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== ADMIN_ORIGIN) return;
      const data = event.data as { type?: string; theme?: unknown } | null;
      if (data?.type !== "ros:theme") return;
      latest.current = normalizeTheme(data.theme);
      apply(latest.current);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "ros:theme-ready", path: window.location.pathname }, ADMIN_ORIGIN);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Navigating inside the preview keeps the edited theme and tells the editor which page is showing.
  useEffect(() => {
    if (window.parent === window) return;
    if (latest.current) apply(latest.current);
    window.parent.postMessage({ type: "ros:theme-path", path: pathname }, ADMIN_ORIGIN);
  }, [pathname]);

  return null;
}
