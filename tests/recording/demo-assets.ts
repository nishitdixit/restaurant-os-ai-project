// Draws the demo restaurant's logo, banner and dish illustrations (same flat "plate" style as lib/assets.ts — drawn
// locally, no third-party images) into apps/api/scripts/demo/assets. The PNGs are committed, so seeding never needs a
// browser; re-run this only after changing the dish list or art in apps/api/scripts/demo/catalog.ts:
//
//   pnpm --filter @restaurant-os/recording demo-assets
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PRODUCTS, type Art } from "../../apps/api/scripts/demo/catalog.ts";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/api/scripts/demo/assets");

function garnish(cx: number, cy: number, spread: number, color: string, count = 22) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180, r = spread * (0.2 + (i % 7) / 8);
    return `<circle cx="${cx + Math.cos(a) * r}" cy="${cy + Math.sin(a) * r}" r="${9 + (i % 3) * 4}" fill="${color}" opacity=".85"/>`;
  }).join("");
}

/** One dish, centred at (cx, cy) with radius r (an 800×800 dish uses 400, 400, 290). */
function dish(a: Art, cx: number, cy: number, r: number): string {
  const k = r / 290;
  switch (a.shape) {
    case "bowl":
      return `<circle cx="${cx}" cy="${cy + 20 * k}" r="${r}" fill="#00000014"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
        <circle cx="${cx}" cy="${cy}" r="${235 * k}" fill="#d6d3d1"/><circle cx="${cx}" cy="${cy}" r="${215 * k}" fill="${a.food}"/>
        <path d="M${cx - 120 * k} ${cy - 40 * k} q${60 * k} ${-40 * k} ${120 * k} 0 t${120 * k} 0" stroke="${a.garnish}" stroke-width="${14 * k}" fill="none" opacity=".7"/>
        ${garnish(cx, cy, 150 * k, a.garnish, 12)}`;
    case "bread":
      return `<circle cx="${cx}" cy="${cy + 20 * k}" r="${r}" fill="#00000014"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
        <ellipse cx="${cx}" cy="${cy}" rx="${235 * k}" ry="${170 * k}" fill="${a.food}" transform="rotate(-18 ${cx} ${cy})"/>
        ${Array.from({ length: 14 }, (_, i) => `<ellipse cx="${cx + Math.cos(i * 2.4) * 140 * k * ((i % 4) / 4 + 0.3)}" cy="${cy + Math.sin(i * 2.4) * 90 * k * ((i % 4) / 4 + 0.3)}" rx="${22 * k}" ry="${13 * k}" fill="${a.garnish}" opacity=".55"/>`).join("")}`;
    case "glass":
      return `<ellipse cx="${cx}" cy="${cy + r * 0.92}" rx="${r * 0.62}" ry="${r * 0.1}" fill="#00000018"/>
        <path d="M${cx - 150 * k} ${cy - 250 * k} L${cx + 150 * k} ${cy - 250 * k} L${cx + 115 * k} ${cy + 250 * k} L${cx - 115 * k} ${cy + 250 * k} Z" fill="#ffffff" opacity=".85"/>
        <path d="M${cx - 138 * k} ${cy - 170 * k} L${cx + 138 * k} ${cy - 170 * k} L${cx + 108 * k} ${cy + 238 * k} L${cx - 108 * k} ${cy + 238 * k} Z" fill="${a.food}"/>
        <ellipse cx="${cx}" cy="${cy - 170 * k}" rx="${138 * k}" ry="${22 * k}" fill="${a.garnish}" opacity=".9"/>
        <rect x="${cx + 40 * k}" y="${cy - 330 * k}" width="${16 * k}" height="${260 * k}" rx="${8 * k}" fill="${a.garnish}" transform="rotate(12 ${cx} ${cy})"/>`;
    case "dosa":
      return `<rect x="${cx - r}" y="${cy - r * 0.62}" width="${2 * r}" height="${1.24 * r}" rx="${40 * k}" fill="#00000014" transform="translate(0 ${18 * k})"/>
        <rect x="${cx - r}" y="${cy - r * 0.62}" width="${2 * r}" height="${1.24 * r}" rx="${40 * k}" fill="#ffffff"/>
        <path d="M${cx - 250 * k} ${cy + 40 * k} Q${cx} ${cy - 190 * k} ${cx + 250 * k} ${cy + 40 * k} Z" fill="${a.food}"/>
        <circle cx="${cx - 150 * k}" cy="${cy + 100 * k}" r="${42 * k}" fill="#f5f5f4"/><circle cx="${cx - 150 * k}" cy="${cy + 100 * k}" r="${32 * k}" fill="${a.garnish}"/>
        <circle cx="${cx}" cy="${cy + 110 * k}" r="${42 * k}" fill="#f5f5f4"/><circle cx="${cx}" cy="${cy + 110 * k}" r="${32 * k}" fill="#16a34a" opacity=".8"/>
        <circle cx="${cx + 150 * k}" cy="${cy + 100 * k}" r="${42 * k}" fill="#f5f5f4"/><circle cx="${cx + 150 * k}" cy="${cy + 100 * k}" r="${32 * k}" fill="#c2410c"/>`;
    case "thali": {
      const bowls = [[-150, -120, "#ea580c"], [0, -170, "#78350f"], [150, -120, "#15803d"], [-170, 40, "#fafaf9"], [170, 40, "#7c2d12"]] as const;
      return `<circle cx="${cx}" cy="${cy + 20 * k}" r="${r}" fill="#00000014"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#e7e5e4"/>
        <circle cx="${cx}" cy="${cy}" r="${r - 18 * k}" fill="#f5f5f4"/>
        ${bowls.map(([x, y, c]) => `<circle cx="${cx + x * k}" cy="${cy + y * k}" r="${62 * k}" fill="#d6d3d1"/><circle cx="${cx + x * k}" cy="${cy + y * k}" r="${52 * k}" fill="${c}"/>`).join("")}
        <ellipse cx="${cx}" cy="${cy + 120 * k}" rx="${120 * k}" ry="${70 * k}" fill="#fef3c7"/>${garnish(cx, cy + 120 * k, 60 * k, a.garnish, 8)}
        <ellipse cx="${cx}" cy="${cy + 10 * k}" rx="${80 * k}" ry="${45 * k}" fill="${a.food}" opacity=".9"/>`;
    }
    case "rice":
      return `<circle cx="${cx}" cy="${cy + 20 * k}" r="${r}" fill="#00000014"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
        <circle cx="${cx}" cy="${cy}" r="${250 * k}" fill="#f5f5f4"/><ellipse cx="${cx}" cy="${cy}" rx="${200 * k}" ry="${185 * k}" fill="${a.food}"/>
        ${Array.from({ length: 60 }, (_, i) => `<ellipse cx="${cx + Math.cos(i * 2.4) * 170 * k * ((i % 9) / 9)}" cy="${cy + Math.sin(i * 2.4) * 160 * k * ((i % 9) / 9)}" rx="${10 * k}" ry="${4 * k}" fill="#fffbeb" opacity=".8" transform="rotate(${i * 37} ${cx} ${cy})"/>`).join("")}
        ${garnish(cx, cy, 150 * k, a.garnish, 14)}`;
    case "bites":
      return `<circle cx="${cx}" cy="${cy + 20 * k}" r="${r}" fill="#00000014"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
        <circle cx="${cx}" cy="${cy}" r="${250 * k}" fill="#f5f5f4"/>
        ${Array.from({ length: 7 }, (_, i) => {
          const ang = (i / 7) * Math.PI * 2, rr = i === 6 ? 0 : 130 * k;
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          return `<circle cx="${x}" cy="${y + 6 * k}" r="${58 * k}" fill="#0000001a"/><circle cx="${x}" cy="${y}" r="${56 * k}" fill="${a.food}"/><circle cx="${x - 14 * k}" cy="${y - 14 * k}" r="${16 * k}" fill="${a.garnish}" opacity=".8"/>`;
        }).join("")}`;
    default:
      return `<circle cx="${cx}" cy="${cy + 20 * k}" r="${r}" fill="#00000014"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
        <circle cx="${cx}" cy="${cy}" r="${250 * k}" fill="#f5f5f4"/><ellipse cx="${cx}" cy="${cy}" rx="${200 * k}" ry="${185 * k}" fill="${a.food}"/>
        ${garnish(cx, cy, 150 * k, a.garnish)}`;
  }
}

