import type { Page } from "@playwright/test";
import { chapter, click, env, expect, openStage, point, refreshUntil, sleep, state, type } from "../lib/stage.ts";

interface Item {
  name: string; category: string; price: string; description: string; dietary: "VEG" | "NON_VEG" | "EGG" | "VEGAN"; spice?: string;
  photo?: string; options?: string[]; tags?: string; allergens?: string; publish: boolean;
}

async function createItem(admin: Page, item: Item, assets: Record<string, string>) {
  await click(admin, admin.getByRole("link", { name: "Add item" }).first());
  await expect(admin.getByRole("heading", { name: "Add menu item" })).toBeVisible();
  await type(admin, admin.getByRole("textbox", { name: "Name", exact: true }), item.name);
  await admin.getByLabel("Category").selectOption({ label: item.category });
  await type(admin, admin.getByLabel("Price"), item.price);
  await type(admin, admin.getByRole("textbox", { name: "Short description", exact: true }), item.description);
  if (item.photo) {
    await point(admin, admin.getByRole("button", { name: /Add a photo/ }));
    await admin.locator('input[type="file"]').setInputFiles(assets[item.photo]!);
    await expect(admin.getByRole("button", { name: "Remove photo" })).toBeVisible();
  }
  for (const group of item.options ?? []) await click(admin, admin.getByRole("checkbox", { name: new RegExp(`^${group}`) }));
  await admin.getByLabel("Food type").selectOption(item.dietary);
  if (item.spice) await admin.getByLabel("Spice level").selectOption(item.spice);
  if (item.allergens) await type(admin, admin.getByLabel("Allergens"), item.allergens);
  if (item.tags) await type(admin, admin.getByLabel("Tags"), item.tags);
  await click(admin, admin.getByRole("button", { name: item.publish ? "Save & publish" : "Save as draft" }));
  await expect(admin.getByText(item.publish ? "Item added and published" : "Item saved as draft").first()).toBeVisible();
  await admin.goto(`${env.admin}/catalog`);
}

async function addCategory(admin: Page, name: string, description = "") {
  await click(admin, admin.getByRole("button", { name: "Add category" }));
  await type(admin, admin.getByRole("dialog").getByRole("textbox", { name: "Name", exact: true }), name);
  if (description) await type(admin, admin.getByRole("dialog").getByRole("textbox", { name: "Description", exact: true }), description);
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Save" }));
  await expect(admin.getByText("Category saved").first()).toBeVisible();
}

async function addGroup(admin: Page, name: string, required: boolean, max: string, options: [string, string][]) {
  await click(admin, admin.getByRole("button", { name: "New option group" }));
  const d = admin.getByRole("dialog");
  await type(admin, d.getByLabel("Group name"), name);
  if (required) await click(admin, d.getByRole("switch", { name: "Customer must choose" }));
  await type(admin, d.getByLabel("Customer can choose up to"), max);
  for (const [i, [label, price]] of options.entries()) {
    if (i > 0) await click(admin, d.getByRole("button", { name: "Add option" }));
    await type(admin, d.getByLabel(`Option ${i + 1} name`), label);
    await type(admin, d.getByLabel(`Option ${i + 1} extra price`), price);
  }
  await click(admin, d.getByRole("button", { name: "Save" }));
  await expect(admin.getByText("Option group saved").first()).toBeVisible();
}

