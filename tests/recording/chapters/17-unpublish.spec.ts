import { ensureSignedIn, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, refreshUntil, sleep, state } from "../lib/stage.ts";

chapter("17 Taking the storefront offline and back", async () => {
  const s = state<{ owner: TestPerson }>();
  const { admin, store, say, close } = await openStage("17-unpublish", "Taking the storefront offline and back",
    "Unpublishing shows customers “Coming soon”; publishing again restores the live store.");
  await store.goto(env.storefront);
  await ensureSignedIn(admin, s.owner, say);
  await admin.goto(`${env.admin}/settings/brand`);
  await expect(admin.getByRole("heading", { name: "Storefront status" })).toBeVisible();
  await say("Settings → Brand: the storefront can be unpublished at any time", "admin");
  await click(admin, admin.getByRole("button", { name: "Unpublish" }));
  await say("With a confirmation explaining the effect", "admin");
  await sleep(1200);
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Unpublish" }));
  await expect(admin.getByText("Storefront unpublished")).toBeVisible();
  let sec = await refreshUntil(store, store.getByText("Coming soon"));
  await say(`Customer side (${sec} s): “Coming soon”, no ordering`, "store");
  await sleep(1500);
  await click(admin, admin.getByRole("button", { name: "Publish" }));
  await expect(admin.getByText("Storefront published")).toBeVisible();
  sec = await refreshUntil(store, store.getByRole("link", { name: "Order direct" }));
  await say(`Published again — live after ${sec} s`, "store");
  await sleep(2000);
  await store.evaluate(() => (window as unknown as { __rosCard?: (k: string, h: string, b: string) => void }).__rosCard?.("The end", "Restaurant OS walkthrough", "Admin and storefront, recorded together against one live system."));
  await admin.evaluate(() => (window as unknown as { __rosCard?: (k: string, h: string, b: string) => void }).__rosCard?.("The end", "Restaurant OS walkthrough", "Admin and storefront, recorded together against one live system."));
  await sleep(3000);
  await close();
});
