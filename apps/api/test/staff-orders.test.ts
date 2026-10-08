// ADR-014: orders staff enter from the dashboard (WhatsApp, phone, walk-in) and staff-only offers. Staff orders use
// the website's pricing engine, so the same cart costs the same either way; they start accepted, record how they are
// paid, and only they can use staff-only offers.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { address, createMember, db, headers, M, openAllDay, orderBody, P, PILOT_TENANT, placeOrder, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let verifier: Awaited<ReturnType<typeof startApp>>["verifier"];
let owner: string;
let manager: string;
let kitchen: { token: string; userId: string; external: string };
let staff: { token: string; userId: string; external: string };

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app, verifier } = await startApp());
  await openAllDay();
  owner = (await createMember(PILOT_TENANT, "OWNER")).token;
  manager = (await createMember(PILOT_TENANT, "MANAGER")).token;
  kitchen = await createMember(PILOT_TENANT, "KITCHEN");
  staff = await createMember(PILOT_TENANT, "STAFF");
});

const promo = (code: string, overrides: Record<string, unknown> = {}) => ({
  code, title: `${code} offer`, description: "", type: "PERCENTAGE", value: 10, minimumOrderMinor: 0, maxDiscountMinor: null,
  startsAt: "2026-01-01T00:00:00+05:30", endsAt: "2030-01-01T00:00:00+05:30", usageCap: null, newCustomerOnly: false, oncePerCustomer: false, isPublic: true, active: true,
  ...overrides,
});

const cart = {
  lines: [
    { productId: P.chickenBiryani, quantity: 2, modifierIds: [M.family, M.raita] },
    { productId: P.naan, quantity: 3, modifierIds: [] },
  ],
  fulfillmentType: "DELIVERY",
  address,
};

let seq = 0;
const key = () => `staff-test-${Date.now()}-${++seq}`;

async function staffQuote(token: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/v1/admin/orders/quote", headers: headers(token), payload: body });
}

/** Quotes as staff and creates the order with the server's own total. */
async function staffOrder(token: string, overrides: Record<string, unknown> = {}, idempotencyKey = key()) {
  const body = {
    ...cart, promotionCode: "", channel: "PHONE", customer: { name: "Ravi Kumar", phone: "98860 11111", email: "" }, customerNote: "", payment: "CASH", notifyCustomer: true,
    ...overrides,
  } as Record<string, unknown> & { customer: { phone: string } };
  const q = await staffQuote(token, { lines: body.lines, fulfillmentType: body.fulfillmentType, address: body.address, promotionCode: body.promotionCode, customerPhone: body.customer.phone });
  const expectedTotalMinor = q.statusCode === 200 ? q.json().totalMinor : 0;
  return app.inject({ method: "POST", url: "/v1/admin/orders", headers: headers(token, PILOT_TENANT, { "idempotency-key": idempotencyKey }), payload: { ...body, expectedTotalMinor } });
}