const svg = (w: number, h: number, bg: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`;

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="120" fill="#8e1b1b"/>
  <circle cx="256" cy="222" r="118" fill="#e8a33d"/>
  ${Array.from({ length: 12 }, (_, i) => `<ellipse cx="256" cy="140" rx="16" ry="44" fill="#fbf6ee" opacity=".9" transform="rotate(${i * 30} 256 222)"/>`).join("")}
  <circle cx="256" cy="222" r="46" fill="#8e1b1b"/>
  <text x="256" y="455" font-family="Georgia, serif" font-size="70" font-weight="700" fill="#fbf6ee" text-anchor="middle">SSK</text>
</svg>`;

function by(slug: string) {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`Unknown dish ${slug}`);
  return p.art;
}

/** A wide "table spread" of several dishes, used for the homepage banner and the story section. */
function spread(w: number, h: number, bg: string, slugs: string[]) {
  const r = Math.min(h * 0.24, w * 0.135);
  const places = slugs.map((s, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    return dish(by(s), w * (0.2 + col * 0.3) + (row ? w * 0.15 : 0), h * (0.3 + row * 0.42), r * (row ? 0.85 : 1));
  });
  return svg(w, h, bg, `<rect x="0" y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="#00000010"/>${places.join("")}`);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (markup: string, w: number, h: number, file: string) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0">${markup}</body></html>`);
    await page.locator("svg").screenshot({ path: join(out, file) });
  };
  await shot(LOGO, 512, 512, "logo.png");
  await shot(spread(1600, 900, "#f5ebdd", ["veg-dum-biryani", "paneer-butter-masala", "butter-naan", "dal-makhani", "mango-lassi"]), 1600, 900, "hero.png");
  await shot(spread(1200, 900, "#fbf6ee", ["saffron-street-thali", "masala-dosa", "pav-bhaji", "gulab-jamun", "paneer-tikka"]), 1200, 900, "story.png");
  for (const p of PRODUCTS) await shot(svg(800, 800, p.art.bg, dish(p.art, 400, 400, 290)), 800, 800, `${p.slug}.png`);
  await browser.close();
  console.log(`Wrote ${PRODUCTS.length + 3} images to ${out}`);
}

await main();
