import { chapter, click, env, expect, openStage, point, refreshUntil, sleep, type } from "../lib/stage.ts";

chapter("03 Kitchen address, ordering options and opening hours", async () => {
  const { admin, store, say, close } = await openStage("03-kitchen-hours", "Kitchen, ordering options and hours",
    "Kitchen address and map location, delivery/pickup switches, preparation time and the weekly opening-hours editor.");

  await store.goto(`${env.storefront}/contact`);
  await admin.goto(`${env.admin}/settings/outlet`);
  await expect(admin.getByRole("heading", { name: "Kitchen address" })).toBeVisible();
  await say("Settings → Kitchen & hours", "admin");

  await click(admin, admin.getByRole("button", { name: "Save", exact: true }));
  await say("Saving without an address: each missing field is flagged", "admin");
  await sleep(1500);

  await type(admin, admin.getByLabel("Address line 1"), "14, 12th Main, HAL 2nd Stage");
  await type(admin, admin.getByLabel("Address line 2"), "Indiranagar");
  await type(admin, admin.getByLabel("State"), "Karnataka");
  await type(admin, admin.getByLabel("Pincode"), "560038");
  await say("“Use this device's location” fills the map coordinates used for distance-based delivery", "admin");
  await click(admin, admin.getByRole("button", { name: /Use this device/ }));
  await expect(admin.getByLabel("Latitude (optional)")).toHaveValue(/12\.97/);
  await type(admin, admin.getByLabel("Usual preparation time (minutes)"), "25");

  await say("Opening hours: per day, with split shifts and “copy to all days”", "admin");
  const dayToggle = (day: string) => admin.getByText(day, { exact: true }).locator("xpath=preceding-sibling::button[@role='switch']");
  await click(admin, dayToggle("Sunday"));
  await say("Sunday switched off → closed on Sundays", "admin");
  await click(admin, dayToggle("Sunday"));
  await click(admin, admin.getByRole("button", { name: "Add a split shift on Friday" }));
  await say("Friday gets a second (evening) shift", "admin");
  await sleep(1200);
  await say("For this recording the kitchen is set to open all day, so ordering works whenever it is recorded", "admin");
  await type(admin, admin.getByLabel("Monday opens"), "00:00", { clear: false });
  await admin.getByLabel("Monday opens").fill("00:00");
  await admin.getByLabel("Monday closes").fill("23:59");
  await click(admin, admin.getByRole("button", { name: "Copy Monday to every day" }));
  await sleep(1000);
  await click(admin, admin.getByRole("button", { name: "Save", exact: true }));
  await expect(admin.getByText("Saved").first()).toBeVisible();

  await say("Customer side: contact page — address, directions and this week's hours", "store");
  await refreshUntil(store, store.getByText("Open now"));
  await point(store, store.getByRole("heading", { name: "Opening hours" }));
  await sleep(2500);
  await store.goto(env.storefront);
  await say("The home page now shows “Open now” and the pickup time", "store");
  await sleep(2500);
  await close();
});
