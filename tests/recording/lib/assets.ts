// Generates the logo and dish photos used in the walkthrough (drawn locally, no third-party images).
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const DISHES: Record<string, { bg: string; food: string; garnish: string; label: string }> = {
  "chicken-biryani": { bg: "#fde68a", food: "#d97706", garnish: "#7c2d12", label: "Chicken Biryani" },
  "veg-biryani": { bg: "#fef3c7", food: "#f59e0b", garnish: "#15803d", label: "Veg Biryani" },
  "paneer-butter-masala": { bg: "#fed7aa", food: "#ea580c", garnish: "#fef3c7", label: "Paneer Butter Masala" },
  "dal-makhani": { bg: "#e7e5e4", food: "#78350f", garnish: "#fafaf9", label: "Dal Makhani" },
  "butter-naan": { bg: "#fef9c3", food: "#fbbf24", garnish: "#a16207", label: "Butter Naan" },
  "mango-lassi": { bg: "#ffedd5", food: "#fb923c", garnish: "#fde047", label: "Mango Lassi" },
};

function dishSvg(d: (typeof DISHES)[string]) {
  const dots = Array.from({ length: 22 }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180, r = 40 + (i % 7) * 18;
    return `<circle cx="${400 + Math.cos(a) * r}" cy="${400 + Math.sin(a) * r}" r="${9 + (i % 3) * 4}" fill="${d.garnish}" opacity=".85"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <rect width="800" height="800" fill="${d.bg}"/>
    <circle cx="400" cy="420" r="300" fill="#00000014"/>
    <circle cx="400" cy="400" r="290" fill="#ffffff"/>
    <circle cx="400" cy="400" r="250" fill="#f5f5f4"/>
    <ellipse cx="400" cy="400" rx="200" ry="185" fill="${d.food}"/>
    ${dots}
  </svg>`;
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="120" fill="#0f766e"/>
  <circle cx="256" cy="230" r="120" fill="#fef3c7"/>
  <path d="M150 300 Q256 420 362 300 Z" fill="#f59e0b"/>
  <text x="256" y="455" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#fef3c7" text-anchor="middle">SR</text>
</svg>`;

export async function generateAssets(dir: string): Promise<Record<string, string>> {
  mkdirSync(dir, { recursive: true });
  const files: Record<string, string> = { logo: join(dir, "logo.png") };
  for (const key of Object.keys(DISHES)) files[key] = join(dir, `${key}.png`);
  if (Object.values(files).every(existsSync)) return files;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<html><body style="margin:0">${LOGO}</body></html>`);
  await page.locator("svg").screenshot({ path: files.logo! });
  await page.setViewportSize({ width: 800, height: 800 });
  for (const [key, d] of Object.entries(DISHES)) {
    await page.setContent(`<html><body style="margin:0">${dishSvg(d)}</body></html>`);
    await page.locator("svg").screenshot({ path: files[key]! });
  }
  await browser.close();
  return files;
}
