// "Order on WhatsApp" (ADR-014): the prefilled message lists exactly what the customer picked — from a dish, that
// dish with its quantity and options; from the cart, checkout or the restaurant's general WhatsApp links, the whole
// cart. wa.me is intercepted, so the test reads the message without leaving the store.
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { defaultExperience } from "@restaurant-os/domain";
import { previewPath } from "./preview";

const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

test.beforeEach(async ({ page, context }) => {
  await context.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\/.*/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp</title>" }));
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
});

/** Clicks a WhatsApp link and returns [number, message] from the wa.me URL it opened. */
async function whatsappMessage(page: Page, click: () => Promise<void>) {
  const popup = page.waitForEvent("popup");
  await click();
  const opened = await popup;
  const u = new URL(opened.url());
  await opened.close();
  return [u.pathname.replace("/", ""), u.searchParams.get("text") ?? ""] as const;
}

async function addBiryaniFamilyWithRaita(page: Page) {
  await page.goto("/menu");
  const card = page.locator("article").filter({ has: page.getByRole("link", { name: "Chicken Dum Biryani", exact: true }) });
  await card.getByRole("button", { name: /Add Chicken Dum Biryani/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Family pack (serves 3)").check();
  await sheet.getByLabel("Extra raita").check();
  await sheet.getByRole("button", { name: /^Add · / }).click();
  await expect(page.getByText("Chicken Dum Biryani added")).toBeVisible();
}

async function addButterChicken(page: Page) {
  const card = page.locator("article").filter({ has: page.getByRole("link", { name: "Butter Chicken", exact: true }) });
  await card.getByRole("button", { name: /^Add Butter Chicken/ }).click();
  await expect(page.getByText("Butter Chicken added")).toBeVisible();
}

test("from a dish page: that dish with its quantity, portion and add-ons, and a link back", async ({ page }) => {
  await page.goto("/menu/chicken-dum-biryani");
  await page.getByLabel("Family pack (serves 3)").check();
  await page.getByLabel("Mirchi ka salan").check();
  await page.getByRole("button", { name: "Increase Chicken Dum Biryani" }).first().click();
  const [number, text] = await whatsappMessage(page, () => page.getByTestId("whatsapp-order").click());
  expect(number).toBe("919800000000");
  expect(text).toContain("I'd like to order:");
  expect(text).toMatch(/1\. 2 × Chicken Dum Biryani — ₹1,578/);
  expect(text).toContain("• Portion: Family pack (serves 3) (+₹420)");
  expect(text).toContain("• Add-ons: Mirchi ka salan (+₹40)");
  expect(text).toMatch(/\/menu\/chicken-dum-biryani/);
});

test("from the option sheet: the dish being customised, not the cart", async ({ page }) => {
  await page.goto("/menu");
  await addButterChicken(page);
  const card = page.locator("article").filter({ has: page.getByRole("link", { name: "Chicken Dum Biryani", exact: true }) });
  await card.getByRole("button", { name: /Add Chicken Dum Biryani/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Boiled egg").check();
  const [, text] = await whatsappMessage(page, () => sheet.getByRole("link", { name: "Or order this on WhatsApp" }).click());
  expect(text).toMatch(/1\. 1 × Chicken Dum Biryani — ₹354\n {3}• Portion: Regular\n {3}• Add-ons: Boiled egg \(\+₹25\)/);
  expect(text).not.toContain("Butter Chicken");
});

test("from the cart: every line with its options and the items total", async ({ page }) => {
  await addBiryaniFamilyWithRaita(page);
  await addButterChicken(page);
  await page.getByRole("button", { name: /Open cart/ }).first().click();
  const drawer = page.getByRole("dialog");
  const [, text] = await whatsappMessage(page, () => drawer.getByRole("link", { name: "Or send this order on WhatsApp" }).click());
  expect(text).toContain("1. 1 × Chicken Dum Biryani — ₹779\n   • Portion: Family pack (serves 3) (+₹420)\n   • Add-ons: Extra raita (+₹30)");
  expect(text).toContain("2. 1 × Butter Chicken — ₹319");
  expect(text).toContain("Items total: ₹1,098");
  expect(text).toContain("Delivery fee & offers to be confirmed by you.");
});

test("from checkout: the cart plus delivery details and the quoted total", async ({ page }) => {
  await addBiryaniFamilyWithRaita(page);
  await page.goto("/checkout");
  await page.getByLabel("Name").fill("Asha");
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByLabel("House / flat, building, street").fill("12, 1st Main");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByLabel("Pincode").fill("560038");
  await expect(page.getByText(/Delivers in 30–45 min/)).toBeVisible();
  const [, text] = await whatsappMessage(page, () => page.getByRole("link", { name: "Or send this order on WhatsApp" }).click());
  expect(text).toContain("1. 1 × Chicken Dum Biryani — ₹779");
  expect(text).toContain("Delivery fee: ₹30");
  expect(text).toContain("Total: ₹809");
  expect(text).toContain("Delivery to: 12, 1st Main, Bengaluru, 560038");
  expect(text).toContain("Name: Asha");
});

test("the restaurant's general WhatsApp links carry the cart; with an empty cart they keep their own text", async ({ page }) => {
  await page.goto("/");
  const [, empty] = await whatsappMessage(page, () => page.getByRole("link", { name: "Chat on WhatsApp" }).click());
  expect(empty).toBe("", "the footer chat link has no prefilled text of its own");
  await page.goto("/menu");
  await addButterChicken(page);
  await page.goto("/");
  const [, footer] = await whatsappMessage(page, () => page.getByRole("link", { name: "Chat on WhatsApp" }).click());
  expect(footer).toContain("Hi Pilot Kitchen, I'd like to order:");
  expect(footer).toContain("1. 1 × Butter Chicken — ₹319");
  // "More ways to order" sheet (header on desktop, menu button on phones).
  const more = page.getByRole("button", { name: "More ways to order" });
  if (await more.first().isVisible()) await more.first().click();
  else {
    await page.getByRole("button", { name: /menu/i }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "More ways to order" }).click();
  }
  const [, sheet] = await whatsappMessage(page, () => page.getByRole("dialog").last().getByRole("link", { name: /WhatsApp/ }).click());
  expect(sheet).toContain("1. 1 × Butter Chicken — ₹319");
});

test("the buttons disappear when the restaurant switches them off", async ({ page }) => {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const experience = defaultExperience();
    experience.site.whatsappOrdering = false;
    await db.query(`UPDATE brands SET experience_draft = $1 WHERE slug = 'pilot'`, [JSON.stringify(experience)]);
    await page.goto(previewPath("/menu/chicken-dum-biryani"));
    await expect(page.getByRole("button", { name: /Add to order/ })).toBeVisible();
    await expect(page.getByTestId("whatsapp-order")).toHaveCount(0);
  } finally {
    await db.query(`UPDATE brands SET experience_draft = NULL WHERE slug = 'pilot'`);
    await db.end();
  }
  await page.goto("/?preview=0");
  await page.goto("/menu/chicken-dum-biryani");
  await expect(page.getByTestId("whatsapp-order")).toHaveCount(1);
});
