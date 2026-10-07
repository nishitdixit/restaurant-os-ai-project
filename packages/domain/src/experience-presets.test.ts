import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLayoutPreset, checkExperience, defaultExperience, defaultSection, normalizeExperience, presetById, presetExperience, PRESET_DESIGNS,
  presetsWithoutDesign, THEME_PRESETS, type StoreExperience,
} from "./index.ts";

const IMG = "11111111-1111-4111-8111-111111111111";
const DISH = "33333333-3333-4333-8333-333333333333";

test("every theme preset has a complete page design with gallery metadata", () => {
  assert.deepEqual(presetsWithoutDesign(), []);
  for (const p of THEME_PRESETS) {
    const d = PRESET_DESIGNS[p.id]!;
    assert.ok(d.archetype && d.personality, p.id);
    assert.ok(d.traits.length >= 3 && d.traits.length <= 5, `${p.id} has 3–5 traits`);
    assert.equal(d.sections[0]!.type, "hero", `${p.id} starts with a hero`);
    assert.ok(d.sections.length >= 5, `${p.id} composes at least five sections`);
  }
});

for (const p of THEME_PRESETS) {
  test(`preset ${p.id} produces a valid experience that survives normalisation and publishes`, () => {
    const e = presetExperience(p.id);
    assert.deepEqual(normalizeExperience(e), e);
    assert.equal(e.layoutPresetId, p.id);
    assert.deepEqual(e.sections.map((s) => s.type), PRESET_DESIGNS[p.id]!.sections.map((s) => s.type), "nothing dropped by section limits");
    assert.ok(e.sections.every((s) => s.enabled));
    assert.deepEqual(checkExperience(e, { altText: () => "x" }).errors, []);
  });
}

/** The dimensions a customer can see on screenshots. */
function signature(id: string) {
  const theme = presetById(id)!.theme;
  const e = presetExperience(id);
  const radius = (n: number) => (n >= 999 ? "pill" : n <= 2 ? "square" : n <= 10 ? "small" : "large");
  return {
    palette: `${theme.mode}:${theme.colors.primary}:${theme.colors.background}`,
    typography: `${theme.typography.headingFont}+${theme.typography.bodyFont}:${theme.typography.headingCase}`,
    shape: `${radius(theme.shape.button)}/${radius(theme.shape.card)}:${theme.borderWidth}`,
    depth: `${theme.shadow}:${theme.components.card}`,
    dishes: theme.components.productLayout,
    hero: `${e.sections[0]!.variant}`,
    composition: e.sections.map((s) => s.type).join(">"),
    navigation: `${e.site.header}:${theme.components.categoryNav}`,
    footer: e.site.footer,
    badges: theme.components.badge,
    motion: theme.motion,
  };
}

test("presets are meaningfully different, not recolours: every pair differs on at least six visible dimensions", () => {
  const ids = THEME_PRESETS.map((p) => p.id);
  const sigs = new Map(ids.map((id) => [id, signature(id)]));
  for (const [i, a] of ids.entries()) {
    for (const b of ids.slice(i + 1)) {
      const sa = sigs.get(a)!;
      const sb = sigs.get(b)!;
      const differing = (Object.keys(sa) as (keyof typeof sa)[]).filter((k) => sa[k] !== sb[k]);
      assert.ok(differing.length >= 6, `${a} vs ${b} differ only in ${differing.join(", ")}`);
    }
  }
  const compositions = new Set(ids.map((id) => sigs.get(id)!.composition));
  assert.equal(compositions.size, ids.length, "every preset has its own homepage composition");
});

