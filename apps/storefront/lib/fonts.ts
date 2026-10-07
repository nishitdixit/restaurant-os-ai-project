// Storefront theme fonts (packages/domain THEME_FONTS), self-hosted by next/font. Not preloaded: the browser only
// downloads a font when the page actually uses it, so a theme costs just its own heading/body pair.
// Generated to match THEME_FONTS — keep the two lists in sync (a type check below enforces the ids).
import { Baloo_2, Bricolage_Grotesque, Cormorant_Garamond, DM_Sans, DM_Serif_Display, Fraunces, Inter, Lora, Manrope, Noto_Sans_Devanagari, Noto_Serif_Devanagari, Nunito, Outfit, Playfair_Display, Poppins, Roboto_Slab, Rubik, Space_Grotesk, Work_Sans } from "next/font/google";
import type { ThemeFontId } from "@restaurant-os/domain";

const ff_inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-inter" });
const ff_dm_sans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-dm-sans" });
const ff_manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-manrope" });
const ff_poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-poppins", weight: ["400", "500", "600", "700", "800"] });
const ff_nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-nunito" });
const ff_work_sans = Work_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-work-sans" });
const ff_rubik = Rubik({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-rubik" });
const ff_outfit = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-outfit" });
const ff_space_grotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-space-grotesk" });
const ff_playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-playfair" });
const ff_fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-fraunces" });
const ff_lora = Lora({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-lora" });
const ff_cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-cormorant", weight: ["500", "600", "700"] });
const ff_dm_serif = DM_Serif_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-dm-serif", weight: "400" });
const ff_roboto_slab = Roboto_Slab({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-roboto-slab" });
const ff_bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-bricolage" });
const ff_baloo = Baloo_2({ subsets: ["latin"], display: "swap", preload: false, variable: "--ff-baloo" });

// Hindi (Devanagari) text in bilingual stores: each font stack falls back to these (packages/domain fontStack).
// The Devanagari subset's unicode-range means they only download when Hindi characters are on the page.
const ff_deva_sans = Noto_Sans_Devanagari({ subsets: ["devanagari"], display: "swap", preload: false, variable: "--ff-deva-sans", weight: ["400", "500", "600", "700"] });
const ff_deva_serif = Noto_Serif_Devanagari({ subsets: ["devanagari"], display: "swap", preload: false, variable: "--ff-deva-serif", weight: ["400", "500", "600", "700"] });

/** className that defines `--ff-<id>` for each font. */
export const FONT_VARIABLE_CLASS: Record<ThemeFontId, string> = {
  "inter": ff_inter.variable,
  "dm-sans": ff_dm_sans.variable,
  "manrope": ff_manrope.variable,
  "poppins": ff_poppins.variable,
  "nunito": ff_nunito.variable,
  "work-sans": ff_work_sans.variable,
  "rubik": ff_rubik.variable,
  "outfit": ff_outfit.variable,
  "space-grotesk": ff_space_grotesk.variable,
  "playfair": ff_playfair.variable,
  "fraunces": ff_fraunces.variable,
  "lora": ff_lora.variable,
  "cormorant": ff_cormorant.variable,
  "dm-serif": ff_dm_serif.variable,
  "roboto-slab": ff_roboto_slab.variable,
  "bricolage": ff_bricolage.variable,
  "baloo": ff_baloo.variable,
};

export const ALL_FONT_CLASSES = [...Object.values(FONT_VARIABLE_CLASS), ff_deva_sans.variable, ff_deva_serif.variable].join(" ");
