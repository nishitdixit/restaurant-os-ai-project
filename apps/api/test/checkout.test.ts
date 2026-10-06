// Customer journey A: browse -> quote -> order -> pay, including every documented failure state.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { address, db, M, openAllDay, orderBody, P, placeOrder, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app } = await startApp());
  await openAllDay();
});

describe("storefront catalog", () => {
  test("config exposes brand, outlet state and delivery areas", async () => {
    const res = await app.inject("/v1/storefront/pilot/config");
    assert.equal(res.statusCode, 200);
    const c = res.json();
    assert.equal(c.name, "Pilot Kitchen");
    assert.equal(c.outlet.openNow, true);
    assert.deepEqual(c.deliveryAreas[0].postalCodes, ["560038", "560008", "560071", "560075"]);
  });

  test("menu shows only published items, with live availability and modifiers", async () => {
    const menu = (await app.inject("/v1/storefront/pilot/menu")).json();
    const products = menu.categories.flatMap((c: { products: unknown[] }) => c.products);
    assert.equal(products.length, 10);
    const mutton = products.find((p: { id: string }) => p.id === P.muttonBiryani);
    assert.equal(mutton.available, false);
    const chicken = products.find((p: { id: string }) => p.id === P.chickenBiryani);
    assert.equal(chicken.modifierGroups[0].name, "Portion");
    assert.equal(chicken.modifierGroups[0].minSelections, 1);
  });

  test("search ranks name matches and ignores short queries", async () => {
    const res = (await app.inject("/v1/storefront/pilot/search?q=biryani")).json();
    assert.ok(res.items.length >= 3);
    assert.equal(res.items.at(-1).available, false, "unavailable items rank last");
    assert.deepEqual((await app.inject("/v1/storefront/pilot/search?q=b")).json().items, []);
  });

  test("unknown and unpublished stores are 404", async () => {
    assert.equal((await app.inject("/v1/storefront/nope/menu")).statusCode, 404);
    const d = await db();
    await d.query(`UPDATE brands SET status = 'DRAFT' WHERE slug = 'pilot'`);
    assert.equal((await app.inject("/v1/storefront/pilot/menu")).statusCode, 404);
    assert.equal((await app.inject("/v1/storefront/pilot/config?preview=1")).statusCode, 200);
    await d.query(`UPDATE brands SET status = 'ACTIVE' WHERE slug = 'pilot'`);
  });

  test("offers list public, active promotions", async () => {
    const offers = (await app.inject("/v1/storefront/pilot/offers")).json().items;
    assert.equal(offers[0].code, "WELCOME50");
    assert.match(offers[0].summary, /₹50 off on orders above ₹299/);
  });
});

describe("quote", () => {
  const quote = (body: Record<string, unknown>) => app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: body }).then((r) => r.json());

  test("prices lines server-side including modifiers, fee and discount", async () => {
    const q = await quote({ lines: [{ productId: P.chickenBiryani, quantity: 2, modifierIds: [M.family, M.raita] }], fulfillmentType: "DELIVERY", address, promotionCode: "welcome50", customerPhone: "9000000001" });
    assert.equal(q.lines[0].unitPriceMinor, 32900 + 42000 + 3000);
    assert.equal(q.subtotalMinor, 2 * 77900);
    assert.equal(q.feeMinor, 3000);
    assert.equal(q.discountMinor, 5000);
    assert.equal(q.totalMinor, 155800 + 3000 - 5000);
    assert.equal(q.canPlaceOrder, true);
  });

  test("missing required modifier, unserviceable pincode and minimum order are explained", async () => {
    const noPortion = await quote({ lines: [{ productId: P.chickenBiryani, quantity: 1, modifierIds: [] }], fulfillmentType: "PICKUP" });
    assert.equal(noPortion.issues[0].code, "ITEM_UNAVAILABLE");
    assert.match(noPortion.lines[0].problem, /Choose an option for Portion/);

    const far = await quote({ lines: [{ productId: P.butterChicken, quantity: 1 }], fulfillmentType: "DELIVERY", address: { ...address, postalCode: "110001" } });
    assert.equal(far.issues[0].code, "ADDRESS_NOT_SERVICEABLE");
    assert.equal(far.canPlaceOrder, false);

    const small = await quote({ lines: [{ productId: P.naan, quantity: 1 }], fulfillmentType: "DELIVERY", address });
    assert.equal(small.issues[0].code, "MINIMUM_ORDER_NOT_MET");
    assert.match(small.issues[0].message, /Add ₹140 more/);
  });

  test("invalid coupon is reported without blocking the order", async () => {
    const q = await quote({ lines: [{ productId: P.butterChicken, quantity: 1 }], fulfillmentType: "PICKUP", promotionCode: "NOPE" });
    assert.equal(q.promotionError, "NOPE is not a valid code.");
    assert.equal(q.canPlaceOrder, true);
  });

  test("radius zone matches when the customer shares a location", async () => {
    const d = await db();
    await d.query(`INSERT INTO delivery_zones (tenant_id, name, rule_type, rule_config, fee_minor, minimum_order_minor, eta_min, eta_max) VALUES
      ('10000000-0000-4000-8000-000000000001', 'Within 2 km', 'RADIUS', '{"radiusKm": 2}', 1000, 0, 20, 30)`);
    const q = await quote({ lines: [{ productId: P.butterChicken, quantity: 1 }], fulfillmentType: "DELIVERY", address: { ...address, postalCode: "560017", location: { latitude: 12.975, longitude: 77.64 } } });
    assert.equal(q.delivery.zoneName, "Within 2 km");
    assert.equal(q.feeMinor, 1000);
    await d.query(`DELETE FROM delivery_zones WHERE name = 'Within 2 km'`);
  });

  test("closed or paused kitchens block ordering with a recovery message", async () => {
    const d = await db();
    await d.query(`UPDATE outlets SET accepting_orders = false`);
    const paused = await quote({ lines: [{ productId: P.butterChicken, quantity: 1 }], fulfillmentType: "PICKUP" });
    assert.equal(paused.issues[0].code, "ORDERING_PAUSED");
    await d.query(`UPDATE outlets SET accepting_orders = true, hours = '{"mon":[["03:00","03:01"]]}'`);
    const closed = await quote({ lines: [{ productId: P.butterChicken, quantity: 1 }], fulfillmentType: "PICKUP" });
    assert.equal(closed.issues[0].code, "STORE_CLOSED");
    assert.match(closed.issues[0].message, /We open/);
    await openAllDay();
  });
});

