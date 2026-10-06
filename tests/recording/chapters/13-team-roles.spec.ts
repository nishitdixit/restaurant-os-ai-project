import { ensureSignedIn, expectAccountLoaded, person, signIn, signOut, signUp, type TestPerson } from "../lib/auth.ts";
import { chapter, click, env, expect, openStage, sleep, state, type } from "../lib/stage.ts";
import { addSimple, contact, placeAndPay } from "../lib/shop.ts";

chapter("13 Team and roles", async () => {
  const s = state<{ owner: TestPerson; kitchen: TestPerson }>();
  const kitchen = person("kitchen", "Ramesh", "Gowda", "01");
  s.save({ kitchen });
  const { admin, store, say, close } = await openStage("13-team-roles", "Team and roles",
    "The owner invites kitchen staff; the cook signs up and sees only what the Kitchen role allows; the owner changes the role, removes and restores access.",
    { freshStore: true });

  await ensureSignedIn(admin, s.owner, say);
  await admin.goto(`${env.admin}/settings/team`);
  await expect(admin.getByRole("heading", { name: "Team" })).toBeVisible();
  await say("Settings → Team: who can sign in, and what each role can do", "admin");
  await click(admin, admin.getByRole("button", { name: "Invite" }));
  const invite = admin.getByRole("dialog");
  await type(admin, invite.getByLabel("Email"), kitchen.email);
  await invite.getByLabel("Role").selectOption("KITCHEN");
  await click(admin, invite.getByRole("button", { name: "Send invite" }));
  await expect(admin.getByText("Invited", { exact: true })).toBeVisible();
  await say("Invited: Ramesh gets access when he signs in with that email", "admin");
  await sleep(1500);

  await say("Owner signs out; the cook signs up with the invited email", "admin");
  await signOut(admin);
  await signUp(admin, kitchen, "Ramesh's team");
  await expectAccountLoaded(admin);
  await expect(admin).toHaveURL(/\/orders/);
  await expect(admin.getByText(/cannot do this/)).toHaveCount(0);
  await say("Kitchen staff start straight on the order board", "admin");
  await sleep(1500);
  await say("Kitchen role: only Orders, Menu (stock on/off) and Messages in the sidebar", "admin");
  await sleep(2500);

  await click(admin, admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Menu" }));
  await expect(admin.getByRole("link", { name: "Add item" })).toHaveCount(0);
  await say("No editing of dishes or prices — but stock can be switched off and on", "admin");
  const naan = admin.getByRole("row").filter({ hasText: "Butter Naan" });
  await click(admin, naan.getByRole("switch"));
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Mark out of stock" }));
  await expect(admin.getByText("1 item marked out of stock")).toBeVisible();
  await click(admin, naan.getByRole("switch"));
  await expect(admin.getByText("1 item back in stock")).toBeVisible();

  await say("A customer orders while the cook is on shift", "store");
  await store.goto(`${env.storefront}/menu`);
  await addSimple(store, "Dal Makhani").catch(async () => { await addSimple(store, "Paneer Butter Masala"); });
  await store.goto(`${env.storefront}/checkout`);
  await click(store, store.getByRole("radio", { name: "Pickup" }));
  await contact(store, "Farah Ali", "9812345678");
  const order = await placeAndPay(store);

  await click(admin, admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Orders" }));
  const card = admin.locator("article").filter({ hasText: `#${order.number}` }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await click(admin, card.getByRole("button", { name: "Accept", exact: true }));
  await click(admin, card.getByRole("button", { name: "Start preparing", exact: true }));
  await click(admin, card.getByRole("button", { name: `Open order ${order.number}` }));
  await expect(admin.getByRole("dialog").getByRole("button", { name: "Mark ready" })).toBeVisible();
  await expect(admin.getByRole("dialog").getByRole("button", { name: "Cancel order" })).toHaveCount(0);
  await say("Once cooking has started, only an owner or manager can cancel — the button isn't offered to the cook", "admin");
  await sleep(2500);
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Mark ready" }));
  await admin.keyboard.press("Escape");

  await say("The cook signs out; the owner signs back in", "admin");
  await signOut(admin);
  await signIn(admin, s.owner);
  await expectAccountLoaded(admin);
  await admin.goto(`${env.admin}/settings/team`);
  const row = admin.getByRole("listitem").filter({ hasText: kitchen.email });
  await say("Change Ramesh's role to Staff (order board only)", "admin");
  await row.getByRole("combobox").selectOption("STAFF");
  await expect(admin.getByText("Team updated").first()).toBeVisible();
  await say("Remove access (with confirmation) — effective immediately", "admin");
  await click(admin, row.getByRole("button", { name: "Remove" }));
  await click(admin, admin.getByRole("dialog").getByRole("button", { name: "Remove access" }));
  await expect(row.getByText("Removed")).toBeVisible();
  await sleep(1200);
  await click(admin, row.getByRole("button", { name: "Restore" }));
  await expect(row.getByText("Removed")).toHaveCount(0);
  await say("…and restore it", "admin");
  await sleep(1500);
  await close();
});
