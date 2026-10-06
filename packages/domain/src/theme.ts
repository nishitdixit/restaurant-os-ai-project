// Storefront theme engine (ADR-012, ui/DESIGN_SYSTEM.md "Storefront themes"). Pure and shared by the API
// (validation + publish guardrail), the storefront (CSS variables at render time) and the admin (editor + preview).
//
// A theme is a small set of design tokens and component variants, never free CSS: every value is a validated hex
// colour, a bounded number or an enum, so the generated CSS cannot be used for injection and every theme stays usable.

export const THEME_VERSION = 1 as const;

export type ThemeMode = "light" | "dark";
export type FontCategory = "sans" | "serif" | "slab" | "display";

export interface ThemeFont {
  id: string;
  label: string;
  category: FontCategory;
  /** Weights the font actually ships; heading weights snap to the nearest one (no synthetic bold). */
  weights: number[];
}

/** Curated Google fonts, self-hosted by the storefront (next/font) and loaded only when a theme uses them. */
export const THEME_FONTS = [
  { id: "inter", label: "Inter", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "dm-sans", label: "DM Sans", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "manrope", label: "Manrope", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "poppins", label: "Poppins", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "nunito", label: "Nunito", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "work-sans", label: "Work Sans", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "rubik", label: "Rubik", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "outfit", label: "Outfit", category: "sans", weights: [400, 500, 600, 700, 800] },
  { id: "space-grotesk", label: "Space Grotesk", category: "sans", weights: [400, 500, 600, 700] },
  { id: "playfair", label: "Playfair Display", category: "serif", weights: [400, 500, 600, 700, 800] },
  { id: "fraunces", label: "Fraunces", category: "serif", weights: [400, 500, 600, 700, 800] },
  { id: "lora", label: "Lora", category: "serif", weights: [400, 500, 600, 700] },
  { id: "cormorant", label: "Cormorant Garamond", category: "serif", weights: [500, 600, 700] },
  { id: "dm-serif", label: "DM Serif Display", category: "serif", weights: [400] },
  { id: "roboto-slab", label: "Roboto Slab", category: "slab", weights: [400, 500, 600, 700, 800] },
  { id: "bricolage", label: "Bricolage Grotesque", category: "display", weights: [400, 500, 600, 700, 800] },
  { id: "baloo", label: "Baloo 2", category: "display", weights: [400, 500, 600, 700, 800] },
] as const satisfies readonly ThemeFont[];

export type ThemeFontId = (typeof THEME_FONTS)[number]["id"];
export const THEME_FONT_IDS = THEME_FONTS.map((f) => f.id) as [ThemeFontId, ...ThemeFontId[]];

export const THEME_COLOR_KEYS = [
  "background", "surface", "subtle", "border", "text", "muted",
  "primary", "primaryText", "accent", "accentText", "headerBackground", "headerText",
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export const THEME_OPTIONS = {
  mode: ["light", "dark"],
  scale: ["sm", "md", "lg"],
  headingWeight: [500, 600, 700, 800],
  textCase: ["normal", "uppercase"],
  borderWidth: [1, 2],
  shadow: ["none", "soft", "strong", "offset"],
  density: ["compact", "comfortable", "airy"],
  button: ["solid", "soft", "outline"],
  card: ["bordered", "elevated", "flat"],
  productLayout: ["list", "grid", "compact"],
  categoryNav: ["pills", "underline"],
  hero: ["gradient", "solid", "minimal"],
  imageRatio: ["square", "landscape", "wide"],
} as const;

/** Corner radii in px; anything at or above PILL_RADIUS renders fully rounded. */
export const RADIUS_MAX = 32;
export const PILL_RADIUS = 999;

export interface StoreTheme {
  version: typeof THEME_VERSION;
  /** The preset this theme started from (null once heavily customised is fine; it is informational). */
  presetId: string | null;
  mode: ThemeMode;
  colors: ThemeColors;
  typography: {
    headingFont: ThemeFontId;
    bodyFont: ThemeFontId;
    scale: (typeof THEME_OPTIONS.scale)[number];
    headingWeight: (typeof THEME_OPTIONS.headingWeight)[number];
    headingCase: (typeof THEME_OPTIONS.textCase)[number];
    buttonCase: (typeof THEME_OPTIONS.textCase)[number];
  };
  shape: { button: number; card: number; input: number; chip: number; image: number };
  borderWidth: (typeof THEME_OPTIONS.borderWidth)[number];
  shadow: (typeof THEME_OPTIONS.shadow)[number];
  density: (typeof THEME_OPTIONS.density)[number];
  components: {
    button: (typeof THEME_OPTIONS.button)[number];
    card: (typeof THEME_OPTIONS.card)[number];
    productLayout: (typeof THEME_OPTIONS.productLayout)[number];
    categoryNav: (typeof THEME_OPTIONS.categoryNav)[number];
    hero: (typeof THEME_OPTIONS.hero)[number];
    imageRatio: (typeof THEME_OPTIONS.imageRatio)[number];
  };
}

// Colour maths ---------------------------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 2.x relative luminance. */
export function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Mixes `a` towards `b` by `amount` (0 = a, 1 = b) in sRGB. */
export function mixColors(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * amount) as [number, number, number]);
}

