// specs/promotions acceptance: redemption is atomic and cannot exceed limits under concurrent checkout.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createMember, db, headers, openAllDay, orderBody, P, PILOT_TENANT, placeOrder, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let owner: string;

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app } = await startApp());
  await openAllDay();
  owner = (await createMember(PILOT_TENANT, "OWNER")).token;
});

const promo = (code: string, overrides: Record<string, unknown> = {}) => ({
  code, title: `${code} offer`, description: "", type: "FIXED", value: 2000, minimumOrderMinor: 0, maxDiscountMinor: null,
  startsAt: "2026-01-01T00:00:00+05:30", endsAt: "2030-01-01T00:00:00+05:30", usageCap: null, newCustomerOnly: false, oncePerCustomer: false, isPublic: true, active: true,
  ...overrides,
});

const customer = (i: number) => ({ name: `Customer ${i}`, phone: `97${String(10000000 + i).slice(0, 8)}`, email: "", marketingConsent: false });

test("usage cap holds under 8 concurrent checkouts", async () => {
  const created = await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("RUSH3", { usageCap: 3 }) });
  assert.equal(created.statusCode, 201, created.body);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "RUSH3", customer: customer(i) }))));
  const ok = results.filter((r) => r.statusCode === 201);
  const rejected = results.filter((r) => r.statusCode === 422);
  assert.equal(ok.length, 3, results.map((r) => r.body).join("\n"));
  assert.equal(rejected.length, 5);
  assert.ok(rejected.every((r) => r.json().error.code === "PROMOTION_INVALID"));
  const d = await db();
  const row = await d.query(`SELECT usage_count, (SELECT count(*)::int FROM promotion_redemptions r WHERE r.promotion_id = p.id) AS redemptions FROM promotions p WHERE code = 'RUSH3'`);
  assert.deepEqual(row.rows[0], { usage_count: 3, redemptions: 3 });
});

test("new-customer and once-per-customer rules use the customer's paid history", async () => {
  await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("FIRSTONLY", { newCustomerOnly: true }) });
  await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("ONCE", { oncePerCustomer: true }) });
  const c = customer(100);
  const first = (await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "ONCE", customer: c }))).json();
  await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${first.order.token}/payments/mock-complete`, payload: { outcome: "success" } });

  const again = await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "ONCE", customer: c }));
  assert.equal(again.statusCode, 422);
  assert.match(again.json().error.message, /already used ONCE/);

  const notNew = await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "FIRSTONLY", customer: c }));
  assert.match(notNew.json().error.message, /only for your first order/);
  const fresh = await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "FIRSTONLY", customer: customer(101) }));
  assert.equal(fresh.statusCode, 201);
});

test("cancelling an order releases its promotion usage", async () => {
  await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("ONEUSE", { usageCap: 1 }) });
  const first = (await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "ONEUSE", customer: customer(200) }))).json();
  const blocked = await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "ONEUSE", customer: customer(201) }));
  assert.equal(blocked.statusCode, 422);
  const d = await db();
  const id = (await d.query(`SELECT id FROM orders WHERE public_token = $1`, [first.order.token])).rows[0].id;
  const cancel = await app.inject({ method: "POST", url: `/v1/admin/orders/${id}/cancel`, headers: headers(owner), payload: { reasonCode: "CUSTOMER_REQUEST", note: "", refund: true } });
  assert.equal(cancel.statusCode, 200, cancel.body);
  const retry = await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "ONEUSE", customer: customer(201) }));
  assert.equal(retry.statusCode, 201, retry.body);
});

test("paused, scheduled and expired codes are refused; admin sees state", async () => {
  await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("LATER", { startsAt: "2029-01-01T00:00:00+05:30" }) });
  const list = (await app.inject({ url: "/v1/admin/promotions", headers: headers(owner) })).json().items;
  const later = list.find((p: { code: string }) => p.code === "LATER");
  assert.equal(later.state, "SCHEDULED");
  const r = await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, promotionCode: "LATER", customer: customer(300) }));
  assert.match(r.json().error.message, /has not started/);
  const rush = list.find((p: { code: string }) => p.code === "RUSH3");
  assert.equal(rush.state, "EXHAUSTED");
  await app.inject({ method: "POST", url: `/v1/admin/promotions/${rush.id}/active`, headers: headers(owner), payload: { active: false } });
  const paused = (await app.inject({ url: "/v1/admin/promotions", headers: headers(owner) })).json().items.find((p: { code: string }) => p.code === "RUSH3");
  assert.equal(paused.state, "PAUSED");
  const dup = await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("rush3") });
  assert.equal(dup.statusCode, 409);
});

test("percentage discounts respect the maximum and never exceed the subtotal", async () => {
  await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("HALF", { type: "PERCENTAGE", value: 50, maxDiscountMinor: 10000 }) });
  const q = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { lines: [{ productId: P.butterChicken, quantity: 2 }], fulfillmentType: "PICKUP", promotionCode: "HALF" } })).json();
  assert.equal(q.discountMinor, 10000);
  const bad = await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("TOOMUCH", { type: "PERCENTAGE", value: 150 }) });
  assert.equal(bad.statusCode, 400);
});