test("applying a layout keeps the restaurant's content, language and business rules", () => {
  const current: StoreExperience = normalizeExperience({
    ...defaultExperience(),
    site: { ...defaultExperience().site, language: "bilingual" },
    menu: { ...defaultExperience().menu, vegFilter: false, bestseller: { enabled: true, windowDays: 60, minOrders: 9, limit: 4 } },
    seo: { title: "Best biryani in Indiranagar", description: "", shareImageId: null },
    sections: [
      { ...defaultSection("hero", "my-hero"), imageId: IMG, title: { en: "Spice Route", hi: "स्पाइस रूट" } },
      { ...defaultSection("story", "my-story"), title: { en: "Since 1987", hi: "" }, body: { en: "Three generations.", hi: "" }, imageId: IMG },
      { ...defaultSection("featured", "picks"), source: "picked", productIds: [DISH] },
      { ...defaultSection("gallery", "pics"), images: [{ imageId: IMG, caption: { en: "Dum", hi: "" } }] },
    ],
  });
  const noir = applyLayoutPreset(current, "noir");
  assert.equal(noir.layoutPresetId, "noir");
  assert.equal(noir.site.language, "bilingual");
  assert.equal(noir.site.header, "centered");
  assert.equal(noir.menu.vegFilter, false);
  assert.equal(noir.menu.bestseller.minOrders, 9);
  assert.equal(noir.seo.title, "Best biryani in Indiranagar");
  const hero = noir.sections.find((s) => s.type === "hero")!;
  assert.equal(hero.id, "my-hero");
  assert.equal(hero.variant, "full-bleed");
  assert.equal(hero.type === "hero" && hero.imageId, IMG, "the banner photo carries over");
  assert.deepEqual(hero.title, { en: "Spice Route", hi: "स्पाइस रूट" });
  const story = noir.sections.find((s) => s.type === "story")!;
  assert.equal(story.variant, "overlay");
  assert.equal(story.type === "story" && story.body.en, "Three generations.");
  assert.equal(story.title.en, "Since 1987", "the restaurant's own title wins over the preset's");
  const featured = noir.sections.find((s) => s.type === "featured")!;
  assert.equal(featured.type === "featured" && featured.source, "picked");
  assert.deepEqual(featured.type === "featured" && featured.productIds, [DISH]);
  assert.equal(featured.title.en, "Signatures", "an untitled section takes the preset's title");
  assert.equal(noir.sections.find((s) => s.type === "gallery")!.type === "gallery" && (noir.sections.find((s) => s.type === "gallery") as { images: unknown[] }).images.length, 1);

  // A preset without a gallery switches it off instead of deleting the photos.
  const rapid = applyLayoutPreset(current, "rapid");
  const gallery = rapid.sections.find((s) => s.type === "gallery")!;
  assert.equal(gallery.enabled, false);
  assert.equal(gallery.type === "gallery" && gallery.images.length, 1);
  // And switching back brings it straight back.
  const back = applyLayoutPreset(rapid, "noir");
  assert.equal(back.sections.find((s) => s.type === "gallery")!.enabled, true);
  assert.equal(back.sections.filter((s) => s.type === "gallery").length, 1);
});

test("applying the same layout twice changes nothing", () => {
  const once = applyLayoutPreset(defaultExperience(), "street-pop");
  assert.deepEqual(applyLayoutPreset(once, "street-pop"), once);
});

test("switching styles replaces the previous style's default titles but keeps the restaurant's own", () => {
  const streetPop = applyLayoutPreset(defaultExperience(), "street-pop");
  assert.equal(streetPop.sections.find((s) => s.type === "bestsellers")!.title.en, "Crowd favourites");
  const saffron = applyLayoutPreset(streetPop, "saffron-house");
  assert.equal(saffron.sections.find((s) => s.type === "bestsellers")!.title.en, "House favourites", "preset copy follows the new preset");
  const own = normalizeExperience({ ...streetPop, sections: streetPop.sections.map((s) => (s.type === "bestsellers" ? { ...s, title: { en: "Our top picks", hi: "" } } : s)) });
  assert.equal(applyLayoutPreset(own, "saffron-house").sections.find((s) => s.type === "bestsellers")!.title.en, "Our top picks", "the restaurant's own title is kept");
});
