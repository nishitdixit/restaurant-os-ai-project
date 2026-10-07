import { ensureSignedIn, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, refreshUntil, sleep, state, type } from "../lib/stage.ts";

chapter("06b Appearance: complete styles, the homepage builder and a custom look", async () => {
  const s = state<{ owner: TestPerson }>();
  const { admin, store, say, close } = await openStage("06b-appearance", "Appearance: styles, homepage and a custom look",
    "Complete one-click styles (look + homepage + menu), the homepage builder with a banner photo and the restaurant's story, the readability guardrail, then publishing.");
  await store.goto(env.storefront);
  await ensureSignedIn(admin, s.owner, say);
  await click(admin, admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Appearance" }));
  await expect(admin.getByRole("heading", { name: "Appearance" })).toBeVisible();
  const preview = admin.frameLocator('iframe[title="Storefront preview"]');
  await expect(preview.locator("[data-section-type='hero']")).toBeVisible({ timeout: 30_000 });
  await say("Appearance: each style is a complete website for a kind of restaurant. On the right, a live preview of the real store", "admin");
  await sleep(1500);

  for (const [name, caption] of [
    ["Street Pop", "One click: Street Pop — loud, sticker badges, swipe rails, a deal banner first…"],
    ["Noir", "…Noir — dark, editorial serif, a full-screen photo and no discount banners…"],
    ["Saffron House", "…Saffron House for a biryani kitchen: family feasts, a photo beside the headline, a centered header"],
  ] as const) {
    await click(admin, admin.getByRole("button", { name: `Use the ${name} style (look and layout)` }));
    await say(caption, "admin");
    await sleep(2200);
  }
  await expect(admin.getByText("Draft saved · not live yet")).toBeVisible({ timeout: 10_000 });
  await say("Nothing is live yet — the look and layout are saved together as a private draft", "store");
  await sleep(1200);

  await click(admin, admin.getByRole("tab", { name: "Homepage" }));
  await say("Homepage: the sections, their order and layout — add, hide, reorder or edit any of them", "admin");
  await sleep(1500);
  await click(admin, admin.getByRole("button", { name: /^Hero banner/ }));
  await click(admin, admin.getByRole("button", { name: "Choose photo" }));
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: /^Use photo/ }).first());
  await type(admin, admin.getByLabel("Describe this photo"), "Chicken dum biryani in a copper handi", { clear: true });
  await admin.keyboard.press("Tab");
  await say("A banner photo from the library — with a description for screen readers, required before publishing", "admin");
  await expect(preview.locator("[data-section-type='hero'] img").first()).toBeVisible({ timeout: 20_000 });
  await sleep(2000);
  await click(admin, admin.getByRole("button", { name: /^Hero banner/ }));

  await click(admin, admin.getByRole("button", { name: /^Story/ }));
  await type(admin, admin.getByLabel("Title", { exact: true }), "Three generations of dum");
  await type(admin, admin.getByLabel("Your story"), "Our grandmother sealed her first handi in 1987. We still slow-cook every biryani the same way — basmati, whole spices and a dough-sealed pot.");
  await say("Their own story, in their own words — the preview scrolls to the section being edited", "admin");
  await expect(preview.getByText("Three generations of dum")).toBeVisible({ timeout: 20_000 });
  await sleep(2000);

  await click(admin, admin.getByRole("tab", { name: "Design" }));
  await say("Design: every colour, font, shape, depth and motion setting can still be refined", "admin");
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
  await say("Published — customers get the new look and homepage together", "admin");
  const sec = await refreshUntil(store, store.getByText("Three generations of dum"));
  await say(`Customer side: the new homepage after ${sec} s (store settings are cached briefly)`, "store");
  await sleep(1200);
  for (let i = 0; i < 4; i++) { await store.mouse.wheel(0, 450); await sleep(900); }

  await click(admin, admin.getByRole("tab", { name: "History" }));
  await expect(admin.getByText("Live", { exact: true })).toBeVisible();
  await say("History keeps every published version — look and layout together; any can be restored in one click", "admin");
  await sleep(2000);
  await close();
});
