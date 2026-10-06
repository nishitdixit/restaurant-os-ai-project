import { ensureSignedIn, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, point, sleep, state, type } from "../lib/stage.ts";

chapter("14 Analytics, customers, messages and audit log", async () => {
  const s = state<{ owner: TestPerson }>();
  const { admin, store, say, close } = await openStage("14-insight", "Analytics, customers, messages and audit log",
    "Sales figures that reconcile with orders, the daily chart and its table view, customer history and consent, every customer message, and who changed what.");

  await store.goto(`${env.storefront}/offers`);
  await say("This chapter is in the admin; the storefront is unchanged", "store");
  await ensureSignedIn(admin, s.owner, say);
  await admin.goto(`${env.admin}/analytics`);
  await expect(admin.getByText("Gross sales").first()).toBeVisible();
  await say("Analytics: sales from paid orders only — unpaid and cancelled orders are excluded", "admin");
  await point(admin, admin.getByRole("button", { name: /Sum of order totals/ }));
  await say("Every figure has its definition one hover away", "admin");
  await sleep(2000);
  await click(admin, admin.getByRole("tab", { name: "7 days" }));
  await expect(admin.getByText("Daily sales")).toBeVisible();
  await say("Daily sales: hover a bar for the day's total and orders", "admin");
  const bar = admin.locator('[role="graphics-symbol"]').last();
  await bar.scrollIntoViewIfNeeded();
  const box = await bar.boundingBox();
  if (box) await admin.mouse.move(box.x + box.width / 2, box.y + box.height - 10, { steps: 15 });
  await sleep(2000);
  await click(admin, admin.getByRole("button", { name: "View as table" }));
  await say("…or switch to a table for exact values", "admin");
  await sleep(1800);
  await click(admin, admin.getByRole("button", { name: "Show chart" }));
  await admin.mouse.wheel(0, 700);
  await say("Top dishes, order outcomes, channels, delivery vs pickup, fees and discounts", "admin");
  await sleep(2500);

  await click(admin, admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Customers" }));
  await expect(admin.getByRole("heading", { name: "Customers" })).toBeVisible();
  await say("Customers: everyone who ordered direct, matched by mobile number", "admin");
  await admin.getByLabel("Segment").selectOption("new");
  await sleep(1200);
  await admin.getByLabel("Segment").selectOption("all");
  await type(admin, admin.getByLabel("Search customers"), "Arjun");
  await click(admin, admin.getByRole("row").filter({ hasText: "Arjun Menon" }));
  await expect(admin.getByRole("heading", { name: "Arjun Menon" })).toBeVisible();
  await say("Customer page: orders, spend, favourites, addresses and coupons used", "admin");
  await sleep(1500);
  await type(admin, admin.getByLabel("Customer notes"), "Prefers extra raita. Ring the bell twice.");
  await click(admin, admin.getByRole("button", { name: "Save notes" }));
  await expect(admin.getByText("Saved").first()).toBeVisible();
  await say("He opted in to offers at checkout; staff can record a withdrawal if he asks", "admin");
  await sleep(1500);

  await click(admin, admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Messages" }));
  await expect(admin.getByRole("heading", { name: "Messages" })).toBeVisible();
  await say("Messages: every customer update and team alert (test mode records them instead of sending)", "admin");
  for (let i = 0; i < 3; i++) { await admin.mouse.wheel(0, 500); await sleep(900); }
  await click(admin, admin.getByRole("tab", { name: /^Sent/ }));
  await sleep(1200);

  await admin.goto(`${env.admin}/settings/audit`);
  await expect(admin.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await say("Audit log: price and stock changes, refunds, cancellations, team and settings — who, what and when", "admin");
  for (let i = 0; i < 3; i++) { await admin.mouse.wheel(0, 500); await sleep(900); }
  await close();
});
