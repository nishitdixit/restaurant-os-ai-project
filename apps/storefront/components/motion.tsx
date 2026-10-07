"use client";
// Section reveals (theme motion "subtle" / "expressive"). Marks what is already on screen first, then enables the
// hidden state for the rest, so nothing visible ever flashes and pages without JS show everything. Sections added
// later (navigation, a live-preview refresh) are picked up too.
import { useEffect } from "react";

export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.rosMotion === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.inView = "";
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    const track = () => {
      const fold = window.innerHeight * 0.95;
      for (const el of document.querySelectorAll<HTMLElement>(".ros-reveal:not([data-in-view]):not([data-reveal-tracked])")) {
        el.dataset.revealTracked = "";
        if (el.getBoundingClientRect().top < fold) el.dataset.inView = "";
        else observer.observe(el);
      }
    };
    track();
    root.dataset.rosReveal = "";
    const mutations = new MutationObserver(() => track());
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); delete root.dataset.rosReveal; };
  }, []);
  return null;
}