describe("pricing parity and creation", () => {
  test("the same cart costs the same on the website and as a staff order (options, delivery fee, offer)", async () => {
    assert.equal((await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("PARITY10") })).statusCode, 201);
    const body = { ...cart, promotionCode: "PARITY10", customerPhone: "98860 22222" };
    const web = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: body })).json();
    const desk = (await staffQuote(staff.token, body)).json();
    assert.ok(web.discountMinor > 0 && web.feeMinor >= 0);
    for (const k of ["subtotalMinor", "discountMinor", "feeMinor", "totalMinor"]) assert.equal(desk[k], web[k], k);
    assert.deepEqual(desk.lines.map((l: { unitPriceMinor: number }) => l.unitPriceMinor), web.lines.map((l: { unitPriceMinor: number }) => l.unitPriceMinor));

    const res = await staffOrder(staff.token, { promotionCode: "PARITY10", customer: { name: "Ravi Kumar", phone: "98860 22222", email: "" } });
    assert.equal(res.statusCode, 201, res.body);
    const o = res.json().order;
    assert.equal(o.totalMinor, web.totalMinor);
    assert.equal(o.status, "ACCEPTED");
    assert.equal(o.paymentStatus, "CAPTURED");
    assert.equal(o.paymentMethod, "CASH");
    assert.equal(o.channel, "PHONE");
    assert.equal(o.createdBy, `${staff.external}@example.com`);
    assert.equal(o.promotionCode, "PARITY10");
    assert.equal(o.promotionAppliedBy, `${staff.external}@example.com`);
    const biryani = o.items.find((i: { productId: string }) => i.productId === P.chickenBiryani);
    assert.deepEqual([...biryani.modifierIds].sort(), [M.family, M.raita].sort());
    assert.ok(biryani.modifiers.every((m: { groupName: string }) => m.groupName));
    assert.ok(o.timeline.some((t: { label: string; actor: string | null }) => t.label === "Payment received · Cash" && t.actor === `${staff.external}@example.com`));
    // It continues the same order-number series as website orders.
    const web2 = (await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null }))).json();
    assert.equal(web2.order.number, o.number + 1);
  });

  test("Owner, Manager, Kitchen and Staff can all enter orders; the order number and source show on the board", async () => {
    for (const token of [owner, manager, kitchen.token, staff.token]) {
      const res = await staffOrder(token, { channel: "WHATSAPP" });
      assert.equal(res.statusCode, 201, res.body);
    }
    const board = (await app.inject({ url: "/v1/admin/orders?view=active&channel=WHATSAPP", headers: headers(kitchen.token) })).json();
    assert.ok(board.items.length >= 4);
    assert.ok(board.items.every((i: { channel: string; createdBy: string | null }) => i.channel === "WHATSAPP" && i.createdBy));
  });

  test("a double-submitted staff order creates one order", async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 5 }, () => staffOrder(staff.token, { customer: { name: "Dup", phone: "98860 33333", email: "" } }, k)));
    const ids = new Set(results.map((r) => r.json().order.id));
    assert.equal(ids.size, 1, results.map((r) => r.body).join("\n"));
    assert.equal(results.filter((r) => r.statusCode === 201).length, 1);
    const d = await db();
    assert.equal((await d.query(`SELECT count(*)::int AS n FROM orders WHERE customer_snapshot->>'name' = 'Dup'`)).rows[0].n, 1);
  });

  test("delivery outside the delivery areas and unavailable dishes are blocked, as on the website", async () => {
    const outside = await staffOrder(staff.token, { address: { ...address, postalCode: "110001" } });
    assert.equal(outside.statusCode, 422);
    assert.equal(outside.json().error.code, "ADDRESS_NOT_SERVICEABLE");
    const soldOut = await staffOrder(staff.token, { lines: [{ productId: P.muttonBiryani, quantity: 1, modifierIds: [] }], fulfillmentType: "PICKUP", address: null });
    assert.equal(soldOut.statusCode, 422);
    assert.equal(soldOut.json().error.code, "ITEM_UNAVAILABLE");
  });

  test("staff can still take orders while online ordering is paused", async () => {
    const d = await db();
    await d.query(`UPDATE outlets SET accepting_orders = false WHERE tenant_id = $1`, [PILOT_TENANT]);
    try {
      const web = await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { ...cart } });
      assert.ok(web.json().issues.some((i: { code: string }) => i.code === "ORDERING_PAUSED"));
      assert.equal((await staffOrder(staff.token)).statusCode, 201);
    } finally {
      await d.query(`UPDATE outlets SET accepting_orders = true WHERE tenant_id = $1`, [PILOT_TENANT]);
    }
  });

  test("walk-in pickups may be anonymous; phone and delivery orders need the customer's details", async () => {
    const walkIn = await staffOrder(staff.token, { channel: "WALK_IN", fulfillmentType: "PICKUP", address: null, customer: { name: "", phone: "", email: "" } });
    assert.equal(walkIn.statusCode, 201, walkIn.body);
    assert.equal(walkIn.json().order.customerName, "Walk-in customer");
    assert.equal(walkIn.json().order.customerId, null);
    const named = await staffOrder(staff.token, { channel: "WALK_IN", fulfillmentType: "PICKUP", address: null, customer: { name: "Table 4", phone: "", email: "" } });
    assert.equal(named.json().order.customerName, "Table 4");
    const noPhone = await staffOrder(staff.token, { channel: "PHONE", fulfillmentType: "PICKUP", address: null, customer: { name: "X", phone: "", email: "" } });
    assert.equal(noPhone.statusCode, 400);
    const deliveryNoPhone = await staffOrder(staff.token, { channel: "WALK_IN", customer: { name: "X", phone: "", email: "" } });
    assert.equal(deliveryNoPhone.statusCode, 400);
  });

  test("customer lookup fills a known customer's name and saved addresses (exact phone only)", async () => {
    await staffOrder(staff.token, { customer: { name: "Meera Iyer", phone: "98860 44444", email: "meera@example.com" } });
    const found = (await app.inject({ url: "/v1/admin/orders/new/customer?phone=9886044444", headers: headers(kitchen.token) })).json();
    assert.equal(found.found, true);
    assert.equal(found.name, "Meera Iyer");
    assert.equal(found.addresses[0].postalCode, address.postalCode);
    // A blank name on the next order keeps the stored one.
    const again = await staffOrder(staff.token, { fulfillmentType: "PICKUP", address: null, customer: { name: "", phone: "98860 44444", email: "" } });
    assert.equal(again.json().order.customerName, "Meera Iyer");
    const missing = (await app.inject({ url: "/v1/admin/orders/new/customer?phone=9000000001", headers: headers(kitchen.token) })).json();
    assert.equal(missing.found, false);
  });

  test("the new-order menu lists dishes with options and marks unavailable ones", async () => {
    const menu = (await app.inject({ url: "/v1/admin/orders/new/menu", headers: headers(staff.token) })).json();
    const all = menu.categories.flatMap((c: { products: { id: string; available: boolean; modifierGroups: unknown[] }[] }) => c.products);
    assert.ok(all.find((p: { id: string }) => p.id === P.chickenBiryani).modifierGroups.length > 0);
    assert.equal(all.find((p: { id: string }) => p.id === P.muttonBiryani).available, false);
  });
});

