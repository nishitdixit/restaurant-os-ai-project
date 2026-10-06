import { chapter, click, env, expect, openStage, refreshUntil, sleep } from "../lib/stage.ts";

chapter("06 Publishing the storefront", async () => {
  const { admin, store, say, close } = await openStage("06-publish", "Publishing the storefront",
    "With every setup step complete, the owner publishes; the storefront goes live for customers.");

  await store.goto(env.storefront);
  await admin.goto(env.admin);
  await expect(admin.getByRole("heading", { name: "Get your storefront live" })).toBeVisible();
  await say("Every setup step is ticked, so Publish is now enabled", "admin");
  await sleep(1500);
  await click(admin, admin.getByRole("button", { name: "Publish storefront" }));
  await expect(admin.getByText("Your storefront is live!")).toBeVisible();
  await say("Published: the checklist disappears and the top bar says “View storefront”", "admin");
  await expect(admin.getByRole("heading", { name: "Get your storefront live" })).toHaveCount(0);
  await sleep(1500);

  await say("Customer side: leaving owner preview to see what the public sees", "store");
  await click(store, store.getByRole("link", { name: "Exit preview" }));
  const seconds = await refreshUntil(store, store.getByRole("link", { name: "Order direct" }));
  await say(`Live for everyone${seconds ? ` (appeared after ${seconds} s of caching)` : ""}: the public storefront`, "store");
  await expect(store.getByText(/Preview —/)).toHaveCount(0);
  for (let i = 0; i < 3; i++) { await store.mouse.wheel(0, 450); await sleep(900); }
  await close();
});
