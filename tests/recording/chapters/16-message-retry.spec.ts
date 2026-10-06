import { ensureSignedIn, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, restartWorker, sleep, state } from "../lib/stage.ts";
import { addSimple, contact, placeAndPay } from "../lib/shop.ts";

chapter("16 A failing message provider, retries and manual retry", async () => {
  const s = state<{ owner: TestPerson }>();
  // Restart the worker with the development provider set to fail every send (retries: 3 attempts).
  await restartWorker("fail");
  const { admin, store, say, close } = await openStage("16-message-retry", "When a message can't be delivered",
    "The messaging provider is down: sends are retried with back-off, then marked Failed and flagged; once it recovers, one click retries.",
    { freshStore: true });
  await ensureSignedIn(admin, s.owner, say);
  await admin.goto(`${env.admin}/messages`);
  await say("Simulated outage: the (test) messaging provider rejects every send", "admin");

  await store.goto(`${env.storefront}/menu`);
  await addSimple(store, "Butter Naan");
  await addSimple(store, "Paneer Butter Masala");
  await store.goto(`${env.storefront}/checkout`);
  await click(store, store.getByRole("radio", { name: "Pickup" }));
  await contact(store, "Isha Rao", "9822233344");
  const order = await placeAndPay(store);
  await say("The order itself is unaffected — confirmed and paid", "store");

  await say("The confirmation message is retried automatically with increasing waits…", "admin");
  const failedBanner = admin.getByText(/message(s)? failed after several retries/);
  await expect(async () => {
    await admin.reload();
    await expect(failedBanner).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 120_000, intervals: [5000] });
  await say("…then marked Failed and flagged at the top of Messages", "admin");
  await click(admin, admin.getByRole("button", { name: "Review" }));
  await sleep(1500);

  await restartWorker("succeed");
  await say("The provider recovers — retry the failed message", "admin");
  const failed = admin.locator("section").filter({ hasText: `Order #${order.number}` }).filter({ has: admin.getByRole("button", { name: "Retry" }) }).first();
  await click(admin, failed.getByRole("button", { name: "Retry" }));
  await expect(admin.getByText("Queued to send again")).toBeVisible();
  await click(admin, admin.getByRole("tab", { name: /^All/ }));
  await expect(async () => {
    await admin.reload();
    await expect(admin.locator("section").filter({ hasText: `Order #${order.number}` }).filter({ hasText: "Payment confirmed" }).getByText("Sent", { exact: true }).first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 90_000, intervals: [5000] });
  await say("Delivered on retry — and never sent twice", "admin");
  await sleep(2500);
  await close();
});
