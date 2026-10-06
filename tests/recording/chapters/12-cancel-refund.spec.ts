import { chapter, click, env, expect, openStage, sleep, state, type } from "../lib/stage.ts";
import { addWithOptions, address, contact, orderPage, placeAndPay } from "../lib/shop.ts";

chapter("12 Cancellations, refunds, notes and reordering", async () => {
  const s = state<{ deliveryOrder: { token: string; number: number } }>();
  const { admin, store, say, close } = await openStage("12-cancel-refund", "Cancellations, refunds, notes and reordering",
    "Cancelling a paid order with a reason and refund, a partial refund, internal notes, and the customer reordering a past order.",
    { freshStore: true });

  await admin.goto(`${env.admin}/orders`);
  await store.goto(`${env.storefront}/menu`);
  await say("Another customer, Neha, orders a biryani", "store");
  await addWithOptions(store, "Chicken Dum Biryani");
  await store.goto(`${env.storefront}/checkout`);
  await contact(store, "Neha Kapoor", "9123456780");
  await address(store, "41, 7th Main, HAL 2nd Stage", "560008");
  const order = await placeAndPay(store);
  await expect(admin.getByText(`New order #${order.number}`)).toBeVisible({ timeout: 30_000 });

  await say("The kitchen has run out of chicken: open the order and cancel it", "admin");
  await click(admin, admin.locator("article").filter({ hasText: `#${order.number}` }).getByRole("button", { name: `Open order ${order.number}` }));
  const drawer = admin.getByRole("dialog");
  await click(admin, drawer.getByRole("button", { name: "Cancel order" }));
  const cancel = admin.getByRole("dialog", { name: /Cancel order #/ });
  await cancel.getByLabel("Reason").selectOption({ label: "Item unavailable" });
  await type(admin, cancel.getByLabel("Note (optional)"), "Chicken finished for the night");
  await say("A reason is required; the full refund is ticked by default", "admin");
  await sleep(1500);
  await click(admin, cancel.getByRole("button", { name: "Cancel order" }));
  await expect(admin.getByText(`Order #${order.number} cancelled and refunded`)).toBeVisible();
  await expect(store.getByRole("heading", { name: `Order #${order.number} was cancelled` })).toBeVisible({ timeout: 30_000 });
  await say("Customer page updates: cancelled, the reason, and the refund amount", "store");
  await sleep(2500);
  await admin.keyboard.press("Escape");

  const d = s.deliveryOrder;
  await say(`A partial refund on a completed order (#${d.number}): the naan arrived cold`, "admin");
  await click(admin, admin.getByRole("tab", { name: "Completed" }));
  await click(admin, admin.getByRole("row").filter({ hasText: `#${d.number}` }));
  const details = admin.getByRole("dialog");
  await click(admin, details.getByRole("button", { name: "Issue partial refund" }));
  const refund = admin.getByRole("dialog", { name: "Issue a refund" });
  await type(admin, refund.getByLabel("Amount"), "40");
  await type(admin, refund.getByLabel("Reason"), "Naan arrived cold");
  await click(admin, refund.getByRole("button", { name: "Refund" }));
  await expect(admin.getByText("Refund issued").first()).toBeVisible();
  await say("Refunds are recorded separately; the order's history shows who, when and why", "admin");
  await type(admin, details.getByLabel("Internal note"), "Called customer to apologise; offered a free lassi next time.");
  await click(admin, details.getByRole("button", { name: "Add", exact: true }));
  await expect(details.getByText(/Called customer to apologise/)).toBeVisible();
  await say("Internal notes stay on the order for the team", "admin");
  await details.getByText("Activity").scrollIntoViewIfNeeded();
  await sleep(2000);
  await admin.keyboard.press("Escape");

  await orderPage(store, d.token);
  await say("Arjun's order page shows the ₹40 refund; he taps “Order again”", "store");
  await store.getByText("Refunded").first().scrollIntoViewIfNeeded();
  await sleep(1500);
  await click(store, store.getByRole("button", { name: "Order again" }));
  await expect(store.getByRole("heading", { name: "Your order" })).toBeVisible();
  await say("The same dishes go back into the cart — prices are checked again at checkout", "store");
  await sleep(2000);
  await click(store, store.getByRole("button", { name: "Go to checkout" }));
  await expect(store.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await sleep(2500);
  await close();
});
