// Real food photos for the demo restaurant, from Unsplash (free Unsplash License: commercial use allowed, attribution
// not required, but credited in assets/CREDITS.md). Keys are dish slugs from catalog.ts, plus the homepage banner and
// story photo. Some dishes have no exact match on Unsplash; those use the closest vegetarian photo available.
//
//   pnpm --filter @restaurant-os/api demo:photos     re-download every photo into ./assets and rewrite CREDITS.md

export const PHOTO_IDS: Record<string, string> = {
  "paneer-tikka": "r5la-5p-iRs",
  "hara-bhara-kabab": "c29QtMoQUbs",
  "crispy-chilli-corn": "6kuyasiPtSs",
  "dahi-kebab": "H6Db_czsQeY",
  "tandoori-mushroom": "85gaOsWNsHo",
  "pani-puri": "ojbPCoo4I20",
  "dahi-papdi-chaat": "vG4rWkykIyk",
  "pav-bhaji": "QOvGLUTeOx0",
  "samosa-chaat": "_JvzS0ZX17Q",
  "veg-dum-biryani": "tPI0nbTSMJY",
  "paneer-tikka-biryani": "Ta2gPvMoV_0",
  "jeera-rice": "2wuoVk8wTzI",
  "curd-rice": "e2b0-q7gjgg",
  "paneer-butter-masala": "vgTntT8PmIM",
  "kadai-paneer": "0LvHrilR3aQ",
  "dal-makhani": "WR13Tw8gmsA",
  "dal-tadka": "O_MFjbig3hA",
  "chana-masala": "XCL-jHI4BTU",
  "malai-kofta": "-k7axr6JImg",
  "palak-paneer": "_bAW_ln_-Zs",
  "sarson-ka-saag": "EvxE8j6lfyY",
  "butter-naan": "WrE3ruckrwI",
  "garlic-naan": "ht8LS00RUWA",
  "tandoori-roti": "WxePxgrIJbQ",
  "lachha-paratha": "d2KrELzu9Qw",
  "masala-dosa": "5oF7d_hPJG4",
  "mysore-masala-dosa": "4Au4dHNjt7w",
  "ghee-podi-idli": "Vx8LnzUE2ZY",
  "medu-vada": "V9_D4fo23T0",
  "saffron-street-thali": "MIrFiTeKQAA",
  "rajma-chawal-bowl": "6mCyvI55hTY",
  "chole-kulche-combo": "Idh9dnG2v8w",
  "gulab-jamun": "bm1dJYcGJLw",
  rasmalai: "XH0XpbicHAo",
  "gajar-halwa": "Q5mPPGld5Zk",
  "mango-lassi": "KlVIYmGVRQ8",
  "masala-chaas": "0sz-sfC_ekc",
  "filter-coffee": "APTiSMjauco",
  "fresh-lime-soda": "mZT5bMpmDGQ",
  hero: "wClFKcjhNcI",
  story: "4pT9e68P_mU",
};

/** Download width in pixels (banners are wider). */
export const photoWidth = (key: string) => (key === "hero" || key === "story" ? 1600 : 1000);
