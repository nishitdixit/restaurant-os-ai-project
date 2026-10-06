import { chapter, click, env, expect, openStage, point, refreshUntil, sleep, state, type } from "../lib/stage.ts";

chapter("02 Business details, brand and theme", async () => {
  const s = state<{ assets: Record<string, string> }>();
  const { admin, store, say, close } = await openStage("02-brand-theme", "Business details, brand and theme",
    "Business details, then the brand: logo, tagline, story, cuisines and order links — and the storefront updates.");

  await store.goto(`${env.storefront}/?preview=1`);
  await admin.goto(`${env.admin}/settings`);
  await expect(admin.getByRole("heading", { name: "Business details" })).toBeVisible();
  await say("Settings → Business: legal details and the primary contact (not shown publicly)", "admin");
  await type(admin, admin.getByLabel("Legal name (optional)"), "Spice Route Foods Private Limited");
  await type(admin, admin.getByLabel("GSTIN (optional)"), "29ABCDE1234F1Z5");
  await type(admin, admin.getByLabel("Primary contact"), "Meera Iyer");
  await type(admin, admin.getByLabel("Contact phone"), "9845001234");
  await type(admin, admin.getByLabel("Contact email"), "meera@spiceroute.example");
  await click(admin, admin.getByRole("button", { name: "Save", exact: true }));
  await expect(admin.getByText("Saved").first()).toBeVisible();

  await click(admin, admin.getByRole("link", { name: "Brand & storefront" }));
  await expect(admin.getByRole("heading", { name: "Storefront status" })).toBeVisible();
  await say("Brand & storefront: everything customers see", "admin");
  await point(admin, admin.getByRole("button", { name: "Upload logo" }).first());
  await admin.locator('input[type="file"]').setInputFiles(s.assets.logo!);
  await expect(admin.locator('img[alt="Logo"]')).toBeVisible();
  await say("Logo uploaded (type is checked from the file itself, max 5 MB)", "admin");
  await type(admin, admin.getByLabel("Tagline"), "Slow-cooked biryanis and North Indian curries, delivered hot");
  await type(admin, admin.getByLabel("About", { exact: true }), "Spice Route is a delivery kitchen in Indiranagar. Every biryani is dum-cooked to order, curries are made fresh each morning, and breads come straight from the tandoor.");
  await type(admin, admin.getByLabel("Cuisines"), "Biryani, North Indian, Mughlai");
  await type(admin, admin.getByLabel("WhatsApp number"), "9845001234");
  await type(admin, admin.getByLabel("Swiggy page URL"), "swiggy spice route");
  await click(admin, admin.getByRole("button", { name: "Save brand" }));
  await expect(admin.getByText("Please fix the highlighted fields.")).toBeVisible();
  await say("Validation: links must be full web addresses — the field explains what's wrong", "admin");
  await sleep(1200);
  await type(admin, admin.getByLabel("Swiggy page URL"), "https://www.swiggy.com/restaurants/spice-route-kitchen");
  await type(admin, admin.getByLabel("Zomato page URL"), "https://www.zomato.com/bangalore/spice-route-kitchen");
  await type(admin, admin.getByLabel("Instagram URL"), "https://instagram.com/spiceroutekitchen");
  await click(admin, admin.getByRole("button", { name: "Save brand" }));
  await expect(admin.getByText("Saved").first()).toBeVisible();

  await say("Customer side: store settings are cached for up to ~30 s, so the customer refreshes…", "store");
  const seconds = await refreshUntil(store, store.getByText("Slow-cooked biryanis and North Indian curries, delivered hot"));
  await say(`…and after ${seconds} s the logo, tagline and order links appear`, "store");
  await store.mouse.move(215, 320, { steps: 10 });
  await sleep(2500);
  await store.getByRole("link", { name: "Swiggy", exact: true }).first().scrollIntoViewIfNeeded();
  await sleep(1500);
  await store.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  await say("The footer and contact links come from the same settings", "store");
  await sleep(2000);
  await close();
});
