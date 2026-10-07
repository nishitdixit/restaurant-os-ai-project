// Automated accessibility checks (axe, WCAG 2.x A/AA rules) on the main customer pages, with a light and a dark
// complete preset. Serious and critical violations fail the test; the full report is attached.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import pg from "pg";
import { presetById, presetExperience } from "@restaurant-os/domain";
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

async function audit(page: Page, info: TestInfo, name: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // The Next.js development indicator is not part of the store.
    .exclude("nextjs-portal")
    .analyze();
  await info.attach(`axe-${name}`, { body: JSON.stringify(result.violations, null, 2), contentType: "application/json" });
  const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`), `${name} accessibility`).toEqual([]);
}

for (const presetId of ["classic", "noir"]) {
  test(`customer pages pass automated accessibility checks — ${presetId}`, async ({ page }, info) => {
    // Static rendering: scroll reveals would otherwise be sampled mid-fade.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await db.query(`UPDATE brands SET theme_draft = $1, experience_draft = $2 WHERE slug = 'pilot'`, [JSON.stringify(presetById(presetId)!.theme), JSON.stringify(presetExperience(presetId))]);
    await page.goto(previewPath("/"));
    await audit(page, info, `${presetId}-home`);
    await page.goto("/menu");
    await audit(page, info, `${presetId}-menu`);
    await page.locator("article.ros-product h3 a").first().click();
    await expect(page.locator("h1")).toBeVisible();
    await audit(page, info, `${presetId}-dish`);
    await page.goto("/checkout");
    await audit(page, info, `${presetId}-checkout`);
    await page.goto("/delivery-areas");
    await audit(page, info, `${presetId}-delivery-areas`);
  });
}
