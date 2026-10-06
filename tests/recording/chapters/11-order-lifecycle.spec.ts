import type { Page } from "@playwright/test";
import { chapter, click, env, expect, openStage, sleep, state, type } from "../lib/stage.ts";
import { addSimple, contact, orderPage, placeAndPay } from "../lib/shop.ts";

const card = (admin: Page, n: number) => admin.locator("article").filter({ hasText: `#${n}` }).first();

chapter("11 Order lifecycle with live customer updates", async () => {
  const s = state<{ deliveryOrder: { token: string; number: number }; pickupOrder: { token: string; number: number } }>();
  const { admin, store, say, close } = await openStage("11-order-lifecycle", "From new order to delivered",
    "New-order alert on the board, accept → preparing → ready → dispatch with a rider; a failed delivery and reassignment; delivered — while the customer's order page updates by itself. Plus a pickup order through to collected.",
    { freshStore: true });

  await admin.goto(`${env.admin}/orders`);
  await expect(admin.getByRole("heading", { name: "Orders" })).toBeVisible();
  await click(admin, admin.getByRole("button", { name: "Turn on sound" }));
  await say("Order board: paid orders by stage, refreshing every 10 s with a sound for new ones", "admin");

  await say("Meanwhile a customer orders for pickup…", "store");
  await store.goto(`${env.storefront}/menu`);
  await addSimple(store, "Paneer Butter Masala");
  await addSimple(store, "Butter Naan");
  await store.goto(`${env.storefront}/checkout`);
  await click(store, store.getByRole("radio", { name: "Pickup" }));
  await contact(store, "Kabir Shah", "9988776655");
  const pickup = await placeAndPay(store);
  s.save({ pickupOrder: pickup });
  await expect(admin.getByText(`New order #${pickup.number}`)).toBeVisible({ timeout: 30_000 });
  await say(`New paid order #${pickup.number} arrives on the board within seconds — toast, sound and a new card`, "admin");
  await sleep(2000);

  const d = s.deliveryOrder;
  await orderPage(store, d.token);
  await say(`Now the customer watches Arjun's delivery order #${d.number}`, "store");
  await say(`Kitchen works through #${d.number}: one button per step`, "admin");
  for (const [button, status] of [["Accept", "Accepted by the restaurant"], ["Start preparing", "Being prepared"], ["Mark ready", "Ready"]] as const) {
    await click(admin, card(admin, d.number).getByRole("button", { name: button, exact: true }));
    await expect(store.getByText(status).first()).toBeVisible({ timeout: 30_000 });
    await say(`Customer page updates by itself: “${status}”`, "store");
  }

  await click(admin, card(admin, d.number).getByRole("button", { name: "Dispatch…" }));
  const drawer = admin.getByRole("dialog");
  await expect(drawer.getByRole("button", { name: "Dispatch", exact: true })).toBeVisible();
  await say("Order details: customer, address with a Maps link, items, totals and full activity", "admin");
  await sleep(1500);
  await click(admin, drawer.getByRole("button", { name: "Dispatch", exact: true }));
  const dispatch = admin.getByRole("dialog", { name: /Dispatch order/ });
  await type(admin, dispatch.getByLabel("Rider name"), "Ravi Kumar");
  await type(admin, dispatch.getByLabel("Rider phone"), "9000011111");
  await click(admin, dispatch.getByRole("button", { name: "Dispatch" }));
  await expect(admin.getByText(/dispatched with Ravi Kumar/)).toBeVisible();
  await expect(store.getByText(/With Ravi Kumar/)).toBeVisible({ timeout: 30_000 });
  await say("“Out for delivery” with the rider's name and number", "store");

  await say("The rider can't reach the customer: mark the delivery failed (a note is required)", "admin");
  const details = admin.getByRole("dialog").first();
  await click(admin, details.getByRole("button", { name: "Delivery failed" }));
  const fail = admin.getByRole("dialog", { name: "Mark delivery as failed?" });
  await type(admin, fail.getByLabel("What happened?"), "Customer unreachable at the gate");
  await click(admin, fail.getByRole("button", { name: "Mark failed" }));
  await expect(admin.getByText("Delivery failed").first()).toBeVisible();
  await click(admin, details.getByRole("button", { name: "Reassign rider" }));
  const reassign = admin.getByRole("dialog", { name: /Dispatch order/ });
  await type(admin, reassign.getByLabel("Rider name"), "Suresh B");
  await type(admin, reassign.getByLabel("Rider phone"), "9000022222");
  await click(admin, reassign.getByRole("button", { name: "Dispatch" }));
  await say("Reassigned to another rider", "admin");
  await click(admin, details.getByRole("button", { name: "Rider picked up" }));
  await sleep(1200);
  await click(admin, details.getByRole("button", { name: "Mark completed" }));
  await expect(store.getByRole("heading", { name: "Delivered — enjoy your meal!" })).toBeVisible({ timeout: 30_000 });
  await say("Delivered: the customer's page shows the full timeline", "store");
  await sleep(1500);
  await admin.keyboard.press("Escape");

  await orderPage(store, pickup.token);
  await say(`Pickup order #${pickup.number}: accept, prepare, ready, collected`, "admin");
  for (const button of ["Accept", "Start preparing", "Mark ready", "Collected"]) {
    await click(admin, card(admin, pickup.number).getByRole("button", { name: button, exact: true }));
    await sleep(900);
  }
  await expect(store.getByRole("heading", { name: "Collected — enjoy!" })).toBeVisible({ timeout: 30_000 });
  await say("Customer page: “Collected — enjoy!”", "store");
  await sleep(1500);
  await click(admin, admin.getByRole("tab", { name: "Completed" }));
  await say("Completed orders move to their own tab", "admin");
  await sleep(2000);
  await close();
});