describe("staff-only offers", () => {
  test("only Owner/Manager create offers; a staff-only code is hidden and refused on the website", async () => {
    assert.equal((await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(staff.token), payload: promo("STAFFTRY", { audience: "STAFF_ONLY" }) })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(kitchen.token), payload: promo("STAFFTRY", { audience: "STAFF_ONLY" }) })).statusCode, 403);
    const created = await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(manager), payload: promo("REGULAR15", { value: 15, audience: "STAFF_ONLY" }) });
    assert.equal(created.statusCode, 201, created.body);

    const listed = (await app.inject("/v1/storefront/pilot/offers")).json();
    assert.ok(!JSON.stringify(listed).includes("REGULAR15"), "not listed on the website");
    const webQuote = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { ...cart, promotionCode: "REGULAR15" } })).json();
    assert.equal(webQuote.promotion, null);
    assert.equal(webQuote.promotionError, "REGULAR15 is not a valid code.", "same message as an unknown code");
    const webOrder = await placeOrder(app, orderBody({ promotionCode: "REGULAR15" }));
    assert.equal(webOrder.statusCode, 422);
    assert.equal(webOrder.json().error.code, "PROMOTION_INVALID");
  });

  test("any staff member can pick it from the offer list and apply it; usage is tracked by source and person", async () => {
    const offers = (await app.inject({ url: "/v1/admin/orders/new/offers", headers: headers(staff.token) })).json().items;
    const offer = offers.find((o: { code: string }) => o.code === "REGULAR15");
    assert.equal(offer.audience, "STAFF_ONLY");
    assert.match(offer.summary, /15%/);

    const res = await staffOrder(kitchen.token, { promotionCode: "REGULAR15" });
    assert.equal(res.statusCode, 201, res.body);
    const o = res.json().order;
    assert.ok(o.discountMinor > 0);
    assert.equal(o.promotionStaffOnly, true);
    assert.equal(o.promotionAppliedBy, `${kitchen.external}@example.com`);

    const admin = (await app.inject({ url: "/v1/admin/promotions", headers: headers(owner) })).json().items;
    const row = admin.find((p: { code: string }) => p.code === "REGULAR15");
    assert.equal(row.audience, "STAFF_ONLY");
    assert.equal(row.isPublic, false);
    assert.deepEqual(row.usageBySource, { website: 0, staff: 1 });
    assert.deepEqual(row.appliedBy, [{ staff: `${kitchen.external}@example.com`, uses: 1 }]);
    const parity = admin.find((p: { code: string }) => p.code === "PARITY10");
    assert.equal(parity.audience, "PUBLIC");

    const dash = (await app.inject({ url: "/v1/admin/analytics?range=30d", headers: headers(owner) })).json();
    const stat = dash.offers.find((x: { code: string }) => x.code === "REGULAR15");
    assert.deepEqual({ uses: stat.uses, staffUses: stat.staffUses, websiteUses: stat.websiteUses, staffOnly: stat.staffOnly }, { uses: 1, staffUses: 1, websiteUses: 0, staffOnly: true });
    assert.ok(dash.channelMix.some((c: { channel: string }) => c.channel === "PHONE"));
  });

  test("code-only offers keep working when typed; audience round-trips through edit", async () => {
    const created = (await app.inject({ method: "POST", url: "/v1/admin/promotions", headers: headers(owner), payload: promo("SECRET5", { audience: "CODE_ONLY" }) })).json();
    const webQuote = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { ...cart, promotionCode: "SECRET5" } })).json();
    assert.equal(webQuote.promotion.code, "SECRET5");
    assert.ok(!JSON.stringify((await app.inject("/v1/storefront/pilot/offers")).json()).includes("SECRET5"));
    await app.inject({ method: "PUT", url: `/v1/admin/promotions/${created.id}`, headers: headers(owner), payload: promo("SECRET5", { audience: "STAFF_ONLY" }) });
    const again = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { ...cart, promotionCode: "SECRET5" } })).json();
    assert.equal(again.promotion, null);
    // Legacy clients that only send isPublic keep their meaning.
    await app.inject({ method: "PUT", url: `/v1/admin/promotions/${created.id}`, headers: headers(owner), payload: promo("SECRET5", { isPublic: true }) });
    const row = (await app.inject({ url: "/v1/admin/promotions", headers: headers(owner) })).json().items.find((p: { code: string }) => p.code === "SECRET5");
    assert.equal(row.audience, "PUBLIC");
  });
});

