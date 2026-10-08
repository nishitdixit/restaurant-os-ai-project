import type { Page } from "@playwright/test";
import { ensureSignedIn, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, sleep, state, type } from "../lib/stage.ts";
import { addSimple } from "../lib/shop.ts";

/** Clicks a WhatsApp link on the storefront and returns the prefilled message (wa.me is intercepted). */
async function whatsappText(store: Page, link: ReturnType<Page["getByRole"]>) {
  const popup = store.waitForEvent("popup");
  await click(store, link);
  const opened = await popup;
  const text = new URL(opened.url()).searchParams.get("text") ?? "";
  await opened.close();
  return text;
}

chapter("18 Orders from WhatsApp, phone and walk-ins", async () => {
  const s = state<{ owner: TestPerson }>();
  const { admin, store, say, close } = await openStage("18-staff-orders", "Orders from WhatsApp, phone and walk-ins",
    "“Order on WhatsApp” sends exactly what the customer picked; staff enter WhatsApp, phone and walk-in orders with website pricing, apply staff-only offers, take cash/UPI or pay later, and see it all in reports.",
    { freshStore: true });
  await store.context().route(/https:\/\/(wa\.me|api\.whatsapp\.com)\/.*/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp</title>" }));

  // Customer side: the WhatsApp message carries the selection.
  await store.goto(`${env.storefront}/menu/chicken-dum-biryani`);
  await click(store, store.getByLabel("Family pack (serves 3)"));
  await click(store, store.getByLabel("Extra raita"));
  await say("A dish page now has “Order on WhatsApp” next to “Add to order”", "store");
  const dishText = await whatsappText(store, store.getByTestId("whatsapp-order"));
  expect(dishText).toContain("1 × Chicken Dum Biryani");
  expect(dishText).toContain("• Portion: Family pack (serves 3) (+₹350)");
  expect(dishText).toContain("• Add-ons: Extra raita (+₹30)");
  await say("The message names the dish, portion and add-ons with prices — no back-and-forth needed", "store");

  await click(store, store.getByRole("button", { name: /^Add to order/ }));
  await store.goto(`${env.storefront}/menu`);
  await addSimple(store, "Butter Naan");
  await click(store, store.getByRole("button", { name: /Open cart/ }).first());
  const cartText = await whatsappText(store, store.getByRole("dialog").getByRole("link", { name: "Or send this order on WhatsApp" }));
  expect(cartText).toContain("1. 1 × Chicken Dum Biryani");
  expect(cartText).toContain("2. 1 × Butter Naan");
  expect(cartText).toContain("Items total:");
  await say("From the cart, the whole order goes into the message, line by line with the total", "store");
  await store.keyboard.press("Escape");

  // Owner: a staff-only offer.
  await ensureSignedIn(admin, s.owner, say);
  await admin.goto(`${env.admin}/offers`);
  await click(admin, admin.getByRole("button", { name: /^(New offer|Create an offer)$/ }).first());
  const d = admin.getByRole("dialog");
  await type(admin, d.getByRole("textbox", { name: "Code", exact: true }), "REGULAR15");
  await type(admin, d.getByRole("textbox", { name: "Title", exact: true }), "Regulars: 15% off");
  await d.getByRole("combobox", { name: "Discount type" }).selectOption("PERCENTAGE");
  await type(admin, d.getByRole("textbox", { name: "Percent off", exact: true }), "15");
  await type(admin, d.getByRole("textbox", { name: "Minimum order", exact: true }), "0");
  await d.getByRole("combobox", { name: "Who can use it" }).selectOption("STAFF_ONLY");
  await say("Owners can make a staff-only offer: never shown or accepted on the website", "admin");
  await sleep(1200);
  await click(admin, d.getByRole("button", { name: "Save offer" }));
  await expect(admin.getByText("Offer saved").first()).toBeVisible();
  await expect(admin.locator("section, div").filter({ hasText: "REGULAR15" }).getByText("Staff only").first()).toBeVisible();

  await store.goto(`${env.storefront}/checkout`);
  await type(store, store.getByPlaceholder("Coupon code"), "REGULAR15");
  await click(store, store.getByRole("button", { name: "Apply" }));
  await expect(store.getByText("REGULAR15 is not a valid code.")).toBeVisible();
  await say("Typed on the website, the staff code is refused like any unknown code", "store");

  // Staff enter a WhatsApp order, pay later, with the staff-only offer.
  await admin.goto(`${env.admin}/orders`);
  await click(admin, admin.getByRole("link", { name: "New order" }));
  await expect(admin.getByRole("heading", { name: "New order" })).toBeVisible();
  await say("Orders → New order: for orders that came by WhatsApp, phone or at the counter", "admin");
  await click(admin, admin.getByRole("radio", { name: "WhatsApp" }));
  await type(admin, admin.getByLabel("Mobile number"), "9811122233");
  await type(admin, admin.getByRole("textbox", { name: "Name", exact: true }), "Meera Iyer");
  await type(admin, admin.getByLabel("House / flat, building, street"), "22, 4th Cross, HAL 2nd Stage");
  await type(admin, admin.getByLabel("City"), "Bengaluru");
  await type(admin, admin.getByLabel("Pincode"), "560038");
  await click(admin, admin.getByRole("button", { name: "Add Chicken Dum Biryani (choose options)" }));
  const options = admin.getByRole("dialog");
  await click(admin, options.getByLabel("Family pack (serves 3)"));
  await click(admin, options.getByLabel("Extra raita"));
  await click(admin, options.getByRole("button", { name: /^Add · / }));
  await click(admin, admin.getByRole("button", { name: "Add Butter Naan" }));
  await click(admin, admin.getByRole("button", { name: "Add Butter Naan" }));
  await say("Dishes and options exactly as on the website; the delivery fee comes from the delivery area", "admin");
  await admin.getByRole("combobox", { name: "Offer" }).selectOption("REGULAR15");
  await expect(admin.getByText(/^Offer/).filter({ hasText: "REGULAR15" }).first()).toBeVisible();
  await say("Any staff member can apply a live offer from the list — including staff-only ones", "admin");
  await click(admin, admin.getByRole("radio", { name: "Pay later" }));
  await say("Payment: cash, UPI or card now — or pay later on delivery", "admin");
  await sleep(1200);
  await click(admin, admin.getByRole("button", { name: /^Create order · / }));
  await expect(admin.getByText(/^Order #\d+ created/).first()).toBeVisible();
  const details = admin.getByRole("dialog");
  await expect(details.getByText(/^Collect ₹/)).toBeVisible();
  await expect(details.getByText(/Entered by .* · WhatsApp order/)).toBeVisible();
  await expect(details.getByText("Staff only").first()).toBeVisible();
  await say("Created: accepted straight away, marked WhatsApp, with who entered it and that payment is due", "admin");
  await sleep(1500);
  await click(admin, details.getByRole("button", { name: "Paid · UPI" }));
  await expect(admin.getByText(/payment received \(UPI\)/)).toBeVisible();
  await say("The rider brings back the money: “Paid · UPI” — now it counts in sales", "admin");
  await admin.keyboard.press("Escape");
  await expect(admin.locator("article").filter({ hasText: "Meera Iyer" }).getByText("WhatsApp")).toBeVisible();
  await say("On the board with every other order, labelled by source", "admin");

  // Walk-in, anonymous, cash.
  await click(admin, admin.getByRole("link", { name: "New order" }));
  await click(admin, admin.getByRole("radio", { name: "Walk-in / counter" }));
  await click(admin, admin.getByRole("radio", { name: "Pickup" }));
  await click(admin, admin.getByRole("button", { name: "Add Paneer Butter Masala" }));
  await say("A walk-in at the counter: no phone needed for a pickup, paid in cash", "admin");
  await click(admin, admin.getByRole("button", { name: /^Create order · / }));
  await expect(admin.getByText(/^Order #\d+ created/).first()).toBeVisible();
  await admin.keyboard.press("Escape");

  // Reports.
  await admin.goto(`${env.admin}/offers`);
  await expect(admin.getByText("0 website · 1 by staff")).toBeVisible();
  await say("Offers show website vs staff uses and who applied them", "admin");
  await admin.goto(`${env.admin}/analytics`);
  await expect(admin.getByRole("table", { name: "Offer usage" }).getByText("REGULAR15")).toBeVisible();
  await expect(admin.getByText("Walk-in").first()).toBeVisible();
  await say("Analytics: channels include WhatsApp and walk-in orders, and every offer's use by source", "admin");
  await sleep(1500);
  await close();
});
