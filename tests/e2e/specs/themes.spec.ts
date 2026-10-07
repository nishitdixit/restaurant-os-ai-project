// Complete storefront presets (ADR-012 + ADR-013): every preset — theme tokens AND page composition — renders the
// real storefront without layout breakage and with readable text, on phones (360/390/430 px) and desktop. Each
// preset is applied as the pilot store's draft (look + layout, exactly as "Use this style" does) and viewed in signed
// merchant preview (no cache); full-page screenshots are attached to the report for visual review.
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { contrastRatio, presetExperience, THEME_PRESETS } from "@restaurant-os/domain";
import { previewPath } from "./preview";

const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
let db: pg.Client;

test.beforeAll(async () => {
  db = new pg.Client({ connectionString: url });
  await db.connect();
});

test.afterAll(async () => {
  await db.query(`UPDATE brands SET theme_draft = NULL, experience_draft = NULL WHERE slug = 'pilot'`);
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

async function noHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(1);
}

/** Phone widths the requirement names; desktop runs as its own project. */
async function atPhoneWidths(page: Page, label: string) {
  if ((page.viewportSize()?.width ?? 0) > 500) return noHorizontalOverflow(page, label);
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);
    await noHorizontalOverflow(page, `${label} at ${width}px`);
  }
}

for (const preset of THEME_PRESETS) {
  test(`preset "${preset.name}" gives a complete, readable, unbroken store`, async ({ page }, info) => {
    const experience = presetExperience(preset.id);
    await db.query(`UPDATE brands SET theme_draft = $1, experience_draft = $2 WHERE slug = 'pilot'`, [JSON.stringify(preset.theme), JSON.stringify(experience)]);
    await page.goto(previewPath("/"));
    await expect(page.locator("html")).toHaveAttribute("data-ros-cards", preset.theme.components.productLayout);
    await expect(page.locator("html")).toHaveAttribute("data-ros-badge", preset.theme.components.badge);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ros-bg").trim())).toBe(preset.theme.colors.background);

    // Page composition, not just tokens: header, footer, hero layout and the order of the sections that have content.
    await expect(page.locator("header[data-variant]")).toHaveAttribute("data-variant", experience.site.header);
    await expect(page.locator("footer[data-variant]")).toHaveAttribute("data-variant", experience.site.footer);
    const hero = page.locator("[data-section-type='hero']");
    await expect(hero).toHaveAttribute("data-variant", experience.sections[0]!.variant);
    const rendered = await page.locator("[data-section-type]").evaluateAll((els) => els.map((el) => `${el.getAttribute("data-section-type")}:${el.getAttribute("data-variant")}`));
    const designed = experience.sections.filter((s) => s.enabled).map((s) => `${s.type}:${s.variant}`);
    expect(rendered.length, "at least the hero and a few sections render").toBeGreaterThanOrEqual(3);
    expect(rendered.every((r) => designed.includes(r)), `rendered sections ${rendered.join(", ")} come from the preset`).toBe(true);
    expect(rendered.map((r) => designed.indexOf(r)), "sections follow the preset's order").toEqual([...rendered.map((r) => designed.indexOf(r))].sort((a, b) => a - b));

    await expect(page.getByRole("link", { name: /Order direct|Order now|View the menu/ }).first()).toBeVisible();
    const header = await colorsOf(page, "header a[aria-label$='home'] span.ros-heading");
    expect(contrastRatio(header.fg!, header.bg!), "header text").toBeGreaterThanOrEqual(4.5);
    const heading = page.locator("section[data-section-type]:not([data-section-type='hero']) h2").first();
    if (await heading.count()) {
      const c = await colorsOf(page, "section[data-section-type]:not([data-section-type='hero']) h2");
      expect(contrastRatio(c.fg!, c.bg!), "section heading on its background").toBeGreaterThanOrEqual(4.5);
    }
    await info.attach(`${preset.id}-home`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    await atPhoneWidths(page, "home");

    // Menu: dish cards, add buttons and the sticky category bar
    await page.goto("/menu");
    const card = page.locator("article.ros-product").first();
    await expect(card).toBeVisible();
    await atPhoneWidths(page, "menu");
    const dish = await colorsOf(page, "article.ros-product h3 a");
    expect(contrastRatio(dish.fg!, dish.bg!), "dish name").toBeGreaterThanOrEqual(4.5);
    const add = page.getByRole("button", { name: /^Add Butter Chicken/ });
    await expect(add).toBeVisible();
    const addColors = await colorsOf(page, "article.ros-product button.ros-add");
    expect(contrastRatio(addColors.fg!, addColors.bg!), "add button label").toBeGreaterThanOrEqual(4.5);
    const activeChip = await colorsOf(page, "nav[aria-label='Menu categories'] a[aria-current='true']");
    expect(contrastRatio(activeChip.fg!, activeChip.bg!), "active category").toBeGreaterThanOrEqual(4.5);
    await info.attach(`${preset.id}-menu`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    // Cart + checkout with the themed primary button
    await add.click();
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await atPhoneWidths(page, "checkout");
    const place = await colorsOf(page, "button:has-text('Place order')");
    expect(contrastRatio(place.fg!, place.bg!), "place order button").toBeGreaterThanOrEqual(4.5);
    await info.attach(`${preset.id}-checkout`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}

test("with reduced motion every section is visible straight away", async ({ page }) => {
  await db.query(`UPDATE brands SET theme_draft = $1, experience_draft = $2 WHERE slug = 'pilot'`, [JSON.stringify(THEME_PRESETS.find((p) => p.theme.motion === "expressive")!.theme), JSON.stringify(presetExperience("rapid"))]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(previewPath("/"));
  const hidden = await page.locator(".ros-reveal").evaluateAll((els) => els.filter((el) => Number(getComputedStyle(el).opacity) < 1).length);
  expect(hidden).toBe(0);
});
