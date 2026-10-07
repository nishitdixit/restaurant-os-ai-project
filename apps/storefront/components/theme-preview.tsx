"use client";
// Live preview (merchant preview only). The admin's Appearance editor embeds the storefront in an iframe and talks to
// it over postMessage, accepted only from the admin origin:
//   ros:theme   — the theme being edited; applied instantly as CSS variables, without saving anything.
//   ros:refresh — the draft layout/content was just saved; re-render the page from the server with it.
//   ros:focus   — scroll to a homepage section and outline it (the section selected in the builder).
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { normalizeTheme, themeAttributes, themeVariables, type StoreTheme } from "@restaurant-os/domain";
import { ADMIN_ORIGIN } from "@/lib/theme";

function apply(theme: StoreTheme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVariables(theme))) root.style.setProperty(key, value);
  for (const [key, value] of Object.entries(themeAttributes(theme))) root.setAttribute(key, value);
}

function focusSection(id: string | null) {
  for (const el of document.querySelectorAll("[data-preview-focus]")) el.removeAttribute("data-preview-focus");
  if (!id) return;
  const el = document.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.setAttribute("data-preview-focus", "");
  el.dataset.inView = "";
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ThemePreviewBridge() {
  const latest = useRef<StoreTheme | null>(null);
  const focused = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== ADMIN_ORIGIN) return;
      const data = event.data as { type?: string; theme?: unknown; sectionId?: unknown } | null;
      if (data?.type === "ros:theme") {
        latest.current = normalizeTheme(data.theme);
        apply(latest.current);
      } else if (data?.type === "ros:refresh") {
        router.refresh();
        // The server re-render brings the saved draft; keep showing the unsaved theme on top, and the selection.
        window.setTimeout(() => { if (latest.current) apply(latest.current); focusSection(focused.current); }, 700);
      } else if (data?.type === "ros:focus") {
        focused.current = typeof data.sectionId === "string" ? data.sectionId : null;
        focusSection(focused.current);
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "ros:theme-ready", path: window.location.pathname }, ADMIN_ORIGIN);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  // Navigating inside the preview keeps the edited theme and tells the editor which page is showing.
  useEffect(() => {
    if (window.parent === window) return;
    if (latest.current) apply(latest.current);
    window.parent.postMessage({ type: "ros:theme-path", path: pathname }, ADMIN_ORIGIN);
  }, [pathname]);

  return null;
}
