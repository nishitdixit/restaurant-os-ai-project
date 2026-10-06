// One-click storefront themes (ui/THEME_PRESETS.md has the market research behind each one). Every preset is a
// complete, self-consistent design system — palette, type pairing, shape, depth and component variants chosen
// together — and every preset passes checkTheme() with no errors (enforced by domain tests).
import { classicTheme, normalizeTheme, readableTextOn, THEME_VERSION, type StoreTheme } from "./theme.ts";

export interface ThemePreset {
  id: string;
  name: string;
  /** Who it is designed for. */
  segment: string;
  /** One line shown under the preset in the gallery. */
  description: string;
  theme: StoreTheme;
}

type PresetTheme = Omit<StoreTheme, "version" | "presetId">;

function preset(id: string, name: string, segment: string, description: string, theme: PresetTheme): ThemePreset {
  return { id, name, segment, description, theme: { version: THEME_VERSION, presetId: id, ...theme } };
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "classic", name: "Classic", segment: "Any restaurant", description: "The original Restaurant OS look: clean, neutral and familiar.", theme: classicTheme() },

  preset("saffron-house", "Saffron House", "Biryani & North Indian", "Warm ivory, deep maroon and saffron with an elegant serif — rich and generous.", {
    mode: "light",
    colors: {
      background: "#fbf6ee", surface: "#ffffff", subtle: "#f5ebdd", border: "#ead9c2", text: "#2b1a12", muted: "#6b5446",
      primary: "#8e1b1b", primaryText: "#ffffff", accent: "#e8a33d", accentText: "#2b1a12", headerBackground: "#fffdf8", headerText: "#2b1a12",
    },
    typography: { headingFont: "playfair", bodyFont: "dm-sans", scale: "md", headingWeight: 700, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 10, card: 16, input: 10, chip: 999, image: 12 },
    borderWidth: 1, shadow: "soft", density: "comfortable",
    components: { button: "solid", card: "elevated", productLayout: "list", categoryNav: "pills", hero: "gradient", imageRatio: "square" },
  }),

  preset("rapid", "Rapid", "Quick service: burgers, rolls, pizza", "Bold red and yellow, heavy uppercase type and pill buttons — fast and high-energy.", {
    mode: "light",
    colors: {
      background: "#fff8ec", surface: "#ffffff", subtle: "#fff1cc", border: "#f2e2bd", text: "#1a1a1a", muted: "#575757",
      primary: "#d62300", primaryText: "#ffffff", accent: "#ffc72c", accentText: "#1a1a1a", headerBackground: "#d62300", headerText: "#ffffff",
    },
    typography: { headingFont: "rubik", bodyFont: "rubik", scale: "lg", headingWeight: 800, headingCase: "uppercase", buttonCase: "uppercase" },
    shape: { button: 999, card: 18, input: 12, chip: 999, image: 14 },
    borderWidth: 1, shadow: "strong", density: "comfortable",
    components: { button: "solid", card: "elevated", productLayout: "grid", categoryNav: "pills", hero: "solid", imageRatio: "landscape" },
  }),

  preset("cafe-linen", "Café Linen", "Cafés & brunch", "Linen whites, charcoal and latte with a soft serif and fine lines — calm and considered.", {
    mode: "light",
    colors: {
      background: "#f7f4ef", surface: "#ffffff", subtle: "#efeae2", border: "#dcd5ca", text: "#1f1d1a", muted: "#625c53",
      primary: "#2f3a2f", primaryText: "#ffffff", accent: "#c8a27a", accentText: "#1f1d1a", headerBackground: "#f7f4ef", headerText: "#1f1d1a",
    },
    typography: { headingFont: "fraunces", bodyFont: "work-sans", scale: "md", headingWeight: 500, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 6, card: 8, input: 6, chip: 6, image: 6 },
    borderWidth: 1, shadow: "none", density: "airy",
    components: { button: "outline", card: "bordered", productLayout: "list", categoryNav: "underline", hero: "minimal", imageRatio: "landscape" },
  }),

  preset("noir", "Noir", "Fine dining & premium", "Near-black, gold and an elegant serif with sharp corners — understated luxury.", {
    mode: "dark",
    colors: {
      background: "#0e0e10", surface: "#17171a", subtle: "#222226", border: "#2e2e33", text: "#f2efe8", muted: "#aaa59c",
      primary: "#c9a45c", primaryText: "#141414", accent: "#e8d9b5", accentText: "#141414", headerBackground: "#0e0e10", headerText: "#f2efe8",
    },
    typography: { headingFont: "cormorant", bodyFont: "manrope", scale: "md", headingWeight: 600, headingCase: "normal", buttonCase: "uppercase" },
    shape: { button: 0, card: 0, input: 0, chip: 0, image: 0 },
    borderWidth: 1, shadow: "none", density: "airy",
    components: { button: "outline", card: "bordered", productLayout: "grid", categoryNav: "underline", hero: "minimal", imageRatio: "wide" },
  }),

  preset("fresh-bowl", "Fresh Bowl", "Healthy food, salads & juices", "Leafy greens, citrus and soft rounded shapes — light, friendly and fresh.", {
    mode: "light",
    colors: {
      background: "#f4f8f1", surface: "#ffffff", subtle: "#e8f1e2", border: "#d3e3c8", text: "#16261a", muted: "#4c5d4b",
      primary: "#2e7d32", primaryText: "#ffffff", accent: "#f4a261", accentText: "#1f1a14", headerBackground: "#ffffff", headerText: "#16261a",
    },
    typography: { headingFont: "outfit", bodyFont: "nunito", scale: "md", headingWeight: 600, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 999, card: 20, input: 14, chip: 999, image: 18 },
    borderWidth: 1, shadow: "soft", density: "airy",
    components: { button: "solid", card: "elevated", productLayout: "grid", categoryNav: "pills", hero: "solid", imageRatio: "landscape" },
  }),

  preset("sugar-bloom", "Sugar Bloom", "Bakeries, cakes & desserts", "Blush pink, cream and a playful rounded display face — sweet without being childish.", {
    mode: "light",
    colors: {
      background: "#fff7f8", surface: "#ffffff", subtle: "#fdecef", border: "#f6d5dc", text: "#3a2230", muted: "#755664",
      primary: "#c2185b", primaryText: "#ffffff", accent: "#f7c9a9", accentText: "#3a2230", headerBackground: "#fff7f8", headerText: "#3a2230",
    },
    typography: { headingFont: "baloo", bodyFont: "nunito", scale: "md", headingWeight: 700, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 999, card: 24, input: 16, chip: 999, image: 22 },
    borderWidth: 1, shadow: "soft", density: "comfortable",
    components: { button: "solid", card: "bordered", productLayout: "grid", categoryNav: "pills", hero: "gradient", imageRatio: "square" },
  }),

  preset("banana-leaf", "Banana Leaf", "South Indian, tiffin & meals", "Leaf green, turmeric and rice-paper cream — traditional warmth, cleanly organised for long menus.", {
    mode: "light",
    colors: {
      background: "#faf7ec", surface: "#ffffff", subtle: "#f0f0dc", border: "#dcddbf", text: "#1e2a14", muted: "#555d44",
      primary: "#2f6b2f", primaryText: "#ffffff", accent: "#e3a21a", accentText: "#1e2a14", headerBackground: "#2f6b2f", headerText: "#ffffff",
    },
    typography: { headingFont: "lora", bodyFont: "poppins", scale: "md", headingWeight: 700, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 8, card: 12, input: 8, chip: 999, image: 10 },
    borderWidth: 1, shadow: "soft", density: "compact",
    components: { button: "solid", card: "bordered", productLayout: "list", categoryNav: "pills", hero: "solid", imageRatio: "square" },
  }),

  preset("street-pop", "Street Pop", "Street food, chaat & food trucks", "Sunny yellow, thick outlines and offset shadows — loud, fun and impossible to miss.", {
    mode: "light",
    colors: {
      background: "#fff3c4", surface: "#ffffff", subtle: "#ffe89a", border: "#111111", text: "#111111", muted: "#3d3d3d",
      primary: "#ff5a1f", primaryText: "#111111", accent: "#2ec4b6", accentText: "#111111", headerBackground: "#111111", headerText: "#fff3c4",
    },
    typography: { headingFont: "bricolage", bodyFont: "space-grotesk", scale: "md", headingWeight: 800, headingCase: "uppercase", buttonCase: "uppercase" },
    shape: { button: 8, card: 10, input: 8, chip: 8, image: 8 },
    borderWidth: 2, shadow: "offset", density: "comfortable",
    components: { button: "solid", card: "bordered", productLayout: "grid", categoryNav: "pills", hero: "solid", imageRatio: "square" },
  }),

  preset("cloud-kitchen-pro", "Cloud Kitchen Pro", "Delivery-first & multi-brand kitchens", "Neutral greys with a confident blue and a compact list — built for fast repeat ordering.", {
    mode: "light",
    colors: {
      background: "#f5f7fa", surface: "#ffffff", subtle: "#eef1f6", border: "#dde2ea", text: "#101828", muted: "#475467",
      primary: "#1d4ed8", primaryText: "#ffffff", accent: "#f79009", accentText: "#101828", headerBackground: "#ffffff", headerText: "#101828",
    },
    typography: { headingFont: "manrope", bodyFont: "inter", scale: "sm", headingWeight: 700, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 8, card: 10, input: 8, chip: 999, image: 8 },
    borderWidth: 1, shadow: "soft", density: "compact",
    components: { button: "solid", card: "bordered", productLayout: "list", categoryNav: "underline", hero: "minimal", imageRatio: "square" },
  }),

  preset("trattoria", "Trattoria", "Pizza, pasta & Italian", "Tomato red, basil and warm cream with slab-serif headings — a neighbourhood trattoria.", {
    mode: "light",
    colors: {
      background: "#fbf5ea", surface: "#fffdf8", subtle: "#f3e8d5", border: "#e5d6bc", text: "#2a1d14", muted: "#6a5646",
      primary: "#b3261e", primaryText: "#ffffff", accent: "#3e7b3e", accentText: "#ffffff", headerBackground: "#fbf5ea", headerText: "#2a1d14",
    },
    typography: { headingFont: "roboto-slab", bodyFont: "work-sans", scale: "md", headingWeight: 700, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 6, card: 10, input: 6, chip: 999, image: 10 },
    borderWidth: 1, shadow: "soft", density: "comfortable",
    components: { button: "solid", card: "bordered", productLayout: "grid", categoryNav: "pills", hero: "gradient", imageRatio: "landscape" },
  }),

  preset("chai-adda", "Chai Adda", "Tea, snacks & quick bites", "Kraft-paper browns with ginger orange and a characterful serif — cosy, like a corner chai stall.", {
    mode: "light",
    colors: {
      background: "#f3eadf", surface: "#fbf7f1", subtle: "#eadcc9", border: "#d7c4ab", text: "#2e1f14", muted: "#655041",
      primary: "#7a4a2a", primaryText: "#ffffff", accent: "#d9822b", accentText: "#2e1f14", headerBackground: "#2e1f14", headerText: "#f3eadf",
    },
    typography: { headingFont: "dm-serif", bodyFont: "dm-sans", scale: "md", headingWeight: 500, headingCase: "normal", buttonCase: "normal" },
    shape: { button: 12, card: 14, input: 10, chip: 999, image: 12 },
    borderWidth: 1, shadow: "soft", density: "comfortable",
    components: { button: "solid", card: "elevated", productLayout: "list", categoryNav: "pills", hero: "solid", imageRatio: "square" },
  }),

  preset("wok-ember", "Wok & Ember", "Pan-Asian, grills & late-night", "Charcoal, chilli red and amber with crisp geometry — dark, sharp and appetising.", {
    mode: "dark",
    colors: {
      background: "#121212", surface: "#1b1b1b", subtle: "#262626", border: "#333333", text: "#f5f5f5", muted: "#a6a6a6",
      primary: "#d32f2f", primaryText: "#ffffff", accent: "#ffb300", accentText: "#121212", headerBackground: "#121212", headerText: "#f5f5f5",
    },
    typography: { headingFont: "space-grotesk", bodyFont: "inter", scale: "md", headingWeight: 700, headingCase: "uppercase", buttonCase: "uppercase" },
    shape: { button: 4, card: 6, input: 4, chip: 4, image: 4 },
    borderWidth: 1, shadow: "none", density: "compact",
    components: { button: "solid", card: "flat", productLayout: "grid", categoryNav: "underline", hero: "solid", imageRatio: "wide" },
  }),
];

export function presetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

/**
 * The preset's theme, optionally keeping the restaurant's own brand colour. The colours that depend on the brand
 * colour (button text, a brand-coloured header) are recalculated so the result stays readable.
 */
export function applyPreset(presetToApply: ThemePreset, options: { keepBrandColor?: string | null } = {}): StoreTheme {
  const theme = structuredClone(presetToApply.theme);
  const brand = options.keepBrandColor;
  if (!brand || brand.toLowerCase() === theme.colors.primary) return normalizeTheme(theme);
  const headerWasBrand = theme.colors.headerBackground === theme.colors.primary;
  theme.colors.primary = brand.toLowerCase();
  theme.colors.primaryText = readableTextOn(theme.colors.primary);
  if (headerWasBrand) {
    theme.colors.headerBackground = theme.colors.primary;
    theme.colors.headerText = readableTextOn(theme.colors.primary);
  }
  if (presetToApply.id === "classic") {
    theme.colors.accent = theme.colors.primary;
    theme.colors.accentText = theme.colors.primaryText;
  }
  return normalizeTheme(theme);
}
