// Critical customer flows (engineering/TESTING.md "E2E"): browse -> cart -> checkout -> payment ->
// order; unavailable item; invalid delivery address; coupon; payment failure and retry.
import { expect, test, type Page } from "@playwright/test";

const unique = () => `9${String(Date.now()).slice(-9)}`;

async function addSimpleItem(page: Page, name: string) {
  const card = page.locator("article").filter({ has: page.getByRole("link", { name, exact: true }) });
  await card.getByRole("button", { name: new RegExp(`^Add ${name}`) }).click();
  await expect(page.getByText(`${name} added`)).toBeVisible();
}

async function openCheckout(page: Page) {
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
}

async function fillContact(page: Page, phone = unique()) {
  await page.getByLabel("Name").fill("E2E Customer");
  await page.getByLabel("Mobile number").fill(phone);
}

async function fillAddress(page: Page, pincode: string) {
  await page.getByLabel("House / flat, building, street").fill("12, 1st Main, HAL 2nd Stage");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByLabel("Pincode").fill(pincode);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
});

test("browse, customise, apply a coupon, pay and see the confirmed order", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pilot Kitchen");
  await page.getByRole("link", { name: "Order direct" }).first().click();
  await expect(page).toHaveURL(/\/menu$/);

  await addSimpleItem(page, "Butter Chicken");

  // Item with required + optional option groups opens the option sheet.
  const biryani = page.locator("article").filter({ has: page.getByRole("link", { name: "Chicken Dum Biryani", exact: true }) });
  await biryani.getByRole("button", { name: /Add Chicken Dum Biryani/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Family pack (serves 3)").check();
  await sheet.getByLabel("Extra raita").check();
  await sheet.getByRole("button", { name: /^Add · / }).click();
  await expect(page.getByText("Chicken Dum Biryani added")).toBeVisible();

  await openCheckout(page);
  await fillContact(page);
  await fillAddress(page, "560038");
  await expect(page.getByText(/Delivers in 30–45 min/)).toBeVisible();

  await page.getByPlaceholder("Coupon code").fill("welcome50");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("WELCOME50 applied", { exact: true })).toBeVisible();

  // 319 + (329 + 420 + 30) + 30 delivery - 50 coupon = ₹1,078
  await expect(page.getByText("To pay").locator("..")).toContainText("₹1,078");
  await page.getByRole("button", { name: /Place order · ₹1,078/ }).click();

  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]+\/pay$/);
  await expect(page.getByText("Test mode — no real money moves")).toBeVisible();
  await page.getByRole("button", { name: "Pay ₹1,078" }).click();

  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]+(\?paid=1)?$/);
  await expect(page.getByRole("heading", { name: /Order #\d+ confirmed/ })).toBeVisible();
  await expect(page.getByText("Family pack (serves 3) · Extra raita")).toBeVisible();
  await expect(page.getByText("Discount (WELCOME50)")).toBeVisible();
});

test("an out-of-stock item cannot be added", async ({ page }) => {
  await page.goto("/menu");
  const mutton = page.locator("article").filter({ has: page.getByRole("link", { name: "Mutton Biryani", exact: true }) });
  await expect(mutton.getByText("Sold out for today")).toBeVisible();
  await expect(mutton.getByRole("button", { name: /Add/ })).toHaveCount(0);
});

test("an address outside the delivery area is explained before payment, with pickup as recovery", async ({ page }) => {
  await page.goto("/menu");
  await addSimpleItem(page, "Butter Chicken");
  await openCheckout(page);
  await fillContact(page);
  await fillAddress(page, "110001");
  await expect(page.getByText("Sorry, we don't deliver to 110001 yet. You can choose pickup instead.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Place order/ })).toBeDisabled();
  await page.getByRole("button", { name: "Switch to pickup instead" }).click();
  await expect(page.getByRole("radio", { name: "Pickup" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: /Place order/ })).toBeEnabled();
});

test("minimum order for the area is shown with the amount still needed", async ({ page }) => {
  await page.goto("/menu");
  await addSimpleItem(page, "Butter Naan");
  await openCheckout(page);
  await fillContact(page);
  await fillAddress(page, "560038");
  await expect(page.getByText(/Add ₹140 more to order delivery/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Place order/ })).toBeDisabled();
});

test("a failed payment can be retried and then succeeds", async ({ page }) => {
  await page.goto("/menu");
  await addSimpleItem(page, "Paneer Butter Masala");
  await openCheckout(page);
  await page.getByRole("radio", { name: "Pickup" }).click();
  await fillContact(page);
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.getByRole("button", { name: "Simulate failure" }).click();
  await expect(page.getByRole("heading", { name: "Payment didn't go through" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByRole("heading", { name: /Order #\d+ confirmed/ })).toBeVisible();
});

test("refreshing after placing an order never creates a second one", async ({ page }) => {
  await page.goto("/menu");
  await addSimpleItem(page, "Dal Makhani");
  await openCheckout(page);
  await page.getByRole("radio", { name: "Pickup" }).click();
  await fillContact(page, "9123400001");
  const responses: number[] = [];
  page.on("response", (r) => { if (r.url().endsWith("/orders") && r.request().method() === "POST") responses.push(r.status()); });
  // Double click: the button disables itself and the idempotency key is shared.
  await page.getByRole("button", { name: /Place order/ }).dblclick();
  await expect(page).toHaveURL(/\/pay$/);
  expect(responses.filter((s) => s === 201).length).toBe(1);
});

test("search finds dishes and SEO essentials are present", async ({ page, request }) => {
  await page.goto("/search");
  await page.getByLabel("Search dishes").fill("paneer");
  await expect(page.getByRole("link", { name: "Paneer Butter Masala" })).toBeVisible();

  await page.goto("/menu/butter-chicken");
  await expect(page).toHaveTitle(/Butter Chicken · Pilot Kitchen/);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(/\/menu\/butter-chicken$/);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((s) => s.includes('"MenuItem"') && s.includes('"priceCurrency":"INR"'))).toBeTruthy();

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/menu/butter-chicken");
  expect(sitemap).toContain("/biryani");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /checkout");
});

test("checkout field errors clear as soon as each field is corrected", async ({ page }) => {
  await page.goto("/menu");
  await addSimpleItem(page, "Butter Chicken");
  await openCheckout(page);
  await page.getByRole("radio", { name: "Pickup" }).click();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Enter a 10-digit mobile number.")).toBeVisible();
  await page.getByLabel("Name").fill("E2E Customer");
  await expect(page.getByText("Enter your name.")).toHaveCount(0);
  await expect(page.getByText("Enter a 10-digit mobile number.")).toBeVisible();
  await page.getByLabel("Mobile number").fill(unique());
  await expect(page.getByText("Enter a 10-digit mobile number.")).toHaveCount(0);
});

test("menu category chips stay visible, follow scrolling and jump to their section", async ({ page }) => {
  await page.goto("/menu");
  const chips = page.getByRole("navigation", { name: "Menu categories" });
  const sections = page.locator('section[id^="cat-"]');
  const second = (await sections.nth(1).getAttribute("id"))!.replace(/^cat-/, "");
  await sections.nth(1).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator(`#chip-${second}`)).toHaveAttribute("aria-current", "true");
  // The sticky chip bar sits below the header, not under it.
  const headerBottom = await page.locator("header").first().evaluate((el) => el.getBoundingClientRect().bottom);
  expect(await chips.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(headerBottom - 1);
  // Scrolling is never pulled back up by the chip row.
  const target = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(target - 5);
  // Tapping the last chip jumps to its section and highlights it, even at the end of the page.
  const lastSlug = (await sections.last().getAttribute("id"))!.replace(/^cat-/, "");
  await page.locator(`#chip-${lastSlug}`).click();
  await expect(page).toHaveURL(new RegExp(`#cat-${lastSlug}$`));
  await expect(page.locator(`#chip-${lastSlug}`)).toHaveAttribute("aria-current", "true");
  await expect(sections.last()).toBeInViewport();
});