describe("pay later, refunds and isolation", () => {
  test("pay-later orders are on the board, not in sales, never expire, and count once marked paid", async () => {
    const before = (await app.inject({ url: "/v1/admin/analytics?range=today", headers: headers(owner) })).json();
    const res = await staffOrder(staff.token, { payment: "PAY_LATER", fulfillmentType: "PICKUP", address: null, customer: { name: "Later", phone: "98860 55555", email: "" } });
    assert.equal(res.statusCode, 201, res.body);
    const o = res.json().order;
    assert.equal(o.paymentStatus, "PENDING");
    assert.equal(o.paymentDue, true);
    const board = (await app.inject({ url: "/v1/admin/orders?view=active", headers: headers(staff.token) })).json();
    assert.ok(board.items.some((i: { id: string; paymentDue: boolean }) => i.id === o.id && i.paymentDue));
    const awaiting = (await app.inject({ url: "/v1/admin/orders?view=awaiting_payment", headers: headers(staff.token) })).json();
    assert.ok(!awaiting.items.some((i: { id: string }) => i.id === o.id), "not mixed with unpaid website orders");

    const mid = (await app.inject({ url: "/v1/admin/analytics?range=today", headers: headers(owner) })).json();
    assert.equal(mid.summary.paidOrders, before.summary.paidOrders);
    assert.equal(mid.paymentDue.orders, before.paymentDue.orders + 1);

    const d = await db();
    await d.query(`UPDATE orders SET created_at = now() - interval '3 hours' WHERE id = $1`, [o.id]);
    const { expireUnpaidOrders } = await import("../src/modules/payments/service.ts");
    await expireUnpaidOrders(30);
    assert.equal((await d.query(`SELECT status FROM orders WHERE id = $1`, [o.id])).rows[0].status, "ACCEPTED");
    await d.query(`UPDATE orders SET created_at = now() WHERE id = $1`, [o.id]);

    const paid = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/mark-paid`, headers: headers(staff.token), payload: { method: "UPI" } });
    assert.equal(paid.statusCode, 200, paid.body);
    assert.equal(paid.json().paymentStatus, "CAPTURED");
    assert.equal(paid.json().paymentMethod, "UPI");
    assert.equal(paid.json().paymentDue, false);
    assert.ok(paid.json().timeline.some((t: { label: string }) => t.label === "Payment received · UPI"));
    const twice = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/mark-paid`, headers: headers(staff.token), payload: { method: "CASH" } });
    assert.equal(twice.json().paymentMethod, "UPI", "marking paid again changes nothing");

    const after = (await app.inject({ url: "/v1/admin/analytics?range=today", headers: headers(owner) })).json();
    assert.equal(after.summary.paidOrders, before.summary.paidOrders + 1);
    assert.equal(after.summary.grossSalesMinor, before.summary.grossSalesMinor + o.totalMinor);
    assert.equal(after.paymentDue.orders, before.paymentDue.orders);
  });

  test("website orders cannot be marked paid by hand", async () => {
    const web = (await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null }))).json();
    const d = await db();
    const id = (await d.query(`SELECT id FROM orders WHERE public_token = $1`, [web.order.token])).rows[0].id;
    const res = await app.inject({ method: "POST", url: `/v1/admin/orders/${id}/mark-paid`, headers: headers(owner), payload: { method: "CASH" } });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, "NOT_PAY_LATER");
  });

  test("cancelling a cash order records the refund as returned by the restaurant", async () => {
    const o = (await staffOrder(staff.token, { fulfillmentType: "PICKUP", address: null })).json().order;
    const res = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/cancel`, headers: headers(staff.token), payload: { reasonCode: "CUSTOMER_REQUEST", note: "", refund: true } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().refundError, null);
    assert.equal(res.json().order.paymentStatus, "REFUNDED");
    assert.equal(res.json().order.refunds[0].amountMinor, o.totalMinor);
  });

  test("customer updates follow the order's notify setting", async () => {
    const { planMessages } = await import("../src/jobs/notifications.ts");
    const d = await db();
    const event = async (orderId: string) => (await d.query(`SELECT id, tenant_id, event_type, aggregate_type, aggregate_id, payload FROM domain_events WHERE aggregate_id = $1 AND event_type = 'OrderCreated'`, [orderId])).rows[0];
    const on = (await staffOrder(staff.token, { payment: "PAY_LATER" })).json().order;
    const planned = await planMessages(await event(on.id));
    assert.ok(planned.messages.some((m) => m.audience === "CUSTOMER" && m.template === "ORDER_CONFIRMED" && /Please pay/.test(m.body)));
    assert.ok(!planned.messages.some((m) => m.audience === "MERCHANT"), "no new-order alarm for an order staff entered");
    const off = (await staffOrder(staff.token, { notifyCustomer: false })).json().order;
    assert.deepEqual((await planMessages(await event(off.id))).messages, []);
  });

  test("another restaurant can't see, mark paid or create orders here; permissions are enforced", async () => {
    verifier.emails.set("founder_c", "founder@c.example");
    const other = await app.inject({ method: "POST", url: "/v1/restaurants", headers: { authorization: "Bearer user:founder_c" }, payload: { businessName: "C Foods", brandName: "Cee Kitchen", brandSlug: "cee-kitchen", phone: "9876500001", city: "Pune" } });
    assert.equal(other.statusCode, 201, other.body);
    const tenantC = other.json().tenantId;
    const mine = (await staffOrder(staff.token, { payment: "PAY_LATER" })).json().order;
    // C's owner, acting in C, cannot touch A's order.
    const cross = await app.inject({ method: "POST", url: `/v1/admin/orders/${mine.id}/mark-paid`, headers: headers("user:founder_c", tenantC), payload: { method: "CASH" } });
    assert.equal(cross.statusCode, 404);
    // ...nor act in A at all.
    const intoA = await app.inject({ method: "POST", url: "/v1/admin/orders/quote", headers: headers("user:founder_c", PILOT_TENANT), payload: cart });
    assert.equal(intoA.statusCode, 403);
    // A's dishes don't exist in C's menu.
    const cQuote = (await app.inject({ method: "POST", url: "/v1/admin/orders/quote", headers: headers("user:founder_c", tenantC), payload: { ...cart, fulfillmentType: "PICKUP", address: null } })).json();
    assert.ok(cQuote.issues.some((i: { code: string }) => i.code === "ITEM_UNAVAILABLE"));
    // Without a token there is nothing.
    assert.equal((await app.inject({ method: "POST", url: "/v1/admin/orders", payload: {} })).statusCode, 401);
  });
});
