import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPreset, checkTheme, classicTheme, contrastRatio, normalizeTheme, presetById, THEME_PRESETS, themeAttributes, themeVariables,
} from "./index.ts";

test("contrast ratio matches WCAG reference values", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff") * 10) / 10, 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  assert.ok(contrastRatio("#767676", "#ffffff") >= 4.5);
});

test("there are 12 presets plus Classic, with unique ids", () => {
  assert.equal(THEME_PRESETS.length, 13);
  assert.equal(new Set(THEME_PRESETS.map((p) => p.id)).size, 13);
});

for (const preset of THEME_PRESETS) {
  test(`preset ${preset.id} is valid and readable (no contrast errors)`, () => {
    assert.deepEqual(normalizeTheme(preset.theme), preset.theme, "preset must already be normalised");
    const { errors } = checkTheme(preset.theme);
    assert.deepEqual(errors.map((e) => `${e.key} ${e.ratio}`), []);
  });
}

test("presets are genuinely different from each other", () => {
  const signatures = THEME_PRESETS.map((p) => JSON.stringify([p.theme.colors.primary, p.theme.typography.headingFont, p.theme.components]));
  assert.equal(new Set(signatures).size, THEME_PRESETS.length);
});

test("classic theme reproduces the original look", () => {
  const vars = themeVariables(classicTheme());
  assert.equal(vars["--ros-bg"], "#f7f7f8");
  assert.equal(vars["--ros-radius-card"], "14px");
  assert.equal(vars["--ros-radius-button"], "10px");
  assert.equal(vars["--brand-primary"], "#b42318");
});

test("normalizeTheme drops invalid values and anything that could inject CSS", () => {
  const t = normalizeTheme({
    colors: { primary: "red;} body{display:none", text: "#ABCDEF" }, shape: { card: 500, button: -4, chip: 5000 },
    typography: { headingFont: "comic-sans" }, components: { hero: "<script>" }, extra: "x",
  });
  assert.equal(t.colors.primary, "#b42318");
  assert.equal(t.colors.text, "#abcdef");
  assert.equal(t.shape.card, 32);
  assert.equal(t.shape.button, 0);
  assert.equal(t.shape.chip, 999);
  assert.equal(t.typography.headingFont, "inter");
  assert.equal(t.components.hero, "gradient");
  assert.ok(!("extra" in t));
  for (const value of Object.values(themeVariables(t))) assert.doesNotMatch(value, /[;{}<>]/);
  for (const value of Object.values(themeAttributes(t))) assert.match(value, /^[a-z]+$/);
});

test("unreadable themes are reported with a fix that resolves them", () => {
  const t = normalizeTheme({ ...classicTheme(), colors: { ...classicTheme().colors, primary: "#ffe066", primaryText: "#ffffff", muted: "#cccccc" } });
  const { errors } = checkTheme(t);
  assert.ok(errors.some((e) => e.key === "primaryText-primary"));
  assert.ok(errors.some((e) => e.key === "muted-surface"));
  const fixed = structuredClone(t);
  for (const e of errors) if (e.fix) fixed.colors[e.fix.color] = e.fix.value;
  assert.deepEqual(checkTheme(fixed).errors, []);
});

test("a light brand colour falls back to the text colour for links and outline button labels", () => {
  const t = normalizeTheme({ ...classicTheme("#ffd400"), components: { ...classicTheme().components, button: "outline" } });
  const vars = themeVariables(t);
  assert.equal(vars["--ros-link"], t.colors.text);
  assert.equal(vars["--ros-btn-fg"], t.colors.text);
  assert.ok(!checkTheme(t).errors.some((e) => e.key === "button-label"));
  assert.ok(checkTheme(t).warnings.some((w) => w.key === "primary-surface"));
});

test("applying a preset can keep the brand colour and stays readable", () => {
  const rapid = presetById("rapid")!;
  const t = applyPreset(rapid, { keepBrandColor: "#0f766e" });
  assert.equal(t.colors.primary, "#0f766e");
  assert.equal(t.colors.headerBackground, "#0f766e");
  assert.equal(t.presetId, "rapid");
  assert.deepEqual(checkTheme(t).errors, []);
});