/** Near-black or white, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, "#111111") >= contrastRatio(background, "#ffffff") ? "#111111" : "#ffffff";
}

/**
 * The closest colour to `color` (same hue, shifted towards black or white) that reaches `ratio` against
 * `background` — used for one-click fixes in the editor.
 */
export function adjustForContrast(color: string, background: string, ratio: number): string {
  if (contrastRatio(color, background) >= ratio) return color;
  const target = luminance(background) > 0.4 ? "#000000" : "#ffffff";
  for (let step = 1; step <= 20; step++) {
    const candidate = mixColors(color, target, step / 20);
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return target;
}

// Defaults, normalisation ---------------------------------------------------------------------------------

/** The original Restaurant OS look; existing restaurants without a theme render exactly like this. */
export function classicTheme(primary = "#b42318"): StoreTheme {
  const p = isHexColor(primary) ? primary.toLowerCase() : "#b42318";
  return {
    version: THEME_VERSION,
    presetId: "classic",
    mode: "light",
    colors: {
      background: "#f7f7f8", surface: "#ffffff", subtle: "#f2f3f5", border: "#e3e5e8", text: "#15181d", muted: "#5b6370",
      primary: p, primaryText: readableTextOn(p), accent: p, accentText: readableTextOn(p), headerBackground: "#ffffff", headerText: "#15181d",
    },
    typography: { headingFont: "inter", bodyFont: "inter", scale: "md", headingWeight: 600, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 10, card: 14, input: 10, chip: PILL_RADIUS, image: 10 },
    borderWidth: 1,
    shadow: "soft",
    density: "comfortable",
    components: { button: "solid", card: "bordered", productLayout: "list", categoryNav: "pills", hero: "gradient", imageRatio: "square" },
  };
}

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function radius(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value >= PILL_RADIUS) return PILL_RADIUS;
  return Math.round(Math.min(RADIUS_MAX, Math.max(0, value)));
}

/**
 * Coerces any stored or submitted value into a valid theme: unknown keys are dropped, invalid values fall back to
 * `base` (the classic theme by default). Stored themes always pass through here before use.
 */
export function normalizeTheme(input: unknown, base: StoreTheme = classicTheme()): StoreTheme {
  const t = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof StoreTheme, unknown>>;
  const colors = (t.colors && typeof t.colors === "object" ? t.colors : {}) as Record<string, unknown>;
  const ty = (t.typography && typeof t.typography === "object" ? t.typography : {}) as Record<string, unknown>;
  const sh = (t.shape && typeof t.shape === "object" ? t.shape : {}) as Record<string, unknown>;
  const co = (t.components && typeof t.components === "object" ? t.components : {}) as Record<string, unknown>;
  const O = THEME_OPTIONS;
  return {
    version: THEME_VERSION,
    presetId: typeof t.presetId === "string" && /^[a-z0-9-]{1,40}$/.test(t.presetId) ? t.presetId : t.presetId === null ? null : base.presetId,
    mode: pick(t.mode, O.mode, base.mode),
    colors: Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, isHexColor(colors[k]) ? (colors[k] as string).toLowerCase() : base.colors[k]])) as ThemeColors,
    typography: {
      headingFont: pick(ty.headingFont, THEME_FONT_IDS, base.typography.headingFont),
      bodyFont: pick(ty.bodyFont, THEME_FONT_IDS, base.typography.bodyFont),
      scale: pick(ty.scale, O.scale, base.typography.scale),
      headingWeight: pick(ty.headingWeight, O.headingWeight, base.typography.headingWeight),
      headingCase: pick(ty.headingCase, O.textCase, base.typography.headingCase),
      buttonCase: pick(ty.buttonCase, O.textCase, base.typography.buttonCase),
    },
    shape: {
      button: radius(sh.button, base.shape.button), card: radius(sh.card, base.shape.card), input: radius(sh.input, base.shape.input),
      chip: radius(sh.chip, base.shape.chip), image: radius(sh.image, base.shape.image),
    },
    borderWidth: pick(t.borderWidth, O.borderWidth, base.borderWidth),
    shadow: pick(t.shadow, O.shadow, base.shadow),
    density: pick(t.density, O.density, base.density),
    components: {
      button: pick(co.button, O.button, base.components.button),
      card: pick(co.card, O.card, base.components.card),
      productLayout: pick(co.productLayout, O.productLayout, base.components.productLayout),
      categoryNav: pick(co.categoryNav, O.categoryNav, base.components.categoryNav),
      hero: pick(co.hero, O.hero, base.components.hero),
      imageRatio: pick(co.imageRatio, O.imageRatio, base.components.imageRatio),
    },
  };
}

