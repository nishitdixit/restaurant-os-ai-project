import { chapter, click, env, expect, openStage, refreshUntil, refreshUntilGone, sleep, state, type } from "../lib/stage.ts";

chapter("09 Live changes: admin to storefront", async () => {
  const s = state<{ priceOrderToken: string }>();
  const { admin, store, say, close } = await openStage("09-live-sync", "Live changes from the admin to the storefront",
    "Price change, out of stock (with automatic return), bulk stock changes, pausing orders, and a price change in the middle of a customer's checkout.");

  // 1. Price change -> customer refresh
  await store.goto(`${env.storefront}/menu/paneer-butter-masala`);
  await expect(store.getByText("₹279").first()).toBeVisible();
  await say("Customer is looking at Paneer Butter Masala: ₹279", "store");
  await admin.goto(`${env.admin}/catalog`);
  await say("Owner raises the price to ₹299", "admin");
  await click(admin, admin.getByRole("row").filter({ hasText: "Paneer Butter Masala" }).getByText("Paneer Butter Masala"));
  await type(admin, admin.getByLabel("Price"), "299");
  await expect(admin.getByText(/Price changes from 279 to 299/)).toBeVisible();
  await say("The editor warns that past orders keep the price they were placed at", "admin");
  await click(admin, admin.getByRole("button", { name: "Save changes" }));
  await expect(admin.getByText("Item saved").first()).toBeVisible();
  await say("Customer refreshes: the menu is cached up to ~15 s", "store");
  let sec = await refreshUntil(store, store.getByText("₹299"));
  await say(`New price ₹299 visible after ${sec} s`, "store");

  // 2. Out of stock with automatic return
  await store.goto(`${env.storefront}/menu`);
  await say("Kitchen runs out of Dal Makhani: one switch, with an optional automatic return", "admin");
  const dal = admin.getByRole("row").filter({ hasText: "Dal Makhani" });
  await click(admin, dal.getByRole("switch"));
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Back in stock").selectOption("tomorrow");
  await sleep(800);
  await click(admin, dialog.getByRole("button", { name: "Mark out of stock" }));
  await expect(admin.getByText("1 item marked out of stock")).toBeVisible();
  sec = await refreshUntil(store, store.getByText("Sold out for today"));
  await say(`Customer side (${sec} s): Dal Makhani shows “Sold out for today” and can't be added`, "store");
  await store.getByText("Sold out for today").first().scrollIntoViewIfNeeded();
  await sleep(2000);

  // 3. Bulk stock
  await say("Bulk: mark several items out of stock at once", "admin");
  for (const name of ["Butter Naan", "Mango Lassi"]) await click(admin, admin.getByRole("row").filter({ hasText: name }).getByRole("checkbox", { name: "Select row" }));
  await click(admin, admin.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Mark out of stock" }));
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Mark out of stock" }));
  await expect(admin.getByText("2 items marked out of stock")).toBeVisible();
  await sleep(1500);
  await say("…and back in stock together", "admin");
  for (const name of ["Butter Naan", "Mango Lassi"]) await click(admin, admin.getByRole("row").filter({ hasText: name }).getByRole("checkbox", { name: "Select row" }));
  await click(admin, admin.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Back in stock" }));
  await expect(admin.getByText("2 items back in stock")).toBeVisible();

  // 4. Pause / resume ordering
  await store.goto(env.storefront);
  await say("Kitchen overloaded: pause online ordering from the top bar", "admin");
  await click(admin, admin.locator("header").getByRole("switch"));
  await expect(admin.getByText("Online ordering paused — customers can still browse")).toBeVisible();
  sec = await refreshUntil(store, store.getByText("Online orders are paused for a little while."));
  await say(`Customer side (${sec} s): a clear “paused” notice; browsing still works`, "store");
  await sleep(1500);
  await click(admin, admin.locator("header").getByRole("switch"));
  await expect(admin.getByText("Online ordering resumed")).toBeVisible();
  sec = await refreshUntilGone(store, store.getByText("Online orders are paused for a little while."));
  await say(`Resumed — the notice is gone after ${sec} s`, "store");

  // 5. Price change during checkout
  await store.goto(`${env.storefront}/checkout`);
  await say("A customer starts checking out…", "store");
  await type(store, store.getByLabel("Name"), "Priya Sharma");
  await type(store, store.getByLabel("Mobile number"), "9876543210");
  await type(store, store.getByLabel("House / flat, building, street"), "22, 5th Cross, Defence Colony");
  await type(store, store.getByLabel("Area / locality"), "Indiranagar");
  await type(store, store.getByLabel("City"), "Bengaluru");
  await type(store, store.getByLabel("Pincode"), "560038");
  await expect(store.getByText(/Delivers in 30–45 min/)).toBeVisible();
  const before = await store.getByText("To pay").locator("..").textContent();
  await say("…while the owner changes the Butter Naan price from ₹59 to ₹65", "admin");
  await click(admin, admin.getByRole("row").filter({ hasText: "Butter Naan" }).getByText("Butter Naan"));
  await type(admin, admin.getByLabel("Price"), "65");
  await click(admin, admin.getByRole("button", { name: "Save changes" }));
  await expect(admin.getByText("Item saved").first()).toBeVisible();
  await click(store, store.getByRole("button", { name: /Place order/ }));
  await expect(store.getByText(/Prices changed since you opened checkout/)).toBeVisible();
  await say("Checkout always uses live prices: the order is held and the new total is shown before any payment", "store");
  await expect(store.getByText("To pay").locator("..")).not.toHaveText(before ?? "");
  await sleep(2500);
  await click(store, store.getByRole("button", { name: /Place order/ }));
  await expect(store).toHaveURL(/\/order\/[^/]+\/pay$/);
  s.save({ priceOrderToken: store.url().split("/order/")[1]!.split("/")[0]! });
  await say("Confirmed at the new total → test-mode payment", "store");
  await click(store, store.getByRole("button", { name: /^Pay / }));
  await expect(store.getByRole("heading", { name: /Order #\d+ confirmed/ })).toBeVisible();
  await sleep(2000);
  await close();
});