describe("placing orders", () => {
  test("creates the order with snapshots, customer record and a pending mock payment", async () => {
    const res = await placeOrder(app, orderBody());
    assert.equal(res.statusCode, 201, res.body);
    const body = res.json();
    assert.equal(body.order.status, "NEW");
    assert.equal(body.order.paymentStatus, "PENDING");
    assert.equal(body.order.totalMinor, 31900 + 2 * 5900 + 3000);
    assert.equal(body.payment.action.type, "MOCK_CHECKOUT");
    assert.ok(body.order.number >= 1001);
    const d = await db();
    const c = await d.query(`SELECT phone, marketing_consent_status FROM customers WHERE phone = '+919845012345'`);
    assert.equal(c.rows[0].marketing_consent_status, "GRANTED");
  });

  test("the same idempotency key never creates a second order, even concurrently", async () => {
    const quote = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: orderBody() })).json();
    const send = () => app.inject({ method: "POST", url: "/v1/storefront/pilot/orders", headers: { "idempotency-key": "double-click-key-1" }, payload: { ...orderBody(), expectedTotalMinor: quote.totalMinor } });
    const results = await Promise.all([send(), send(), send(), send(), send()]);
    const tokens = new Set(results.map((r) => r.json().order.token));
    assert.equal(tokens.size, 1);
    assert.equal(results.filter((r) => r.statusCode === 201).length, 1);
    const d = await db();
    const n = await d.query(`SELECT count(*)::int AS n FROM orders WHERE idempotency_key = 'double-click-key-1'`);
    assert.equal(n.rows[0].n, 1);
  });

  test("a stale total returns PRICE_CHANGED with the new quote instead of charging", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/storefront/pilot/orders", headers: { "idempotency-key": "stale-total-1" }, payload: { ...orderBody(), expectedTotalMinor: 100 } });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, "PRICE_CHANGED");
    assert.ok(res.json().error.details.quote.totalMinor > 100);
  });

  test("unavailable items, unserviceable addresses and bad phones are rejected", async () => {
    const unavailable = await placeOrder(app, orderBody({ lines: [{ productId: P.muttonBiryani, quantity: 1, modifierIds: [M.regular] }] }));
    assert.equal(unavailable.statusCode, 422);
    assert.equal(unavailable.json().error.code, "ITEM_UNAVAILABLE");
    const far = await placeOrder(app, orderBody({ address: { ...address, postalCode: "400001" } }));
    assert.equal(far.json().error.code, "ADDRESS_NOT_SERVICEABLE");
    const phone = await placeOrder(app, orderBody({ customer: { name: "X", phone: "12345678", email: "", marketingConsent: false } }));
    assert.equal(phone.json().error.code, "INVALID_PHONE");
  });

  test("an invalid coupon on the final order is refused", async () => {
    const res = await placeOrder(app, orderBody({ promotionCode: "BOGUS" }));
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error.code, "PROMOTION_INVALID");
  });

  test("validation errors use the documented envelope", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/storefront/pilot/orders", headers: { "idempotency-key": "bad-body-1" }, payload: { lines: [] } });
    assert.equal(res.statusCode, 400);
    const e = res.json().error;
    assert.equal(e.code, "VALIDATION_FAILED");
    assert.ok(e.requestId);
    assert.ok(Object.keys(e.details.fields).length > 0);
  });
});

