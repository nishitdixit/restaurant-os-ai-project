import { chapter, click, env, expect, openStage, refreshUntil, sleep, type } from "../lib/stage.ts";

chapter("04 Delivery areas", async () => {
  const { admin, store, say, close } = await openStage("04-delivery-areas", "Delivery areas",
    "Pincode-based and distance-based delivery areas with fee, minimum order and delivery time; validation, edit, deactivate and remove.");

  await store.goto(`${env.storefront}/delivery-areas`);
  await say("Customer side: no delivery areas yet — pickup only", "store");
  await admin.goto(`${env.admin}/delivery`);
  await expect(admin.getByText("No delivery areas yet")).toBeVisible();
  await say("Delivery areas: where you deliver, the fee, the minimum order and the time", "admin");

  await click(admin, admin.getByRole("button", { name: "Add your first area" }));
  const modal = admin.getByRole("dialog");
  await type(admin, modal.getByLabel("Name"), "Indiranagar & nearby");
  await click(admin, modal.getByRole("button", { name: "Save" }));
  await say("Validation: a pincode area needs at least one pincode", "admin");
  await expect(modal.getByText("Add at least one pincode.")).toBeVisible();
  await sleep(1200);
  await type(admin, modal.getByLabel("Pincodes"), "560038, 560008, 560071, 560075");
  await type(admin, modal.getByLabel("Delivery fee"), "30");
  await type(admin, modal.getByLabel("Minimum order"), "199");
  await type(admin, modal.getByLabel("Delivery time from (min)"), "30");
  await type(admin, modal.getByLabel("to (min)"), "45");
  await click(admin, modal.getByRole("button", { name: "Save" }));
  await expect(admin.getByText("Delivery area saved")).toBeVisible();

  await click(admin, admin.getByRole("button", { name: "Add area" }));
  await type(admin, admin.getByRole("dialog").getByLabel("Name"), "Within 3 km");
  await admin.getByRole("dialog").getByLabel("Area defined by").selectOption("RADIUS");
  await say("A distance-based area: applies when the customer shares their location at checkout", "admin");
  await type(admin, admin.getByRole("dialog").getByLabel("Radius (km)"), "3");
  await type(admin, admin.getByRole("dialog").getByLabel("Delivery fee"), "20");
  await type(admin, admin.getByRole("dialog").getByLabel("Minimum order"), "149");
  await type(admin, admin.getByRole("dialog").getByLabel("Delivery time from (min)"), "20");
  await type(admin, admin.getByRole("dialog").getByLabel("to (min)"), "35");
  await click(admin, admin.getByRole("button", { name: "Save" }));
  await expect(admin.getByText("Within 3 km", { exact: true }).first()).toBeVisible();

  await click(admin, admin.getByRole("button", { name: "Add area" }));
  await type(admin, admin.getByRole("dialog").getByLabel("Name"), "Whitefield (trial)");
  await type(admin, admin.getByRole("dialog").getByLabel("Pincodes"), "560066");
  await type(admin, admin.getByRole("dialog").getByLabel("Delivery fee"), "80");
  await click(admin, admin.getByRole("button", { name: "Save" }));
  await expect(admin.getByText("Whitefield (trial)", { exact: true }).first()).toBeVisible();
  await say("Editing an area: lower the Indiranagar fee to ₹25", "admin");
  const indiranagar = admin.locator("section, div").filter({ has: admin.getByText("Indiranagar & nearby", { exact: true }) }).filter({ has: admin.getByRole("button", { name: "Edit" }) }).last();
  await click(admin, indiranagar.getByRole("button", { name: "Edit" }));
  await type(admin, admin.getByRole("dialog").getByLabel("Delivery fee"), "25");
  await click(admin, admin.getByRole("button", { name: "Save" }));
  await expect(admin.getByText("Delivery area saved")).toBeVisible();
  await say("Removing the trial area (with confirmation)", "admin");
  const trial = admin.locator("section, div").filter({ has: admin.getByText("Whitefield (trial)", { exact: true }) }).filter({ has: admin.getByRole("button", { name: "Remove" }) }).last();
  await click(admin, trial.getByRole("button", { name: "Remove" }));
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Remove" }));
  await expect(admin.getByText("Whitefield (trial)", { exact: true })).toHaveCount(0);

  await say("Customer side: the delivery-areas page lists fees, minimums and times", "store");
  await refreshUntil(store, store.getByText("Indiranagar & nearby"));
  await store.mouse.wheel(0, 400);
  await sleep(3000);
  await close();
});
