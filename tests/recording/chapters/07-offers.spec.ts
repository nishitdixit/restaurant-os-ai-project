import type { Page } from "@playwright/test";
import { chapter, click, env, expect, openStage, refreshUntil, sleep, type } from "../lib/stage.ts";

interface Offer { code: string; title: string; type: "FIXED" | "PERCENTAGE"; value: string; minimum: string; max?: string; cap?: string; firstOrder?: boolean; oncePerCustomer?: boolean; hidden?: boolean }

async function createOffer(admin: Page, o: Offer) {
  const opener = admin.getByRole("button", { name: /^(New offer|Create an offer)$/ }).first();
  await click(admin, opener);
  const d = admin.getByRole("dialog");
  await type(admin, d.getByRole("textbox", { name: "Code", exact: true }), o.code);
  await type(admin, d.getByRole("textbox", { name: "Title", exact: true }), o.title);
  await d.getByRole("combobox", { name: "Discount type" }).selectOption(o.type);
  await type(admin, d.getByRole("textbox", { name: o.type === "FIXED" ? "Amount off" : "Percent off", exact: true }), o.value);
  await type(admin, d.getByRole("textbox", { name: "Minimum order", exact: true }), o.minimum);
  if (o.max) await type(admin, d.getByRole("textbox", { name: "Maximum discount (optional)", exact: true }), o.max);
  if (o.cap) await type(admin, d.getByRole("spinbutton", { name: "Total uses allowed (optional)" }), o.cap);
  const box = (name: string) => d.getByRole("checkbox", { name: new RegExp(`^${name}`) });
  if (o.firstOrder) await click(admin, box("First order only"));
  if (o.oncePerCustomer === false) await click(admin, box("Once per customer"));
  if (o.hidden) await d.getByRole("combobox", { name: "Who can use it" }).selectOption("CODE_ONLY");
  await sleep(600);
  await click(admin, d.getByRole("button", { name: "Save offer" }));
  await expect(admin.getByText("Offer saved").first()).toBeVisible();
}

chapter("07 Offers", async () => {
  const { admin, store, say, close } = await openStage("07-offers", "Offers and coupon codes",
    "Fixed and percentage coupons with minimums, caps, first-order-only and hidden codes; validation; pause and resume; the customer offers page.");

  await store.goto(`${env.storefront}/offers`);
  await say("Customer side: no offers yet", "store");
  await admin.goto(`${env.admin}/offers`);
  await expect(admin.getByText("No offers yet")).toBeVisible();
  await say("Offers: coupon codes for direct orders", "admin");

  await click(admin, admin.getByRole("button", { name: "Create an offer" }));
  const d = admin.getByRole("dialog");
  await type(admin, d.getByRole("textbox", { name: "Code", exact: true }), "TOOBIG");
  await type(admin, d.getByRole("textbox", { name: "Title", exact: true }), "Invalid example");
  await d.getByRole("combobox", { name: "Discount type" }).selectOption("PERCENTAGE");
  await type(admin, d.getByRole("textbox", { name: "Percent off", exact: true }), "150");
  await click(admin, d.getByRole("button", { name: "Save offer" }));
  await expect(d.getByText("A percentage cannot exceed 100.")).toBeVisible();
  await say("Validation: a percentage over 100 is refused with a clear message", "admin");
  await sleep(1500);
  await click(admin, d.getByRole("button", { name: "Cancel" }));

  await say("A welcome offer for first orders: ₹50 off above ₹299, once per customer", "admin");
  await createOffer(admin, { code: "WELCOME50", title: "₹50 off your first order", type: "FIXED", value: "50", minimum: "299", firstOrder: true });
  await say("20% off above ₹499, capped at ₹100", "admin");
  await createOffer(admin, { code: "SPICE20", title: "20% off big orders", type: "PERCENTAGE", value: "20", minimum: "499", max: "100", oncePerCustomer: false });
  await say("A hidden staff code (works when shared, not listed publicly)", "admin");
  await createOffer(admin, { code: "STAFF10", title: "Staff and friends", type: "PERCENTAGE", value: "10", minimum: "0", hidden: true, oncePerCustomer: false });
  await say("A flash deal limited to 2 uses in total", "admin");
  await createOffer(admin, { code: "FLASH30", title: "Flash: ₹30 off", type: "FIXED", value: "30", minimum: "199", cap: "2", oncePerCustomer: false });

  await say("Pause an offer instantly — and resume it", "admin");
  const spice = admin.locator("section").filter({ hasText: "SPICE20" }).filter({ has: admin.getByRole("switch") }).last();
  await click(admin, spice.getByRole("switch"));
  await expect(spice.getByText("Paused", { exact: true }).first()).toBeVisible();
  await sleep(1200);
  await click(admin, spice.getByRole("switch"));
  await expect(spice.getByText("Live", { exact: true }).first()).toBeVisible();

  await say("Customer side: public offers appear (the hidden staff code doesn't)", "store");
  await refreshUntil(store, store.getByText("₹50 off your first order"));
  await expect(store.getByText("STAFF10")).toHaveCount(0);
  await click(store, store.getByRole("button", { name: "Copy code WELCOME50" }));
  await say("Customers can copy a code for checkout", "store");
  await store.goto(env.storefront);
  await say("The home page shows an offers strip", "store");
  await sleep(2500);
  await close();
});