// Guardrails ----------------------------------------------------------------------------------------------

export interface ThemeIssue {
  key: string;
  /** Plain-language explanation for the merchant. */
  message: string;
  ratio: number;
  required: number;
  /** One-click fix: set this colour to this value. */
  fix: { color: ThemeColorKey; value: string } | null;
}

export interface ThemeCheck {
  /** Block publishing (text that customers cannot read). */
  errors: ThemeIssue[];
  /** Shown in the editor; publishing is still allowed. */
  warnings: ThemeIssue[];
}

/** WCAG 2.2 AA: 4.5:1 for text, 3:1 for large text and essential UI. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

function issue(theme: StoreTheme, key: string, message: string, fg: ThemeColorKey, bg: ThemeColorKey, required: number): ThemeIssue | null {
  const ratio = contrastRatio(theme.colors[fg], theme.colors[bg]);
  if (ratio >= required) return null;
  return { key, message, ratio: Math.round(ratio * 100) / 100, required, fix: { color: fg, value: adjustForContrast(theme.colors[fg], theme.colors[bg], required) } };
}

/** Readability rules a theme must meet before it can be published (BUSINESS_RULES "Storefront themes"). */
export function checkTheme(theme: StoreTheme): ThemeCheck {
  const errors = [
    issue(theme, "text-background", "Main text is hard to read on the page background.", "text", "background", AA_TEXT),
    issue(theme, "text-surface", "Main text is hard to read on cards and panels.", "text", "surface", AA_TEXT),
    issue(theme, "muted-surface", "Secondary text (descriptions, hints) is hard to read on cards.", "muted", "surface", AA_TEXT),
    issue(theme, "primaryText-primary", "Button text is hard to read on the brand colour.", "primaryText", "primary", AA_TEXT),
    issue(theme, "accentText-accent", "Text on the accent colour is hard to read.", "accentText", "accent", AA_TEXT),
    issue(theme, "headerText-header", "Header text is hard to read on the header background.", "headerText", "headerBackground", AA_TEXT),
  ].filter((i): i is ThemeIssue => i !== null);
  if (theme.components.button !== "solid") {
    const fg = buttonForeground(theme);
    const ratio = contrastRatio(fg, buttonBackground(theme));
    if (ratio < AA_TEXT) {
      errors.push({ key: "button-label", message: "Main button labels are hard to read with this button style. Use a darker brand colour or the solid style.",
        ratio: Math.round(ratio * 100) / 100, required: AA_TEXT, fix: { color: "primary", value: adjustForContrast(theme.colors.primary, theme.colors.surface, AA_TEXT) } });
    }
  }
  const warnings = [
    issue(theme, "muted-background", "Secondary text is a little faint on the page background.", "muted", "background", AA_TEXT),
    issue(theme, "primary-surface", "The brand colour is faint against cards, so outlines and highlights are hard to see.", "primary", "surface", AA_UI),
    issue(theme, "text-subtle", "Text on light fills (closed-store notices, chips) is a little faint.", "text", "subtle", AA_TEXT),
  ].filter((i): i is ThemeIssue => i !== null);
  return { errors, warnings };
}

// Derived values and CSS output ----------------------------------------------------------------------------

/** Colour for links and primary-coloured text: the brand colour when it is readable, otherwise the text colour. */
export function linkColor(theme: StoreTheme): string {
  const c = theme.colors;
  return contrastRatio(c.primary, c.surface) >= AA_TEXT && contrastRatio(c.primary, c.background) >= AA_TEXT ? c.primary : c.text;
}