describe("payments (mock provider)", () => {
  test("success captures payment once and emits a domain event; repeats are no-ops", async () => {
    const placed = (await placeOrder(app, orderBody({ customer: { name: "Pay Ok", phone: "9811111111", email: "", marketingConsent: false } }))).json();
    const token = placed.order.token;
    const ok = await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${token}/payments/mock-complete`, payload: { outcome: "success" } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().status, "CAPTURED");
    assert.equal(ok.json().order.paymentStatus, "CAPTURED");
    const again = await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${token}/payments/mock-complete`, payload: { outcome: "failed" } });
    assert.equal(again.json().order.paymentStatus, "CAPTURED", "a captured payment never moves backwards");
    const d = await db();
    const events = await d.query(`SELECT event_type FROM domain_events WHERE aggregate_id = (SELECT id FROM orders WHERE public_token = $1) ORDER BY created_at`, [token]);
    assert.deepEqual(events.rows.map((e) => e.event_type), ["OrderCreated", "PaymentCaptured"]);
  });

  test("failure keeps the order open for a retry that can then succeed", async () => {
    const placed = (await placeOrder(app, orderBody({ customer: { name: "Pay Retry", phone: "9822222222", email: "", marketingConsent: false } }))).json();
    const token = placed.order.token;
    const failed = (await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${token}/payments/mock-complete`, payload: { outcome: "failed" } })).json();
    assert.equal(failed.order.paymentStatus, "FAILED");
    assert.equal(failed.order.canRetryPayment, true);
    const retry = (await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${token}/payments/mock-complete`, payload: { outcome: "success" } })).json();
    assert.equal(retry.order.paymentStatus, "CAPTURED");
    const d = await db();
    const payments = await d.query(`SELECT status FROM payments WHERE order_id = (SELECT id FROM orders WHERE public_token = $1) ORDER BY created_at`, [token]);
    assert.deepEqual(payments.rows.map((p) => p.status), ["FAILED", "CAPTURED"]);
  });

  test("webhooks are signature-checked, replay-safe and amount-checked", async () => {
    const { MockPaymentProvider } = await import("../src/integrations/payments/mock.ts");
    const placed = (await placeOrder(app, orderBody({ customer: { name: "Hook", phone: "9833333333", email: "", marketingConsent: false } }))).json();
    const d = await db();
    const payment = (await d.query(`SELECT provider_payment_id, amount_minor FROM payments WHERE order_id = (SELECT id FROM orders WHERE public_token = $1)`, [placed.order.token])).rows[0];
    const send = (body: object, signature?: string) => {
      const raw = JSON.stringify(body);
      return app.inject({ method: "POST", url: "/v1/payments/webhook", headers: { "content-type": "application/json", "x-mock-signature": signature ?? MockPaymentProvider.webhookSignature(raw) }, payload: raw });
    };
    const forged = await send({ eventId: "evt_forged", type: "payment.captured", paymentId: payment.provider_payment_id, status: "CAPTURED" }, "mock:bad");
    assert.equal(forged.statusCode, 401);
    const wrongAmount = await send({ eventId: "evt_wrong", type: "payment.captured", paymentId: payment.provider_payment_id, status: "CAPTURED", amountMinor: "1" });
    assert.equal(wrongAmount.statusCode, 409);
    const event = { eventId: "evt_ok", type: "payment.captured", paymentId: payment.provider_payment_id, status: "CAPTURED", amountMinor: String(payment.amount_minor) };
    assert.deepEqual((await send(event)).json(), { duplicate: false });
    assert.deepEqual((await send(event)).json(), { duplicate: true });
    const order = (await app.inject(`/v1/storefront/pilot/orders/${placed.order.token}`)).json();
    assert.equal(order.paymentStatus, "CAPTURED");
    const captured = await d.query(`SELECT count(*)::int AS n FROM domain_events WHERE event_type = 'PaymentCaptured' AND aggregate_id = (SELECT id FROM orders WHERE public_token = $1)`, [placed.order.token]);
    assert.equal(captured.rows[0].n, 1);
  });

  test("order status lookups need the unguessable token", async () => {
    assert.equal((await app.inject("/v1/storefront/pilot/orders/1001")).statusCode, 404);
    assert.equal((await app.inject("/v1/storefront/pilot/orders/aaaaaaaaaaaaaaaaaaaaaaaa")).statusCode, 404);
  });
});
