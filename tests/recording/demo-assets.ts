// Draws the demo restaurant's logo (drawn locally, no third-party artwork) into apps/api/scripts/demo/assets/logo.png.
// The dish, banner and story photos there are real Unsplash photos (apps/api/scripts/demo/photos.ts). The PNG is
// committed, so seeding never needs a browser; re-run this only after changing the logo:
//
//   pnpm --filter @restaurant-os/recording demo-assets
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/api/scripts/demo/assets");

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="120" fill="#8e1b1b"/>
  <circle cx="256" cy="222" r="118" fill="#e8a33d"/>
  ${Array.from({ length: 12 }, (_, i) => `<ellipse cx="256" cy="140" rx="16" ry="44" fill="#fbf6ee" opacity=".9" transform="rotate(${i * 30} 256 222)"/>`).join("")}
  <circle cx="256" cy="222" r="46" fill="#8e1b1b"/>
  <text x="256" y="455" font-family="Georgia, serif" font-size="70" font-weight="700" fill="#fbf6ee" text-anchor="middle">SSK</text>
</svg>`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(`<html><body style="margin:0">${LOGO}</body></html>`);
await page.locator("svg").screenshot({ path: join(out, "logo.png") });
await browser.close();
console.log(`Wrote ${join(out, "logo.png")}`);
