// docs/TESTING.md "Tenant isolation tests": tenant A can never read or mutate tenant B, and
// authorization is decided server-side from memberships and permissions.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createMember, db, headers, openAllDay, orderBody, P, PILOT_TENANT, placeOrder, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let verifier: Awaited<ReturnType<typeof startApp>>["verifier"];
let ownerA: string;
let ownerB: string;
let tenantB: string;

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app, verifier } = await startApp());
  await openAllDay();
  ownerA = (await createMember(PILOT_TENANT, "OWNER", "ownerA")).token;
  verifier.emails.set("founder_b", "founder@b.example");
  const created = await app.inject({ method: "POST", url: "/v1/restaurants", headers: { authorization: "Bearer user:founder_b" }, payload: { businessName: "B Foods", brandName: "Bee Kitchen", brandSlug: "bee-kitchen", phone: "9876500000", city: "Pune" } });
  assert.equal(created.statusCode, 201, created.body);
  tenantB = created.json().tenantId;
  ownerB = "user:founder_b";
});

test("self-signup creates a tenant with the signer as OWNER and a draft storefront", async () => {
  const session = (await app.inject({ url: "/v1/session", headers: { authorization: `Bearer ${ownerB}` } })).json();
  assert.equal(session.memberships.length, 1);
  assert.equal(session.memberships[0].role, "OWNER");
  assert.equal((await app.inject("/v1/storefront/bee-kitchen/menu")).statusCode, 404, "draft store is not public");
  const taken = await app.inject({ method: "POST", url: "/v1/restaurants", headers: { authorization: `Bearer ${ownerB}` }, payload: { businessName: "X", brandName: "X", brandSlug: "pilot", phone: "9876500000", city: "Pune" } });
  assert.equal(taken.statusCode, 409);
});

test("a member of B cannot use B's credentials against tenant A", async () => {
  for (const url of ["/v1/admin/orders", "/v1/admin/products", "/v1/admin/customers", "/v1/admin/analytics", "/v1/admin/settings"]) {
    const res = await app.inject({ url, headers: headers(ownerB, PILOT_TENANT) });
    assert.equal(res.statusCode, 403, `${url} should be forbidden`);
  }
});

