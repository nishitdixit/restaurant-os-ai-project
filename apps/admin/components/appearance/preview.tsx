"use client";
// Live preview: the real storefront (merchant preview mode) in an iframe. The theme being edited is posted to it
// on every change, so owners see their actual pages update instantly — nothing is saved or published by this.
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Monitor, RotateCw, Smartphone } from "lucide-react";
import type { StoreTheme } from "@restaurant-os/domain";
import { buttonClass, cx } from "@restaurant-os/ui";
import { STOREFRONT_URL } from "@/lib/api";
import { Segmented } from "./controls";

const PAGES = [
  { path: "/", label: "Home" },
  { path: "/menu", label: "Menu" },
  { path: "/offers", label: "Offers" },
  { path: "/checkout", label: "Checkout" },
  { path: "/contact", label: "Contact" },
];
const DEVICES = { phone: { width: 390, height: 780 }, desktop: { width: 1280, height: 820 } } as const;
const storefrontOrigin = (() => { try { return new URL(STOREFRONT_URL).origin; } catch { return STOREFRONT_URL; } })();

export function LivePreview({ theme }: { theme: StoreTheme }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<keyof typeof DEVICES>("phone");
  const [page, setPage] = useState("/");
  const [src, setSrc] = useState(`${STOREFRONT_URL}/?preview=1`);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const latest = useRef(theme);
  latest.current = theme;

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "ros:theme", theme: latest.current }, storefrontOrigin);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== storefrontOrigin) return;
      const data = event.data as { type?: string; path?: string } | null;
      if (data?.type === "ros:theme-ready") { setReady(true); send(); }
      if (data?.type === "ros:theme-path" && data.path) { setPage(data.path); send(); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);

  useEffect(() => { send(); }, [theme, send]);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const size = DEVICES[device];
  const scale = width ? Math.min(1, (width - 2) / size.width) : 1;
  const go = (path: string) => { setPage(path); setReady(false); setSrc(`${STOREFRONT_URL}${path}${path.includes("?") ? "&" : "?"}preview=1`); };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="preview-page">Page</label>
        <select id="preview-page" value={PAGES.some((p) => p.path === page) ? page : ""} onChange={(e) => go(e.target.value)}
          className="h-9 rounded-[var(--ros-radius-md)] border border-border-strong bg-surface px-2.5 text-sm">
          {!PAGES.some((p) => p.path === page) && <option value="">{page}</option>}
          {PAGES.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
        </select>
        <div className="w-56">
          <Segmented label="Device" value={device} onChange={setDevice}
            options={[{ value: "phone", label: <span className="inline-flex items-center gap-1"><Smartphone className="size-3.5" aria-hidden />Phone</span> },
              { value: "desktop", label: <span className="inline-flex items-center gap-1"><Monitor className="size-3.5" aria-hidden />Desktop</span> }]} />
        </div>
        <button type="button" onClick={() => go(page)} className={buttonClass("ghost", "sm")} aria-label="Reload preview"><RotateCw className="size-4" aria-hidden /></button>
        <a href={`${STOREFRONT_URL}${page}?preview=1`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm", "ml-auto")}>
          Open<ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <div ref={box} className="flex justify-center rounded-[var(--ros-radius-lg)] border border-border bg-subtle p-3">
        <div className={cx("relative overflow-hidden bg-white shadow-[var(--ros-shadow-lg)]", device === "phone" ? "rounded-[28px] ring-8 ring-text/85" : "rounded-[var(--ros-radius-md)]")}
          style={{ width: size.width * scale, height: size.height * scale }}>
          <iframe ref={frame} src={src} title="Storefront preview" onLoad={send}
            style={{ width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: "top left" }} className="border-0" />
          {!ready && <div className="pointer-events-none absolute inset-x-0 top-0 h-1 animate-pulse bg-primary/60" aria-hidden />}
        </div>
      </div>
      <p className="text-xs text-muted">Preview shows your unsaved changes on your real store. Customers see them only after you publish.</p>
    </div>
  );
}
