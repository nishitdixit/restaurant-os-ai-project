import test from "node:test";
import assert from "node:assert/strict";
import {
  checkExperience, classicTheme, contrastRatio, defaultExperience, defaultSection, deliveryFeeFor, displayBadges, experienceMediaIds,
  filterExperienceReferences, MAX_SECTIONS, normalizeBadges, normalizeExperience, pickText, rankBestsellers, SECTION_LIMITS, SECTION_TYPES,
  SECTION_VARIANTS, sectionToneVariables, THEME_PRESETS,
} from "./index.ts";

const IMG = "11111111-1111-4111-8111-111111111111";
const IMG2 = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";

test("the default experience is already normalised and valid", () => {
  const d = defaultExperience();
  assert.deepEqual(normalizeExperience(d), d);
  assert.equal(d.sections[0]!.type, "hero");
  assert.deepEqual(checkExperience(d, { altText: () => "" }).errors, []);
});

test("every section type has a complete default that survives normalisation", () => {
  for (const type of SECTION_TYPES) {
    const s = defaultSection(type, `${type}-x`);
    const n = normalizeExperience({ version: 1, sections: [s] }).sections[0]!;
    assert.deepEqual(n, s, type);
    assert.ok((SECTION_VARIANTS[type] as readonly string[]).includes(s.variant));
  }
});

test("normalisation drops unknown types, bad values and anything that could inject markup", () => {
  const e = normalizeExperience({
    sections: [
      { type: "marquee", id: "x" },
      { type: "hero", id: "Bad Id!", variant: "carousel", tone: "neon", title: { en: "  Hello\u0000  world  ", hi: 5 }, imageId: "not-a-uuid", overlay: "none", align: "justify",
        primaryCta: { target: "javascript:alert(1)", label: "Go" }, secondaryCta: { target: "category", categorySlug: "../etc" } },
      { type: "story", body: "Para one\r\n\r\n\r\n\r\nPara two", cta: { target: "whatsapp" } },
      { type: "reviews", rating: { value: 4.87, count: 1200, source: "google", url: "http://insecure.example", asOf: "2026-10" }, testimonials: [{ quote: "Lovely", author: "" }] },
    ],
    site: { language: "fr", header: "<b>" },
    menu: { bestseller: { minOrders: -5, limit: 500, windowDays: 3 } },
  });
  assert.equal(e.sections.length, 3);
  const hero = e.sections[0]!;
  assert.equal(hero.type, "hero");
  if (hero.type !== "hero") return;
  assert.equal(hero.id, "hero-2");
  assert.equal(hero.variant, "split");
  assert.equal(hero.tone, "default");
  assert.deepEqual(hero.title, { en: "Hello world", hi: "" });
  assert.equal(hero.imageId, null);
  assert.equal(hero.align, "left");
  assert.equal(hero.primaryCta.target, "menu");
  assert.equal(hero.secondaryCta?.target, "menu", "a category CTA without a valid category falls back to the menu");
  const story = e.sections[1]!;
  assert.equal(story.type === "story" && story.body.en, "Para one\n\nPara two");
  const reviews = e.sections[2]!;
  assert.equal(reviews.type === "reviews" && reviews.rating, null, "a rating without an https source is never kept");
  assert.equal(reviews.type === "reviews" && reviews.testimonials.length, 0, "a quote needs an author");
  assert.equal(e.site.language, "en");
  assert.equal(e.site.header, "standard");
  assert.equal(e.menu.bestseller.minOrders, 1);
  assert.equal(e.menu.bestseller.limit, 12);
  assert.equal(e.menu.bestseller.windowDays, 30);
});

test("text drawn on a photo always gets a readable overlay", () => {
  for (const variant of ["full-bleed", "centered"]) {
    const e = normalizeExperience({ sections: [{ type: "hero", variant, overlay: "none", imageId: IMG }] });
    assert.notEqual(e.sections[0]!.type === "hero" && e.sections[0]!.overlay, "none", variant);
  }
  const split = normalizeExperience({ sections: [{ type: "hero", variant: "split", overlay: "none", imageId: IMG }] });
  assert.equal(split.sections[0]!.type === "hero" && split.sections[0]!.overlay, "none", "text beside the photo needs no overlay");
});

test("per-type limits, total limit and unique ids are enforced in page order", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ type: i % 2 ? "story" : "hero", id: "same" }));
  const e = normalizeExperience({ sections: many });
  assert.equal(e.sections.filter((s) => s.type === "hero").length, SECTION_LIMITS.hero);
  assert.equal(e.sections.filter((s) => s.type === "story").length, SECTION_LIMITS.story);
  assert.equal(new Set(e.sections.map((s) => s.id)).size, e.sections.length);
  const lots = normalizeExperience({ sections: Array.from({ length: 40 }, (_, i) => ({ type: SECTION_TYPES[i % SECTION_TYPES.length], id: `s${i}` })) });
  assert.ok(lots.sections.length <= MAX_SECTIONS);
});