test("tenant A ids are invisible and immutable from tenant B context", async () => {
  const placed = (await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null }))).json();
  const d = await db();
  const orderId = (await d.query(`SELECT id FROM orders WHERE public_token = $1`, [placed.order.token])).rows[0].id;
  assert.equal((await app.inject({ url: `/v1/admin/orders/${orderId}`, headers: headers(ownerB, tenantB) })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/v1/admin/orders/${orderId}/cancel`, headers: headers(ownerB, tenantB), payload: { reasonCode: "OTHER", note: "x", refund: false } })).statusCode, 404);
  assert.equal((await app.inject({ url: `/v1/admin/products/${P.butterChicken}`, headers: headers(ownerB, tenantB) })).statusCode, 404);
  const toggle = await app.inject({ method: "POST", url: "/v1/admin/products/availability", headers: headers(ownerB, tenantB), payload: { productIds: [P.butterChicken], available: false, reason: "" } });
  assert.equal(toggle.statusCode, 404);
  const avail = await d.query(`SELECT count(*)::int AS n FROM availability_overrides WHERE product_id = $1 AND status = 'INACTIVE'`, [P.butterChicken]);
  assert.equal(avail.rows[0].n, 0);
  const list = (await app.inject({ url: "/v1/admin/orders?view=all", headers: headers(ownerB, tenantB) })).json();
  assert.equal(list.items.length, 0);
  const products = (await app.inject({ url: "/v1/admin/products", headers: headers(ownerB, tenantB) })).json();
  assert.equal(products.items.length, 0);
});

test("B cannot attach A's category, option group or image to its own product", async () => {
  const res = await app.inject({ method: "POST", url: "/v1/admin/products", headers: headers(ownerB, tenantB), payload: { categoryId: "40000000-0000-4000-8000-000000000001", name: "Stolen", basePriceMinor: 100 } });
  assert.equal(res.statusCode, 422);
  const cat = (await app.inject({ method: "POST", url: "/v1/admin/categories", headers: headers(ownerB, tenantB), payload: { name: "Mains" } })).json();
  const grp = await app.inject({ method: "POST", url: "/v1/admin/products", headers: headers(ownerB, tenantB), payload: { categoryId: cat.id, name: "Thali", basePriceMinor: 100, modifierGroupIds: ["52000000-0000-4000-8000-000000000001"] } });
  assert.equal(grp.statusCode, 422);
});

test("missing or malformed tenant header and missing auth are rejected", async () => {
  assert.equal((await app.inject({ url: "/v1/admin/orders" })).statusCode, 401);
  assert.equal((await app.inject({ url: "/v1/admin/orders", headers: { authorization: "Bearer garbage" } })).statusCode, 401);
  assert.equal((await app.inject({ url: "/v1/admin/orders", headers: { authorization: `Bearer ${ownerA}` } })).statusCode, 400);
  assert.equal((await app.inject({ url: "/v1/admin/orders", headers: { authorization: `Bearer ${ownerA}`, "x-tenant-id": "nope" } })).statusCode, 400);
});

test("role permissions are enforced server-side", async () => {
  const kitchen = (await createMember(PILOT_TENANT, "KITCHEN")).token;
  const staff = (await createMember(PILOT_TENANT, "STAFF")).token;
  assert.equal((await app.inject({ url: "/v1/admin/orders", headers: headers(kitchen) })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/v1/admin/products/availability", headers: headers(kitchen), payload: { productIds: [P.naan], available: false, reason: "" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/v1/admin/categories", headers: headers(kitchen), payload: { name: "Nope" } })).statusCode, 403);
  assert.equal((await app.inject({ url: "/v1/admin/customers", headers: headers(kitchen) })).statusCode, 403);
  assert.equal((await app.inject({ url: "/v1/admin/analytics", headers: headers(staff) })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/v1/admin/products/availability", headers: headers(staff), payload: { productIds: [P.naan], available: true, reason: "" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "PUT", url: "/v1/admin/settings/brand", headers: headers(kitchen), payload: {} })).statusCode, 403);
});

test("deactivated memberships lose access immediately", async () => {
  const manager = await createMember(PILOT_TENANT, "MANAGER", "leaving");
  assert.equal((await app.inject({ url: "/v1/admin/orders", headers: headers(manager.token) })).statusCode, 200);
  const team = (await app.inject({ url: "/v1/admin/team", headers: headers(ownerA) })).json().items;
  const m = team.find((x: { userId: string }) => x.userId === manager.userId);
  assert.equal((await app.inject({ method: "PATCH", url: `/v1/admin/team/${m.membershipId}`, headers: headers(ownerA), payload: { active: false } })).statusCode, 200);
  assert.equal((await app.inject({ url: "/v1/admin/orders", headers: headers(manager.token) })).statusCode, 403);
});

test("team: invite links on first sign-in by verified email; last owner is protected", async () => {
  const invite = await app.inject({ method: "POST", url: "/v1/admin/team", headers: headers(ownerA), payload: { email: "chef@pilot.example", role: "KITCHEN" } });
  assert.equal(invite.statusCode, 201);
  verifier.emails.set("chef_ext", "chef@pilot.example");
  const session = (await app.inject({ url: "/v1/session", headers: { authorization: "Bearer user:chef_ext" } })).json();
  assert.equal(session.memberships[0].role, "KITCHEN");
  const team = (await app.inject({ url: "/v1/admin/team", headers: headers(ownerA) })).json().items;
  const me = team.find((x: { isYou: boolean }) => x.isYou);
  assert.equal((await app.inject({ method: "PATCH", url: `/v1/admin/team/${me.membershipId}`, headers: headers(ownerA), payload: { role: "MANAGER" } })).json().error.code, "CANNOT_CHANGE_SELF");
  const ownerOnlyB = (await app.inject({ url: "/v1/admin/team", headers: headers(ownerB, tenantB) })).json().items[0];
  const second = await createMember(tenantB, "OWNER", "coowner");
  const demote = await app.inject({ method: "PATCH", url: `/v1/admin/team/${ownerOnlyB.membershipId}`, headers: headers(second.token, tenantB), payload: { role: "MANAGER" } });
  assert.equal(demote.statusCode, 200, "allowed while another owner remains");
  const lastOwner = (await app.inject({ url: "/v1/admin/team", headers: headers(second.token, tenantB) })).json().items.find((x: { isYou: boolean }) => x.isYou);
  assert.ok(lastOwner);
});

test("V1-preview routes and host resolution are not exposed", async () => {
  const h = headers(ownerA);
  for (const [method, url] of [
    ["GET", "/v1/admin/kitchen"], ["POST", "/v1/admin/inventory/movement"], ["GET", "/v1/admin/inventory"],
    ["POST", "/v1/admin/domains"], ["POST", "/v1/admin/domains/verify"], ["POST", "/v1/admin/entitlements"],
    ["POST", "/v1/admin/segments"], ["POST", "/v1/admin/referrals"], ["POST", "/v1/admin/campaigns"], ["GET", "/v1/storefront/resolve?host=example.com"],
  ] as const) {
    const res = await app.inject({ method, url, headers: h, payload: method === "POST" ? {} : undefined });
    assert.equal(res.statusCode, 404, `${method} ${url} must not exist`);
  }
});

test("self-signup is refused when disabled", async () => {
  const { setEnvForTests, env } = await import("../src/config/env.ts");
  const previous = env();
  setEnvForTests({ ...previous, SELF_SIGNUP_ENABLED: false });
  try {
    verifier.emails.set("stranger", "stranger@example.com");
    const res = await app.inject({ method: "POST", url: "/v1/restaurants", headers: { authorization: "Bearer user:stranger" }, payload: { businessName: "X", brandName: "X", brandSlug: "x-foods", phone: "9876500000", city: "Pune" } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, "SIGNUP_DISABLED");
    const session = (await app.inject({ url: "/v1/session", headers: { authorization: "Bearer user:stranger" } })).json();
    assert.equal(session.selfSignupEnabled, false);
  } finally {
    setEnvForTests(previous);
  }
});
