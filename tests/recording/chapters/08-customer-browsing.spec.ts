import { chapter, click, env, expect, openStage, sleep, type } from "../lib/stage.ts";

chapter("08 Customer browsing", async () => {
  const { admin, store, say, close } = await openStage("08-customer-browsing", "A customer browsing the storefront",
    "Home, category chips, category and dish pages, search, options, cart drawer and sticky cart bar, delivery areas, contact and the not-found page.");

  await admin.goto(`${env.admin}/orders`);
  await say("Admin: the order board is empty while the customer browses", "admin");
  await store.goto(env.storefront);
  await say("A customer opens the storefront on her phone", "store");
  await sleep(1200);
  for (let i = 0; i < 3; i++) { await store.mouse.wheel(0, 420); await sleep(800); }
  await click(store, store.getByRole("link", { name: "Biryani" }).first());
  await expect(store.getByRole("heading", { name: "Biryani", level: 1 })).toBeVisible();
  await say("Each category has its own page (good for search engines)", "store");
  await sleep(1200);

  await click(store, store.getByRole("link", { name: "Menu" }).first());
  await say("Scrolling the menu: the category chips follow the section on screen", "store");
  // Stay within the menu (the test menu is short; past its end the footer takes over and the bar scrolls away).
  for (let i = 0; i < 3; i++) { await store.mouse.wheel(0, 300); await sleep(700); }
  const scrolled = await store.evaluate(() => window.scrollY);
  await sleep(1000);
  expect(await store.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(scrolled - 5); // regression: page must not jump back up
  await expect(store.getByRole("navigation", { name: "Menu categories" })).toBeInViewport(); // regression: chip bar stays stuck below the header
  await click(store, store.locator("#chip-breads"));
  await expect(store.locator("#chip-breads")).toHaveAttribute("aria-current", "true");
  await say("Tapping a chip jumps to that section", "store");
  await sleep(1200);

  await click(store, store.getByRole("button", { name: /Add Butter Naan/ }));
  await expect(store.getByText("Butter Naan added")).toBeVisible();
  await say("Simple dishes add with one tap; a cart bar appears at the bottom", "store");
  await sleep(1500);

  await store.getByText("Butter Naan added").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await click(store, store.getByRole("link", { name: "Search", exact: true }).first());
  await type(store, store.getByLabel("Search dishes"), "biryani");
  await expect(store.getByRole("link", { name: "Chicken Dum Biryani" })).toBeVisible();
  await say("Search finds dishes by name, category or tag", "store");
  await sleep(1200);
  await click(store, store.getByRole("link", { name: "Chicken Dum Biryani" }));

  await expect(store.getByRole("heading", { name: "Chicken Dum Biryani", level: 1 })).toBeVisible();
  await say("Dish page: photo, food type, spice level, and the options to choose", "store");
  await store.mouse.wheel(0, 450);
  await sleep(800);
  await click(store, store.getByLabel("Family pack (serves 3)"));
  await click(store, store.getByLabel("Extra raita"));
  await click(store, store.getByLabel("Boiled egg"));
  await say("Add-ons allow up to 2: the third choice is disabled automatically", "store");
  await expect(store.getByLabel("Mirchi ka salan")).toBeDisabled();
  await sleep(1500);
  await click(store, store.getByRole("button", { name: /Add to order/ }));
  await expect(store.getByRole("heading", { name: "Your order" })).toBeVisible();
  await say("Cart: change quantities or remove items; prices update", "store");
  await click(store, store.getByRole("button", { name: "Increase Butter Naan" }));
  await click(store, store.getByRole("button", { name: "Increase Butter Naan" }));
  await click(store, store.getByRole("button", { name: "Decrease Butter Naan" }));
  await sleep(1200);
  await store.keyboard.press("Escape");

  await click(store, store.getByRole("link", { name: "Delivery areas" }).first());
  await say("Where they deliver, fees and minimums — before checkout", "store");
  await sleep(1800);
  await click(store, store.getByRole("link", { name: "Contact" }).first());
  await say("Contact & hours, with call, WhatsApp and directions", "store");
  await sleep(1800);
  await store.goto(`${env.storefront}/menu/does-not-exist`);
  await expect(store.getByText("We couldn't find that page")).toBeVisible();
  await say("A missing dish or page leads back to the menu", "store");
  await sleep(1500);
  await click(store, store.getByRole("link", { name: "Go to the menu" }));
  await sleep(1000);
  await close();
});
