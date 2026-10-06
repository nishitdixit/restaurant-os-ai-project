import { chapter, click, env, expect, openStage, sleep, state, type } from "../lib/stage.ts";
import { addSimple, addWithOptions, contact } from "../lib/shop.ts";

chapter("10 Checkout: every problem explained before payment", async () => {
  const s = state<{ deliveryOrder: { token: string; number: number } }>();
  const { admin, store, say, close } = await openStage("10-checkout-edge-cases", "Checkout edge cases",
    "Missing details, an address outside the delivery area, location-based delivery, minimum order, coupon rules, a failed payment and a retry.",
    { freshStore: true });

  await admin.goto(`${env.admin}/orders?view=awaiting_payment`);
  await say("Admin: orders waiting for payment appear here — not on the kitchen board", "admin");
  await store.goto(`${env.storefront}/menu`);
  await say("A new customer, Arjun, on his own phone, fills his cart", "store");
  await addWithOptions(store, "Veg Dum Biryani");
  await addSimple(store, "Butter Naan");
  await store.goto(`${env.storefront}/checkout`);

  await contact(store, "Arjun Menon", "98450 77777");
  await type(store, store.getByLabel("House / flat, building, street"), "8, 2nd Main, Koramangala 5th Block");
  await type(store, store.getByLabel("City"), "Bengaluru");
  await type(store, store.getByLabel("Pincode"), "110001");
  await expect(store.getByText("Sorry, we don't deliver to 110001 yet. You can choose pickup instead.")).toBeVisible();
  await say("Outside the delivery area: explained before payment, with pickup offered", "store");
  await expect(store.getByRole("button", { name: /^Place order/ })).toBeDisabled();
  await click(store, store.getByRole("button", { name: "Switch to pickup instead" }));
  await expect(store.getByRole("radio", { name: "Pickup" })).toHaveAttribute("aria-checked", "true");
  await say("Pickup: no delivery fee, ready in about 25 min", "store");
  await sleep(1800);
  await click(store, store.getByRole("radio", { name: "Delivery" }));

  await type(store, store.getByLabel("Pincode"), "560017");
  await say("Not a listed pincode — but sharing his location matches the 3 km area", "store");
  await click(store, store.getByRole("button", { name: "Use my location" }));
  await expect(store.getByText(/Delivers in 20–35 min · fee ₹20/)).toBeVisible();
  await sleep(1500);

  await click(store, store.getByRole("button", { name: "Remove Veg Dum Biryani" }));
  await expect(store.getByText(/Add ₹\d+ more to order delivery to this area/)).toBeVisible();
  await say("Below the area's minimum order: it says exactly how much more is needed", "store");
  await sleep(1800);
  for (let i = 0; i < 4; i++) await click(store, store.getByRole("button", { name: "Increase Butter Naan" }));

  await type(store, store.getByPlaceholder("Coupon code"), "BOGUS");
  await click(store, store.getByRole("button", { name: "Apply" }));
  await expect(store.getByText("BOGUS is not a valid code.")).toBeVisible();
  await say("Coupons: an unknown code…", "store");
  await type(store, store.getByPlaceholder("Coupon code"), "SPICE20");
  await click(store, store.getByRole("button", { name: "Apply" }));
  await expect(store.getByText(/to use SPICE20/)).toBeVisible();
  await say("…a code with a minimum explains what's missing…", "store");
  await sleep(1200);
  await type(store, store.getByPlaceholder("Coupon code"), "WELCOME50");
  await click(store, store.getByRole("button", { name: "Apply" }));
  await expect(store.getByText("WELCOME50 applied", { exact: true })).toBeVisible();
  await say("…and the first-order welcome code applies", "store");
  await type(store, store.getByLabel("Note for the kitchen (optional)"), "Please ring the bell twice.");
  await click(store, store.getByRole("checkbox", { name: /Send me offers/ }));

  await store.getByLabel("Name").fill("");
  await click(store, store.getByRole("button", { name: /^Place order/ }));
  await expect(store.getByText("Enter your name.")).toBeVisible();
  await say("Missing details are flagged next to the field", "store");
  await type(store, store.getByLabel("Name"), "Arjun Menon");
  await expect(store.getByText("Enter your name.")).toHaveCount(0);
  await say("…and the message clears as soon as it's fixed", "store");
  await sleep(1500);

  await click(store, store.getByRole("button", { name: /^Place order/ }));
  await expect(store).toHaveURL(/\/pay$/);
  await say("Test-mode payment page — first the payment fails", "store");
  const token = store.url().split("/order/")[1]!.split("/")[0]!;
  await expect(admin.getByText("Arjun Menon")).toBeVisible({ timeout: 30_000 });
  await say("Admin sees it under “Awaiting payment” (not on the board)", "admin");
  await click(store, store.getByRole("button", { name: "Simulate failure" }));
  await expect(store.getByRole("heading", { name: "Payment didn't go through" })).toBeVisible();
  await say("No money taken, the order is held, and “Try again” is one tap", "store");
  await sleep(1800);
  await click(store, store.getByRole("button", { name: "Try again" }));
  await click(store, store.getByRole("button", { name: /^Pay / }));
  await expect(store.getByRole("heading", { name: /Order #\d+ confirmed/ })).toBeVisible();
  const number = Number((await store.getByRole("heading", { name: /Order #\d+ confirmed/ }).textContent())!.match(/#(\d+)/)![1]);
  s.save({ deliveryOrder: { token, number } });
  await say("Paid and confirmed", "store");
  await expect(admin.getByText("Arjun Menon")).toHaveCount(0, { timeout: 30_000 });
  await say("…and it leaves “Awaiting payment” for the kitchen board", "admin");
  await sleep(1500);
  await close();
});