function primarySoft(theme: StoreTheme): string {
  return mixColors(theme.colors.surface, theme.colors.primary, theme.mode === "dark" ? 0.2 : 0.12);
}

function buttonBackground(theme: StoreTheme): string {
  return theme.components.button === "solid" ? theme.colors.primary : theme.components.button === "soft" ? primarySoft(theme) : theme.colors.surface;
}

function buttonForeground(theme: StoreTheme): string {
  if (theme.components.button === "solid") return theme.colors.primaryText;
  const bg = buttonBackground(theme);
  return contrastRatio(theme.colors.primary, bg) >= AA_TEXT ? theme.colors.primary : theme.colors.text;
}

const FALLBACK_STACK: Record<FontCategory, string> = {
  sans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`,
  serif: `ui-serif, Georgia, "Times New Roman", serif`,
  slab: `"Roboto Slab", ui-serif, Georgia, serif`,
  display: `ui-sans-serif, system-ui, sans-serif`,
};

export function themeFont(id: ThemeFontId): ThemeFont {
  return THEME_FONTS.find((f) => f.id === id) ?? THEME_FONTS[0];
}

/** CSS font-family value; the app defines `--ff-<id>` for each self-hosted font. */
export function fontStack(id: ThemeFontId): string {
  return `var(--ff-${id}), ${FALLBACK_STACK[themeFont(id).category]}`;
}

function nearestWeight(font: ThemeFont, weight: number): number {
  return font.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), font.weights[0]!);
}

const px = (n: number) => (n >= PILL_RADIUS ? "9999px" : `${n}px`);

const STATUS = {
  light: { success: "#067647", warning: "#b54708", danger: "#b42318", info: "#175cd3" },
  dark: { success: "#47cd89", warning: "#fdb022", danger: "#f97066", info: "#53b1fd" },
} as const;

/**
 * Every CSS custom property the storefront needs for this theme (names match packages/ui/src/styles.css).
 * Values come only from validated tokens, so the output is safe to put in a style attribute.
 */
export function themeVariables(input: StoreTheme): Record<string, string> {
  const theme = normalizeTheme(input);
  const c = theme.colors;
  const dark = theme.mode === "dark";
  const status = STATUS[theme.mode];
  const card = theme.shape.card;
  const shadowInk = dark ? "0 0 0" : "16 24 40";
  const shadows: Record<StoreTheme["shadow"], [string, string, string]> = {
    none: ["none", "none", "none"],
    soft: [`0 1px 2px rgb(${shadowInk} / ${dark ? 0.4 : 0.06})`, `0 4px 12px rgb(${shadowInk} / ${dark ? 0.45 : 0.08})`, `0 16px 40px rgb(${shadowInk} / ${dark ? 0.55 : 0.14})`],
    strong: [`0 2px 6px rgb(${shadowInk} / ${dark ? 0.5 : 0.1})`, `0 10px 24px rgb(${shadowInk} / ${dark ? 0.55 : 0.14})`, `0 24px 56px rgb(${shadowInk} / ${dark ? 0.65 : 0.22})`],
    offset: [`2px 2px 0 ${c.text}`, `4px 4px 0 ${c.text}`, `6px 6px 0 ${c.text}`],
  };
  const [sm, md, lg] = shadows[theme.shadow];
  const bw = `${theme.borderWidth}px`;
  const borderStrong = mixColors(c.border, c.text, 0.25);
  const offset = theme.shadow === "offset";
  const cardStyle = theme.components.card;
  const heading = themeFont(theme.typography.headingFont);
  const btnBorder = theme.components.button === "outline" ? c.primary : offset ? c.text : "transparent";
  return {
    "color-scheme": dark ? "dark" : "light",
    "--ros-root-font-size": { sm: "93.75%", md: "100%", lg: "106.25%" }[theme.typography.scale],
    "--spacing": { compact: "0.23rem", comfortable: "0.25rem", airy: "0.27rem" }[theme.density],
    "--brand-primary": c.primary,
    "--brand-primary-contrast": c.primaryText,
    "--ros-bg": c.background,
    "--ros-surface": c.surface,
    "--ros-subtle": c.subtle,
    "--ros-border": c.border,
    "--ros-border-strong": offset ? c.text : borderStrong,
    "--ros-text": c.text,
    "--ros-muted": c.muted,
    "--ros-faint": mixColors(c.muted, c.surface, 0.3),
    "--ros-primary-soft": primarySoft(theme),
    "--ros-link": linkColor(theme),
    "--ros-accent": c.accent,
    "--ros-accent-contrast": c.accentText,
    "--ros-header-bg": c.headerBackground,
    "--ros-header-fg": c.headerText,
    "--ros-header-muted": mixColors(c.headerText, c.headerBackground, 0.3),
    "--ros-header-border": offset ? c.text : mixColors(c.headerBackground, c.headerText, 0.12),
    "--ros-header-chip": mixColors(c.headerBackground, c.headerText, 0.08),
    "--ros-success": status.success,
    "--ros-warning": status.warning,
    "--ros-danger": status.danger,
    "--ros-info": status.info,
    "--ros-success-soft": mixColors(c.surface, status.success, dark ? 0.16 : 0.08),
    "--ros-warning-soft": mixColors(c.surface, status.warning, dark ? 0.16 : 0.08),
    "--ros-danger-soft": mixColors(c.surface, status.danger, dark ? 0.16 : 0.07),
    "--ros-info-soft": mixColors(c.surface, status.info, dark ? 0.16 : 0.07),
    "--ros-neutral-soft": c.subtle,
    "--ros-radius-sm": px(Math.round(card * 0.45)),
    "--ros-radius-md": px(Math.round(card * 0.7)),
    "--ros-radius-lg": px(card),
    "--ros-radius-xl": px(Math.round(card * 1.4)),
    "--ros-radius-button": px(theme.shape.button),
    "--ros-radius-card": px(card),
    "--ros-radius-input": px(theme.shape.input),
    "--ros-radius-chip": px(theme.shape.chip),
    "--ros-radius-image": px(theme.shape.image),
    "--ros-shadow-sm": sm,
    "--ros-shadow-md": md,
    "--ros-shadow-lg": lg,
    "--ros-border-width": bw,
    "--ros-card-bg": cardStyle === "flat" ? c.subtle : c.surface,
    "--ros-card-border-width": cardStyle === "bordered" || offset ? bw : "0px",
    "--ros-card-shadow": cardStyle === "elevated" ? (theme.shadow === "none" ? shadows.soft[1] : md) : cardStyle === "bordered" && theme.shadow !== "none" ? sm : "none",
    "--ros-btn-bg": buttonBackground(theme),
    "--ros-btn-fg": buttonForeground(theme),
    "--ros-btn-border": btnBorder,
    "--ros-btn-border-width": btnBorder === "transparent" ? "0px" : bw,
    "--ros-btn-shadow": theme.components.button === "solid" ? sm : offset ? sm : "none",
    "--ros-control-border-width": bw,
    "--ros-button-case": theme.typography.buttonCase === "uppercase" ? "uppercase" : "none",
    "--ros-button-tracking": theme.typography.buttonCase === "uppercase" ? "0.04em" : "normal",
    "--ros-font-body": fontStack(theme.typography.bodyFont),
    "--ros-font-heading": fontStack(theme.typography.headingFont),
    "--ros-heading-weight": String(nearestWeight(heading, theme.typography.headingWeight)),
    "--ros-heading-case": theme.typography.headingCase === "uppercase" ? "uppercase" : "none",
    "--ros-heading-tracking": theme.typography.headingCase === "uppercase" ? "0.03em" : heading.category === "serif" ? "0" : "-0.01em",
    "--ros-image-ratio": { square: "1 / 1", landscape: "4 / 3", wide: "16 / 9" }[theme.components.imageRatio],
    "--ros-hero-from": c.primary,
    "--ros-hero-to": mixColors(c.primary, "#000000", 0.3),
  };
}

/** Structural variants, exposed as data attributes on <html> (see the storefront's custom Tailwind variants). */
export function themeAttributes(input: StoreTheme): Record<string, string> {
  const theme = normalizeTheme(input);
  return {
    "data-ros-mode": theme.mode,
    "data-ros-cards": theme.components.productLayout,
    "data-ros-nav": theme.components.categoryNav,
    "data-ros-hero": theme.components.hero,
    "data-ros-shadow": theme.shadow,
  };
}

/** Fonts a theme uses (the storefront loads only these). */
export function themeFonts(theme: StoreTheme): ThemeFontId[] {
  return [...new Set([theme.typography.headingFont, theme.typography.bodyFont])];
}
