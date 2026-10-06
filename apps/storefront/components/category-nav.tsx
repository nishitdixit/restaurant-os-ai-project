"use client";
// Sticky category chips that follow the section in view.
import { useEffect, useRef, useState } from "react";
import { cx } from "@restaurant-os/ui";

export function CategoryNav({ categories, className }: { categories: { slug: string; name: string }[]; className?: string }) {
  const [active, setActive] = useState(categories[0]?.slug ?? "");
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pinnedUntil = useRef(0);
  // Active section = the last one whose heading has passed under the chip bar. Measured from the bar's real
  // position, so it is right whatever the header height (it has a second row on phones).
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < pinnedUntil.current || !navRef.current) return;
      const line = navRef.current.getBoundingClientRect().bottom + 24;
      let current = categories[0]?.slug ?? "";
      for (const c of categories) {
        const el = document.getElementById(`cat-${c.slug}`);
        if (el && el.getBoundingClientRect().top <= line) current = c.slug;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [categories]);
  // Keep the active chip centred by scrolling only the chip row horizontally. (scrollIntoView would also scroll
  // the page vertically to the sticky bar's original position, pulling the customer back up the menu.)
  useEffect(() => {
    const chip = document.getElementById(`chip-${active}`);
    const row = listRef.current;
    if (!chip || !row) return;
    row.scrollTo({ left: chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);
  return (
    <nav ref={navRef} aria-label="Menu categories" className={cx("sticky top-[105px] z-20 -mx-4 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur md:top-16", className)}>
      <ul ref={listRef} className="relative flex gap-2 overflow-x-auto">
        {categories.map((c) => (
          <li key={c.slug}>
            {/* A tapped chip stays active even when its section is too near the end of the page to reach the top. */}
            <a id={`chip-${c.slug}`} href={`#cat-${c.slug}`} aria-current={active === c.slug ? "true" : undefined}
              onClick={() => { pinnedUntil.current = Date.now() + 1000; setActive(c.slug); }}
              className={cx("inline-flex h-9 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
                active === c.slug ? "bg-primary text-primary-contrast" : "bg-surface text-text ring-1 ring-border hover:bg-subtle")}>
              {c.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
