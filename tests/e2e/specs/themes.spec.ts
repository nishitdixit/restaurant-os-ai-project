// Storefront themes (ADR-012): every preset renders the real storefront without layout breakage and with readable
// text, on phones and desktop. Each preset is applied as the pilot store's draft and viewed in merchant preview mode
// (no cache), and full-page screenshots are attached to the report for visual review.
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { contrastRatio, THEME_PRESETS } from "@restaurant-os/domain";

const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
let db: pg.Client;

test.beforeAll(async () => {
  db = new pg.Client({ connectionString: url });
  await db.connect();
});

test.afterAll(async () => {
  await db.query(`UPDATE brands SET theme_draft = NULL WHERE slug = 'pilot'`);
  await db.end();
});

/** Text colour and the effective background behind it, as #rrggbb (any CSS colour syntax, via a canvas pixel). */
async function colorsOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const toHex = (value: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a! < 128) return null;
      return `#${[r, g, b].map((c) => c!.toString(16).padStart(2, "0")).join("")}`;
    };
    let bgEl: Element | null = el;
    let bg: string | null = null;
    while (bgEl && !bg) { bg = toHex(getComputedStyle(bgEl).backgroundColor); bgEl = bgEl.parentElement; }
    return { fg: toHex(getComputedStyle(el).color), bg };
  });
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(1);
}

for (const preset of THEME_PRESETS) {
  test(`theme "${preset.name}" renders readable, unbroken pages`, async ({ page }, info) => {
    await db.query(`UPDATE brands SET theme_draft = $1 WHERE slug = 'pilot'`, [JSON.stringify(preset.theme)]);
    await page.goto("/?preview=1");
    await expect(page.locator("html")).toHaveAttribute("data-ros-cards", preset.theme.components.productLayout);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ros-bg").trim())).toBe(preset.theme.colors.background);

    // Home
    await expect(page.getByRole("link", { name: "Order direct" }).first()).toBeVisible();
    await noHorizontalOverflow(page);
    const header = await colorsOf(page, "header a[aria-label$='home'] span.ros-heading");
    expect(contrastRatio(header.fg!, header.bg!), "header text").toBeGreaterThanOrEqual(4.5);
    await info.attach(`${preset.id}-home`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    // Menu: dish cards, add buttons and the sticky category bar
    await page.goto("/menu");
    const card = page.locator("article.ros-product").first();
    await expect(card).toBeVisible();
    await noHorizontalOverflow(page);
    const dish = await colorsOf(page, "article.ros-product h3 a");
    expect(contrastRatio(dish.fg!, dish.bg!), "dish name").toBeGreaterThanOrEqual(4.5);
    const add = page.getByRole("button", { name: /^Add Butter Chicken/ });
    await expect(add).toBeVisible();
    const addColors = await colorsOf(page, "article.ros-product button");
    expect(contrastRatio(addColors.fg!, addColors.bg!), "add button label").toBeGreaterThanOrEqual(4.5);
    const activeChip = await colorsOf(page, "nav[aria-label='Menu categories'] a[aria-current='true']");
    expect(contrastRatio(activeChip.fg!, activeChip.bg!), "active category").toBeGreaterThanOrEqual(4.5);
    await info.attach(`${preset.id}-menu`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    // Cart + checkout with the themed primary button
    await add.click();
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await noHorizontalOverflow(page);
    const place = await colorsOf(page, "button:has-text('Place order')");
    expect(contrastRatio(place.fg!, place.bg!), "place order button").toBeGreaterThanOrEqual(4.5);
    await info.attach(`${preset.id}-checkout`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}