test("references to another restaurant's photos and dishes are dropped", () => {
  const e = normalizeExperience({
    sections: [
      { type: "hero", imageId: IMG }, { type: "gallery", images: [{ imageId: IMG }, { imageId: IMG2 }] },
      { type: "featured", source: "picked", productIds: [PRODUCT, "44444444-4444-4444-8444-444444444444"] },
    ],
    seo: { shareImageId: IMG2 },
  });
  assert.deepEqual(experienceMediaIds(e).sort(), [IMG, IMG2].sort());
  const f = filterExperienceReferences(e, { media: new Set([IMG]), products: new Set([PRODUCT]), categories: new Set() });
  assert.equal(f.sections[0]!.type === "hero" && f.sections[0]!.imageId, IMG);
  assert.deepEqual(f.sections[1]!.type === "gallery" && f.sections[1]!.images.map((i) => i.imageId), [IMG]);
  assert.deepEqual(f.sections[2]!.type === "featured" && f.sections[2]!.productIds, [PRODUCT]);
  assert.equal(f.seo.shareImageId, null);
});

test("publishing needs alt text for every homepage photo; empty sections only warn", () => {
  const e = normalizeExperience({ sections: [{ type: "hero", id: "hero", imageId: IMG }, { type: "gallery", id: "g", images: [] }] });
  const missingAlt = checkExperience(e, { altText: () => "" });
  assert.deepEqual(missingAlt.errors.map((i) => i.sectionId), ["hero"]);
  assert.ok(missingAlt.warnings.some((w) => w.sectionId === "g"));
  assert.deepEqual(checkExperience(e, { altText: () => "Biryani in a copper handi" }).errors, []);
  const disabled = normalizeExperience({ sections: [{ type: "hero", enabled: false, imageId: IMG }] });
  assert.deepEqual(checkExperience(disabled, { altText: () => "" }).errors, [], "hidden sections don't block publishing");
});

test("language modes pick the right text, falling back to English", () => {
  const t = { en: "Biryani", hi: "बिरयानी" };
  assert.deepEqual(pickText(t, "en"), { primary: "Biryani", secondary: null });
  assert.deepEqual(pickText(t, "hi"), { primary: "बिरयानी", secondary: null });
  assert.deepEqual(pickText(t, "bilingual"), { primary: "Biryani", secondary: "बिरयानी" });
  assert.deepEqual(pickText({ en: "Thali", hi: "" }, "hi"), { primary: "Thali", secondary: null });
  assert.deepEqual(pickText({ en: "", hi: "" }, "bilingual", "Menu"), { primary: "Menu", secondary: null });
});

test("section tones stay readable for every preset", () => {
  for (const preset of [{ id: "classic-red", theme: classicTheme() }, ...THEME_PRESETS]) {
    for (const tone of ["default", "subtle", "brand", "inverted"] as const) {
      const v = sectionToneVariables(preset.theme, tone);
      assert.ok(contrastRatio(v["--ros-section-fg"]!, v["--ros-section-bg"]!) >= 4.5, `${preset.id} ${tone} text`);
      assert.ok(contrastRatio(v["--ros-section-muted"]!, v["--ros-section-bg"]!) >= 4.5, `${preset.id} ${tone} secondary text`);
      assert.ok(contrastRatio(v["--ros-section-link"]!, v["--ros-section-bg"]!) >= 4.5, `${preset.id} ${tone} links`);
    }
  }
});

test("badges: at most three, one per kind, custom ones need a label; Bestseller is never stored", () => {
  const b = normalizeBadges([
    { kind: "new" }, { kind: "new" }, { kind: "bestseller" }, { kind: "custom", label: "" }, { kind: "custom", label: "  Royal   Feast " }, { kind: "signature", tone: "pink" }, { kind: "limited" },
  ]);
  assert.deepEqual(b.map((x) => x.kind), ["new", "custom", "signature"]);
  assert.equal(b[1]!.label, "Royal Feast");
  assert.equal(b[2]!.tone, "accent");
  assert.deepEqual(displayBadges(b, true).map((x) => x.label), ["Bestseller", "New", "Royal Feast", "Signature"]);
});

test("bestsellers are ranked by real sales and never guessed", () => {
  const rows = [
    { productId: "a", quantity: 40, orders: 20 }, { productId: "b", quantity: 90, orders: 4 }, { productId: "c", quantity: 40, orders: 30 }, { productId: "d", quantity: 10, orders: 6 },
  ];
  assert.deepEqual(rankBestsellers(rows, { minOrders: 5, limit: 2 }), ["c", "a"]);
  assert.deepEqual(rankBestsellers(rows, { minOrders: 100, limit: 5 }), []);
  assert.deepEqual(rankBestsellers([], { minOrders: 1, limit: 5 }), []);
});

test("free delivery applies once the item total reaches the area's threshold", () => {
  const zone = { feeMinor: 3000n, freeDeliveryMinimumMinor: 50000n };
  assert.equal(deliveryFeeFor(zone, 49999n), 3000n);
  assert.equal(deliveryFeeFor(zone, 50000n), 0n);
  assert.equal(deliveryFeeFor({ feeMinor: 3000n, freeDeliveryMinimumMinor: null }, 10_000_000n), 3000n);
  assert.equal(deliveryFeeFor({ feeMinor: 3000n }, 10_000_000n), 3000n);
});
