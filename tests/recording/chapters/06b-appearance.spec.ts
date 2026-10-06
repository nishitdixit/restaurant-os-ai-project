import { ensureSignedIn, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, refreshUntil, sleep, state, type } from "../lib/stage.ts";

chapter("06b Appearance: one-click styles and a custom look", async () => {
  const s = state<{ owner: TestPerson }>();
  const { admin, store, say, close } = await openStage("06b-appearance", "Appearance: styles and a custom look",
    "Twelve ready-made styles applied in one click, fine-tuning with a live preview, the readability guardrail, then publishing.");
  await store.goto(env.storefront);
  await ensureSignedIn(admin, s.owner, say);
  await click(admin, admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Appearance" }));
  await expect(admin.getByRole("heading", { name: "Appearance" })).toBeVisible();
  const preview = admin.frameLocator('iframe[title="Storefront preview"]');
  await expect(preview.getByRole("link", { name: "Order direct" }).first()).toBeVisible({ timeout: 30_000 });
  await say("Appearance: the store's look. On the right, a live preview of the real store", "admin");
  await sleep(1500);

  for (const [name, caption] of [
    ["Street Pop", "One click applies a complete style — Street Pop for street food…"],
    ["Noir", "…Noir, a dark look for fine dining…"],
    ["Fresh Bowl", "…Fresh Bowl for healthy food. Each preview uses this restaurant's own name and dishes"],
    ["Saffron House", "Saffron House suits a biryani kitchen"],
  ] as const) {
    await click(admin, admin.getByRole("button", { name: new RegExp(`^Apply ${name}`) }));
    await say(caption, "admin");
    await sleep(1600);
  }
  await expect(admin.getByText("Draft saved · not live yet")).toBeVisible({ timeout: 10_000 });
  await say("Nothing is live yet — edits are saved as a private draft", "store");
  await sleep(1200);

  await click(admin, admin.getByRole("tab", { name: "Customise" }));
  await say("Customise: every colour, font, shape and component style", "admin");
  await click(admin, admin.getByText("Components", { exact: true }));
  await click(admin, admin.getByRole("radiogroup", { name: "Dish layout" }).getByRole("radio", { name: "Photo grid" }));
  await say("Dishes as a photo grid…", "admin");
  await sleep(1200);
  await click(admin, admin.getByRole("radiogroup", { name: "Main buttons" }).getByRole("radio", { name: "Outline" }));
  await say("…outline buttons", "admin");
  await sleep(1200);
  await click(admin, admin.getByText("Shape", { exact: true }));
  await click(admin, admin.getByRole("radiogroup", { name: "Border thickness" }).getByRole("radio", { name: "Bold (2px)" }));
  await sleep(800);

  await say("Guardrail: a pale brand colour would make buttons unreadable…", "admin");
  await type(admin, admin.getByLabel("Brand colour (buttons)", { exact: true }), "#ffd966");
  await expect(admin.getByText(/readability issue/)).toBeVisible();
  await expect(admin.getByRole("button", { name: "Publish" })).toBeDisabled();
  await say("…so publishing is blocked, with the reason and a one-click fix", "admin");
  await sleep(2200);
  await click(admin, admin.getByRole("button", { name: "Fix all" }));
  await expect(admin.getByText(/readability issue/)).toHaveCount(0);
  await say("Fixed in one click: the button text switches to a readable colour, keeping the chosen brand colour", "admin");
  await sleep(1500);

  await click(admin, admin.getByRole("button", { name: "Publish" }));
  await expect(admin.getByText("Your new look is live")).toBeVisible();
  await say("Published — customers get the new look", "admin");
  const sec = await refreshUntil(store, store.locator('html[data-ros-cards="grid"]'));
  await say(`Customer side: the new style after ${sec} s (store settings are cached briefly)`, "store");
  await sleep(1500);
  await store.goto(`${env.storefront}/menu`);
  await say("Menu in the new photo-grid layout", "store");
  await store.mouse.wheel(0, 500);
  await sleep(2000);

  await click(admin, admin.getByRole("tab", { name: "History" }));
  await expect(admin.getByText("Live", { exact: true })).toBeVisible();
  await say("History keeps every published look; any can be restored in one click", "admin");
  await sleep(2000);
  await close();
});
