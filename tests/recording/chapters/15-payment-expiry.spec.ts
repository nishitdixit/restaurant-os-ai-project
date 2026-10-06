import { ensureSignedIn, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, sleep, state } from "../lib/stage.ts";
import { addSimple, contact, orderPage, placeAndPay } from "../lib/shop.ts";

// The recording stack runs with PAYMENT_WINDOW_MINUTES=5 (the minimum) and the worker checks every minute.
// Part A shows the unpaid order; the ~6-minute wait is not recorded; part B shows the automatic cancellation.
chapter("15 Unpaid orders expire automatically", async () => {
  const s = state<{ owner: TestPerson; unpaid: { token: string; number: number } }>();
  {
    const { admin, store, say, close } = await openStage("15a-payment-expiry", "Unpaid orders expire (part 1)",
      "A customer places an order and leaves without paying. It waits under “Awaiting payment”, never on the kitchen board.",
      { freshStore: true });
    await ensureSignedIn(admin, s.owner, say);
    await admin.goto(`${env.admin}/orders?view=awaiting_payment`);
    await store.goto(`${env.storefront}/menu`);
    await addSimple(store, "Paneer Butter Masala");
    await store.goto(`${env.storefront}/checkout`);
    await click(store, store.getByRole("radio", { name: "Pickup" }));
    await contact(store, "Dev Patel", "9811122233");
    const unpaid = await placeAndPay(store, "leave");
    s.save({ unpaid });
    await say("The customer reaches the payment page… and closes it", "store");
    await sleep(1500);
    await orderPage(store, unpaid.token);
    await expect(store.getByRole("heading", { name: "Waiting for payment" })).toBeVisible();
    await say("Their order page: held until a set time, with “Pay now”", "store");
    await expect(admin.getByText("Dev Patel")).toBeVisible({ timeout: 30_000 });
    await say("Admin: it sits in “Awaiting payment” — never on the kitchen board", "admin");
    await sleep(3000);
    await close();
  }
  // Payment window (5 min) + worker interval (1 min) + margin.
  await new Promise((r) => setTimeout(r, 6.5 * 60_000));
  {
    const { admin, store, say, close } = await openStage("15b-payment-expiry", "Unpaid orders expire (part 2)",
      "Six minutes later: the order was cancelled automatically, coupon usage released, and both sides show why.");
    await orderPage(store, s.unpaid.token);
    await expect(store.getByRole("heading", { name: `Order #${s.unpaid.number} was cancelled` })).toBeVisible({ timeout: 90_000 });
    await say("Customer page: cancelled — “Payment not completed”", "store");
    await admin.goto(`${env.admin}/orders?view=awaiting_payment`);
    await expect(admin.getByText("Dev Patel")).toHaveCount(0);
    await say("Awaiting payment is empty again", "admin");
    await sleep(1500);
    await click(admin, admin.getByRole("tab", { name: "Cancelled" }));
    await click(admin, admin.getByRole("row").filter({ hasText: `#${s.unpaid.number}` }));
    await expect(admin.getByText("Payment window expired").first()).toBeVisible();
    await say("The order's activity records the automatic cancellation and its reason", "admin");
    await sleep(2500);
    await close();
  }
});
