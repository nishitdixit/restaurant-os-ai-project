// Storefront themes (ADR-012): draft → publish with a readability guardrail, version history and restore,
// strictly per restaurant.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { classicTheme, presetById } from "@restaurant-os/domain";
import { createMember, headers, PILOT_TENANT, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let verifier: Awaited<ReturnType<typeof startApp>>["verifier"];
let owner: string;
let staff: string;
let ownerB: string;
let tenantB: string;

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app, verifier } = await startApp());
  owner = (await createMember(PILOT_TENANT, "OWNER", "theme_owner")).token;
  staff = (await createMember(PILOT_TENANT, "STAFF", "theme_staff")).token;
  verifier.emails.set("theme_founder_b", "theme-founder@b.example");
  const created = await app.inject({ method: "POST", url: "/v1/restaurants", headers: { authorization: "Bearer user:theme_founder_b" }, payload: { businessName: "B Foods", brandName: "Bee Kitchen", brandSlug: "bee-kitchen", phone: "9876500000", city: "Pune" } });
  assert.equal(created.statusCode, 201, created.body);
  tenantB = created.json().tenantId;
  ownerB = "user:theme_founder_b";
});

const config = async (query = "") => (await app.inject(`/v1/storefront/pilot/config${query}`)).json();
const preview = async (slug = "pilot") => {
  const { issuePreviewToken } = await import("../src/lib/preview.ts");
  return `?preview=${issuePreviewToken(slug).token}`;
};

test("a restaurant without a theme renders the classic look in its brand colour", async () => {
  const c = await config();
  assert.deepEqual(c.theme, classicTheme("#b42318"));
  assert.equal(c.primaryColor, "#b42318");
  const res = await app.inject({ url: "/v1/admin/appearance", headers: headers(owner) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().draft, null);
  assert.deepEqual(res.json().check.errors, []);
});

test("drafts are private to the preview until published, then go live with history", async () => {
  const rapid = presetById("rapid")!.theme;
  const saved = await app.inject({ method: "PUT", url: "/v1/admin/appearance/draft", headers: headers(owner), payload: { theme: rapid } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().draft.presetId, "rapid");
  assert.equal((await config()).theme.presetId, "classic", "the live storefront is unchanged");
  assert.equal((await config(await preview())).theme.presetId, "rapid", "merchant preview sees the draft");
  assert.equal((await config("?preview=1")).theme.presetId, "classic", "an unsigned preview sees only the live look");

  const published = await app.inject({ method: "POST", url: "/v1/admin/appearance/publish", headers: headers(owner), payload: {} });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal(published.json().draft, null);
  assert.equal(published.json().versions.length, 1);
  const live = await config();
  assert.equal(live.theme.presetId, "rapid");
  assert.equal(live.primaryColor, rapid.colors.primary, "brand colour follows the theme");
  const settings = (await app.inject({ url: "/v1/admin/settings", headers: headers(owner) })).json();
  assert.equal(settings.brand.primaryColor, rapid.colors.primary);
});

test("an unreadable theme can be drafted but not published", async () => {
  const bad = { ...classicTheme(), colors: { ...classicTheme().colors, primary: "#ffe066", primaryText: "#ffffff" } };
  const saved = await app.inject({ method: "PUT", url: "/v1/admin/appearance/draft", headers: headers(owner), payload: { theme: bad } });
  assert.equal(saved.statusCode, 200);
  assert.ok(saved.json().check.errors.some((e: { key: string }) => e.key === "primaryText-primary"));
  const res = await app.inject({ method: "POST", url: "/v1/admin/appearance/publish", headers: headers(owner), payload: {} });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "THEME_NOT_READABLE");
  assert.ok(res.json().error.details.issues.length >= 1);
  assert.equal((await config()).theme.presetId, "rapid", "live theme untouched");
  const discarded = await app.inject({ method: "DELETE", url: "/v1/admin/appearance/draft", headers: headers(owner) });
  assert.equal(discarded.json().draft, null);
});

test("invalid theme values are rejected by validation", async () => {
  const injected = { ...classicTheme(), colors: { ...classicTheme().colors, primary: "red;}body{display:none" } };
  const res = await app.inject({ method: "PUT", url: "/v1/admin/appearance/draft", headers: headers(owner), payload: { theme: injected } });
  assert.equal(res.statusCode, 400);
  const badRadius = await app.inject({ method: "PUT", url: "/v1/admin/appearance/draft", headers: headers(owner), payload: { theme: { ...classicTheme(), shape: { ...classicTheme().shape, card: 400 } } } });
  assert.equal(badRadius.statusCode, 400);
});

test("an earlier version can be restored in one step", async () => {
  await app.inject({ method: "POST", url: "/v1/admin/appearance/publish", headers: headers(owner), payload: { theme: presetById("noir")!.theme } });
  let state = (await app.inject({ url: "/v1/admin/appearance", headers: headers(owner) })).json();
  assert.equal(state.versions.length, 2);
  assert.equal(state.versions[0].presetId, "noir");
  const rapidVersion = state.versions.find((v: { presetId: string }) => v.presetId === "rapid");
  const restored = await app.inject({ method: "POST", url: "/v1/admin/appearance/restore", headers: headers(owner), payload: { versionId: rapidVersion.id } });
  assert.equal(restored.statusCode, 200, restored.body);
  state = restored.json();
  assert.equal(state.published.presetId, "rapid");
  assert.equal(state.versions.length, 3);
  assert.equal((await config()).theme.presetId, "rapid");
});

test("only owners can change the look; staff can't even view it", async () => {
  assert.equal((await app.inject({ url: "/v1/admin/appearance", headers: headers(staff) })).statusCode, 403);
  const res = await app.inject({ method: "POST", url: "/v1/admin/appearance/publish", headers: headers(staff), payload: { theme: classicTheme() } });
  assert.equal(res.statusCode, 403);
});

test("themes are strictly per restaurant", async () => {
  const b = await app.inject({ method: "POST", url: "/v1/admin/appearance/publish", headers: headers(ownerB, tenantB), payload: { theme: presetById("sugar-bloom")!.theme } });
  assert.equal(b.statusCode, 200, b.body);
  assert.equal((await config()).theme.presetId, "rapid", "tenant A's storefront is unaffected");
  assert.equal((await app.inject(`/v1/storefront/bee-kitchen/config${await preview("bee-kitchen")}`)).json().theme.presetId, "sugar-bloom");
  // B's version ids are not usable from A.
  const bVersion = b.json().versions[0].id;
  const cross = await app.inject({ method: "POST", url: "/v1/admin/appearance/restore", headers: headers(owner), payload: { versionId: bVersion } });
  assert.equal(cross.statusCode, 404);
  assert.equal((await app.inject({ url: "/v1/admin/appearance", headers: headers(ownerB, PILOT_TENANT) })).statusCode, 403);
});
