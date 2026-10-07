import { person, expectAccountLoaded, signUp, type TestPerson } from "../lib/auth.ts";
import { generateAssets } from "../lib/assets.ts";
import { previewUrl, chapter, click, env, expect, openStage, refreshUntil, saveAuth, sleep, state, type } from "../lib/stage.ts";
import { join } from "node:path";

chapter("01 Owner onboarding", async () => {
  const s = state<{ owner: TestPerson; ownerAuth: string; assets: Record<string, string> }>();
  const assets = await generateAssets(join(env.workDir, "assets"));
  const owner = person("owner", "Meera", "Iyer", "00");
  s.save({ owner, assets });

  const { admin, store, say, close, adminContext } = await openStage("01-onboarding", "Owner onboarding",
    "A restaurant owner signs up, creates her restaurant and lands on the setup checklist. The storefront isn't public yet.");

  await store.goto(env.storefront);
  await say("Storefront: no restaurant exists yet at this address", "store");

  await say("Meera, a restaurant owner, signs up for Restaurant OS", "admin");
  await signUp(admin, owner, "Spice Route Kitchen");
  await expectAccountLoaded(admin);

  await expect(admin.getByRole("heading", { name: "Set up your restaurant" })).toBeVisible();
  await say("New account, no restaurant yet → the setup form opens", "admin");
  await type(admin, admin.getByLabel("Business name"), "Spice Route Foods Pvt Ltd");
  await click(admin, admin.getByLabel("Restaurant / brand name"));
  await admin.getByLabel("Restaurant / brand name").fill("");
  await admin.getByLabel("Restaurant / brand name").pressSequentially("Spice Route Kitchen", { delay: 35 });
  await say("The web address is suggested from the brand name and can be edited", "admin");
  await type(admin, admin.getByLabel("Web address"), env.slug);
  await type(admin, admin.getByLabel("Kitchen phone"), "9845001234");
  await type(admin, admin.getByLabel("City"), "Bengaluru");
  await click(admin, admin.getByRole("button", { name: "Create restaurant" }));

  await expect(admin.getByRole("heading", { name: "Get your storefront live" })).toBeVisible();
  await say("Setup checklist: what's done, what's blocking, and Publish stays disabled until everything is ready", "admin");
  await admin.mouse.move(640, 420, { steps: 15 });
  await sleep(2500);
  await click(admin, admin.getByRole("button", { name: "Publish storefront" }).first()).catch(() => {});
  await sleep(800);

  // The storefront cached "no restaurant here" for up to ~30 s, so the visitor may need to refresh more than once.
  const seconds = await refreshUntil(store, store.getByText("Coming soon"));
  await say(`Storefront${seconds ? ` (after ${seconds} s of caching)` : ""}: the restaurant exists but isn't published — customers see “Coming soon”`, "store");
  await sleep(1500);
  await say("The owner can preview the unpublished storefront at any time", "both");
  await store.goto(previewUrl("/"));
  await expect(store.getByText(/Preview — not published yet/)).toBeVisible();
  await sleep(2500);

  s.save({ ownerAuth: await saveAuth(adminContext, "owner") });
  await close();
});