chapter("05 Menu building", async () => {
  const s = state<{ assets: Record<string, string> }>();
  const { admin, store, say, close } = await openStage("05-menu-building", "Building the menu",
    "Categories, option groups (portion size, add-ons), items with photos, food type and spice; drafts vs published; duplicate, reorder and bulk publish.");

  await store.goto(`${env.storefront}/menu`);
  await say("Customer side (preview): the menu is empty", "store");
  await admin.goto(`${env.admin}/catalog`);
  await expect(admin.getByText("Start with a category")).toBeVisible();
  await say("Menu: an empty state explains the first step", "admin");
  await click(admin, admin.getByRole("link", { name: "Add a category" }));

  await say("Categories group dishes and each gets its own page for search engines", "admin");
  await addCategory(admin, "Biryani", "Dum-cooked to order with aged basmati.");
  await addCategory(admin, "Curries");
  await addCategory(admin, "Breads");
  await addCategory(admin, "Drinks");
  await addCategory(admin, "Desserts");
  await say("Reordering: move Breads above Curries", "admin");
  await click(admin, admin.getByRole("button", { name: "Move Breads up" }));
  await sleep(800);
  await click(admin, admin.getByRole("button", { name: "Move Breads down" }));
  await say("Hide a category from the storefront without deleting it", "admin");
  const desserts = admin.getByRole("listitem").filter({ hasText: "Desserts" });
  await click(admin, desserts.getByRole("button", { name: "Edit" }));
  await click(admin, admin.getByRole("dialog").getByRole("switch", { name: "Visible on the storefront" }));
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Save" }));
  await expect(desserts.getByText("Hidden")).toBeVisible();
  await say("…or delete an empty one (with confirmation)", "admin");
  await click(admin, admin.getByRole("button", { name: "Delete Desserts" }));
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Delete" }));
  await expect(admin.getByText("Desserts")).toHaveCount(0);

  await click(admin, admin.getByRole("tab", { name: "Option groups" }));
  await say("Option groups are defined once and attached to any dish", "admin");
  await addGroup(admin, "Portion", true, "1", [["Regular", "0"], ["Family pack (serves 3)", "350"]]);
  await addGroup(admin, "Add-ons", false, "2", [["Extra raita", "30"], ["Boiled egg", "25"], ["Mirchi ka salan", "40"]]);

  await click(admin, admin.getByRole("tab", { name: "Items" }));
  await say("Adding dishes: photo, price, description, options, food type and spice level", "admin");
  await createItem(admin, { name: "Chicken Dum Biryani", category: "Biryani", price: "329", description: "Slow-cooked basmati and chicken, with raita and salan.", dietary: "NON_VEG", spice: "2", photo: "chicken-biryani", options: ["Portion", "Add-ons"], tags: "bestseller", publish: true }, s.assets);
  await createItem(admin, { name: "Veg Dum Biryani", category: "Biryani", price: "269", description: "Seasonal vegetables and basmati, dum-cooked with whole spices.", dietary: "VEG", spice: "1", photo: "veg-biryani", options: ["Portion", "Add-ons"], publish: true }, s.assets);
  await say("Faster entry: the remaining dishes", "admin");
  await createItem(admin, { name: "Paneer Butter Masala", category: "Curries", price: "279", description: "Cottage cheese in a rich tomato and butter gravy.", dietary: "VEG", spice: "1", photo: "paneer-butter-masala", allergens: "dairy", publish: true }, s.assets);
  await createItem(admin, { name: "Dal Makhani", category: "Curries", price: "219", description: "Black lentils simmered overnight with butter.", dietary: "VEG", spice: "0", photo: "dal-makhani", allergens: "dairy", publish: true }, s.assets);
  await createItem(admin, { name: "Butter Naan", category: "Breads", price: "59", description: "Tandoor-baked bread brushed with butter.", dietary: "VEG", photo: "butter-naan", publish: true }, s.assets);
  await say("Saved as a draft: it stays hidden from customers", "admin");
  await createItem(admin, { name: "Mango Lassi", category: "Drinks", price: "119", description: "Alphonso mango and chilled yoghurt.", dietary: "VEG", photo: "mango-lassi", allergens: "dairy", publish: false }, s.assets);

  await say("Duplicate a dish to create a similar one quickly (the copy starts as a draft)", "admin");
  await click(admin, admin.getByRole("button", { name: "Duplicate Chicken Dum Biryani" }));
  await expect(admin.getByRole("heading", { name: "Chicken Dum Biryani (copy)" })).toBeVisible();
  await type(admin, admin.getByRole("textbox", { name: "Name", exact: true }), "Hyderabadi Mutton Biryani");
  await type(admin, admin.getByLabel("Price"), "429");
  await type(admin, admin.getByRole("textbox", { name: "Short description", exact: true }), "Tender mutton layered with saffron rice.");
  await click(admin, admin.getByRole("button", { name: "Save as draft" }));
  await expect(admin.getByText("Item saved").first()).toBeVisible();

  await admin.goto(`${env.admin}/catalog`);
  await say("Reorder dishes within a category", "admin");
  await click(admin, admin.getByRole("button", { name: "Move Veg Dum Biryani up" }));
  await say("Bulk actions: select the two drafts and publish them together", "admin");
  for (const name of ["Mango Lassi", "Hyderabadi Mutton Biryani"]) {
    await click(admin, admin.getByRole("row").filter({ hasText: name }).getByRole("checkbox", { name: "Select row" }));
  }
  await expect(admin.getByText("2 selected")).toBeVisible();
  await click(admin, admin.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Publish", exact: true }));
  await expect(admin.getByText("2 items published")).toBeVisible();

  await say("Customer side: the menu appears with photos, food-type marks and spice levels", "store");
  await refreshUntil(store, store.getByRole("link", { name: "Mango Lassi", exact: true }));
  await store.mouse.move(215, 400, { steps: 8 });
  for (let i = 0; i < 4; i++) { await store.mouse.wheel(0, 500); await sleep(900); }
  await close();
});
