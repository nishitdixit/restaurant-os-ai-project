// Journey D (order operations), Journey F (manual dispatch), cancellation/refunds, analytics
// reconciliation, notifications and payment expiry.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMember, db, headers, openAllDay, orderBody, PILOT_TENANT, placeOrder, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let owner: string;
let kitchen: string;

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app } = await startApp());
  await openAllDay();
  owner = (await createMember(PILOT_TENANT, "OWNER")).token;
  kitchen = (await createMember(PILOT_TENANT, "KITCHEN")).token;
});

let phoneSeq = 0;
async function paidOrder(overrides: Record<string, unknown> = {}) {
  phoneSeq++;
  const placed = (await placeOrder(app, orderBody({ customer: { name: `Ops ${phoneSeq}`, phone: `96000${String(phoneSeq).padStart(5, "0")}`, email: "ops@example.com", marketingConsent: false }, ...overrides }))).json();
  await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${placed.order.token}/payments/mock-complete`, payload: { outcome: "success" } });
  const d = await db();
  return { token: placed.order.token as string, id: (await d.query(`SELECT id FROM orders WHERE public_token = $1`, [placed.order.token])).rows[0].id as string };
}

const transition = (id: string, to: string, token = kitchen) => app.inject({ method: "POST", url: `/v1/admin/orders/${id}/transition`, headers: headers(token), payload: { to } });

describe("order board", () => {
  test("only paid orders reach the board; unpaid orders wait separately and cannot be accepted", async () => {
    const unpaid = (await placeOrder(app, orderBody({ customer: { name: "Unpaid", phone: "9500000001", email: "", marketingConsent: false } }))).json();
    const paid = await paidOrder();
    const active = (await app.inject({ url: "/v1/admin/orders?view=active", headers: headers(kitchen) })).json();
    assert.ok(active.items.some((o: { id: string }) => o.id === paid.id));
    assert.ok(!active.items.some((o: { number: number }) => o.number === unpaid.order.number));
    const waiting = (await app.inject({ url: "/v1/admin/orders?view=awaiting_payment", headers: headers(kitchen) })).json();
    assert.ok(waiting.items.some((o: { number: number }) => o.number === unpaid.order.number));
    assert.ok(active.counts.active >= 1 && active.counts.awaiting_payment >= 1);
    const d = await db();
    const unpaidId = (await d.query(`SELECT id FROM orders WHERE public_token = $1`, [unpaid.order.token])).rows[0].id;
    const accept = await transition(unpaidId, "ACCEPTED");
    assert.equal(accept.statusCode, 409);
    assert.equal(accept.json().error.code, "PAYMENT_NOT_CAPTURED");
  });

  test("search by order number and phone", async () => {
    const paid = await paidOrder();
    const detail = (await app.inject({ url: `/v1/admin/orders/${paid.id}`, headers: headers(kitchen) })).json();
    const byNumber = (await app.inject({ url: `/v1/admin/orders?view=all&q=${detail.number}`, headers: headers(kitchen) })).json();
    assert.equal(byNumber.items[0].id, paid.id);
    const byPhone = (await app.inject({ url: `/v1/admin/orders?view=all&q=${detail.customerPhone.slice(-6)}`, headers: headers(kitchen) })).json();
    assert.ok(byPhone.items.some((o: { id: string }) => o.id === paid.id));
  });
});

describe("delivery lifecycle", () => {
  test("accept -> prepare -> ready -> packed -> dispatch -> picked up -> delivered, with a full timeline", async () => {
    const o = await paidOrder();
    for (const to of ["ACCEPTED", "PREPARING", "READY", "PACKED"]) {
      const r = await transition(o.id, to);
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(r.json().status, to);
    }
    assert.equal((await transition(o.id, "DELIVERED")).statusCode, 409, "cannot skip dispatch");
    const dispatch = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/dispatch`, headers: headers(owner), payload: { riderName: "Ravi", riderPhone: "9000011111", provider: "MANUAL", trackingReference: "", notes: "" } });
    assert.equal(dispatch.statusCode, 200, dispatch.body);
    assert.equal(dispatch.json().status, "DISPATCHED");
    assert.equal(dispatch.json().delivery.riderName, "Ravi");
    await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/delivery`, headers: headers(kitchen), payload: { status: "PICKED_UP", note: "" } });
    const done = (await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/delivery`, headers: headers(kitchen), payload: { status: "DELIVERED", note: "" } })).json();
    assert.equal(done.status, "DELIVERED");
    assert.equal(done.delivery.status, "DELIVERED");
    const labels = done.timeline.map((t: { label: string }) => t.label);
    for (const expected of ["Order placed", "Payment received", "Accepted", "Preparing", "Ready", "Packed", "Out for delivery", "Delivery picked up", "Completed"]) {
      assert.ok(labels.includes(expected), `timeline has ${expected}: ${labels.join(", ")}`);
    }
    const publicView = (await app.inject(`/v1/storefront/pilot/orders/${o.token}`)).json();
    assert.equal(publicView.status, "DELIVERED");
    assert.equal(publicView.delivery.riderName, "Ravi");
  });

  test("failed delivery requires a note and the order can be reassigned", async () => {
    const o = await paidOrder();
    for (const to of ["ACCEPTED", "PREPARING", "READY"]) await transition(o.id, to);
    await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/dispatch`, headers: headers(owner), payload: { riderName: "A", riderPhone: "", provider: "MANUAL", trackingReference: "", notes: "" } });
    const noNote = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/delivery`, headers: headers(kitchen), payload: { status: "FAILED", note: "" } });
    assert.equal(noNote.statusCode, 422);
    const failed = (await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/delivery`, headers: headers(kitchen), payload: { status: "FAILED", note: "Customer unreachable" } })).json();
    assert.equal(failed.delivery.status, "FAILED");
    const reassigned = (await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/dispatch`, headers: headers(owner), payload: { riderName: "B", riderPhone: "", provider: "MANUAL", trackingReference: "", notes: "" } })).json();
    assert.equal(reassigned.delivery.status, "ASSIGNED");
    assert.equal(reassigned.delivery.riderName, "B");
  });

  test("pickup orders are collected without dispatch", async () => {
    const o = await paidOrder({ fulfillmentType: "PICKUP", address: null });
    for (const to of ["ACCEPTED", "PREPARING", "READY"]) await transition(o.id, to);
    const dispatch = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/dispatch`, headers: headers(owner), payload: { riderName: "X", riderPhone: "", provider: "MANUAL", trackingReference: "", notes: "" } });
    assert.equal(dispatch.statusCode, 422);
    assert.equal((await transition(o.id, "DELIVERED")).json().status, "DELIVERED");
  });
});

describe("cancellation and refunds", () => {
  test("cancelling a paid order refunds it, records the reason and notifies", async () => {
    const o = await paidOrder();
    const res = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/cancel`, headers: headers(kitchen), payload: { reasonCode: "ITEM_UNAVAILABLE", note: "Out of chicken", refund: true } });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.refundError, null);
    assert.equal(body.order.status, "CANCELLED");
    assert.equal(body.order.paymentStatus, "REFUNDED");
    assert.equal(body.order.refundableMinor, 0);
    const pub = (await app.inject(`/v1/storefront/pilot/orders/${o.token}`)).json();
    assert.equal(pub.cancelReason, "Item unavailable");
    assert.equal(pub.refundedMinor, pub.totalMinor);
  });

  test("only owners/managers cancel once preparation started; 'Other' needs a note", async () => {
    const o = await paidOrder();
    await transition(o.id, "ACCEPTED");
    await transition(o.id, "PREPARING");
    const denied = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/cancel`, headers: headers(kitchen), payload: { reasonCode: "CUSTOMER_REQUEST", note: "", refund: true } });
    assert.equal(denied.json().error.code, "CANCELLATION_NOT_PERMITTED");
    const noNote = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/cancel`, headers: headers(owner), payload: { reasonCode: "OTHER", note: "", refund: true } });
    assert.equal(noNote.json().error.code, "NOTE_REQUIRED");
  });

  test("partial refunds are idempotent and bounded by the captured amount", async () => {
    const o = await paidOrder();
    const refund = (amount: number, key: string, token = owner) => app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/refunds`, headers: headers(token, PILOT_TENANT, { "idempotency-key": key }), payload: { amountMinor: amount, reason: "Late delivery" } });
    assert.equal((await refund(1000, "kitchen-refund-1", kitchen)).statusCode, 403);
    const first = await refund(1000, "refund-key-1");
    assert.equal(first.statusCode, 201);
    assert.equal(first.json().paymentStatus, "PARTIALLY_REFUNDED");
    const replay = await refund(1000, "refund-key-1");
    assert.equal(replay.json().duplicate, true);
    assert.equal(replay.json().refundedMinor, 1000);
    const tooMuch = await refund(10_000_000, "refund-key-2");
    assert.equal(tooMuch.json().error.code, "REFUND_AMOUNT_INVALID");
  });
});

describe("notes, audit and notifications", () => {
  test("staff notes appear on the timeline", async () => {
    const o = await paidOrder();
    const res = await app.inject({ method: "POST", url: `/v1/admin/orders/${o.id}/notes`, headers: headers(kitchen), payload: { body: "Extra spicy please" } });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json().timeline.some((t: { kind: string; detail: string }) => t.kind === "note" && t.detail === "Extra spicy please"));
  });

  test("domain events become idempotent notifications with retries and a final failure", async () => {
    const { materializeEvent, sendNotification } = await import("../src/jobs/notifications.ts");
    const { DevelopmentNotificationProvider } = await import("../src/integrations/messaging.ts");
    const o = await paidOrder();
    const d = await db();
    const event = (await d.query(`SELECT id, tenant_id, event_type, aggregate_type, aggregate_id, payload FROM domain_events WHERE aggregate_id = $1 AND event_type = 'PaymentCaptured'`, [o.id])).rows[0];
    const ids = await materializeEvent(event);
    assert.equal(ids.length, 3, "whatsapp + email to customer, in-app to merchant");
    assert.deepEqual(await materializeEvent(event), [], "re-processing an event sends nothing new");

    const flaky = new DevelopmentNotificationProvider("flaky");
    const customerMsg = (await d.query(`SELECT id FROM notifications WHERE id = ANY($1::uuid[]) AND channel = 'whatsapp'`, [ids])).rows[0].id;
    assert.equal(await sendNotification(flaky, customerMsg, 3), "retry");
    assert.equal(await sendNotification(flaky, customerMsg, 3), "sent");
    assert.equal(await sendNotification(flaky, customerMsg, 3), "skipped", "a sent message is never sent twice");

    const failing = new DevelopmentNotificationProvider("fail");
    const emailMsg = (await d.query(`SELECT id FROM notifications WHERE id = ANY($1::uuid[]) AND channel = 'email'`, [ids])).rows[0].id;
    assert.equal(await sendNotification(failing, emailMsg, 2), "retry");
    assert.equal(await sendNotification(failing, emailMsg, 2), "failed");
    const log = (await app.inject({ url: "/v1/admin/notifications?status=FAILED", headers: headers(owner) })).json();
    assert.ok(log.items.some((n: { id: string }) => n.id === emailMsg));
    assert.ok(log.failedCount >= 1);
    assert.equal((await app.inject({ method: "POST", url: `/v1/admin/notifications/${emailMsg}/retry`, headers: headers(owner) })).statusCode, 200);
    const retryEvent = (await d.query(`SELECT id, tenant_id, event_type, aggregate_type, aggregate_id, payload FROM domain_events WHERE event_type = 'NotificationRetryRequested' AND aggregate_id = $1`, [emailMsg])).rows[0];
    assert.deepEqual(await materializeEvent(retryEvent), [emailMsg]);
    assert.equal(await sendNotification(new DevelopmentNotificationProvider("succeed"), emailMsg, 2), "sent");
    const body = (await d.query(`SELECT body FROM notifications WHERE id = $1`, [customerMsg])).rows[0].body;
    assert.match(body, /Payment confirmed/);
    assert.match(body, new RegExp(`/order/${o.token}`));
  });

  test("the outbox relay publishes each event once", async () => {
    const { relayOnce } = await import("../src/jobs/relay.ts");
    const published: string[] = [];
    await relayOnce({ publish: async (e) => { published.push(e.id); } });
    assert.ok(published.length > 0);
    const again: string[] = [];
    await relayOnce({ publish: async (e) => { again.push(e.id); } });
    assert.equal(again.length, 0);
    const broken = await relayOnce({ publish: async () => { throw new Error("redis down"); } });
    assert.equal(broken, 0);
  });

  test("sensitive mutations are audited", async () => {
    const entries = (await app.inject({ url: "/v1/admin/audit?limit=200", headers: headers(owner) })).json().items.map((a: { eventName: string }) => a.eventName);
    for (const name of ["OrderStatusChanged", "PaymentRefunded", "PromotionCreated"].slice(0, 2)) assert.ok(entries.includes(name), `${name} audited`);
    assert.equal((await app.inject({ url: "/v1/admin/audit", headers: headers(kitchen) })).statusCode, 403);
  });
});

describe("expiry and analytics", () => {
  test("unpaid orders past the payment window are cancelled and release coupons", async () => {
    const { expireUnpaidOrders } = await import("../src/modules/payments/service.ts");
    const placed = (await placeOrder(app, orderBody({ promotionCode: "WELCOME50", customer: { name: "Late", phone: "9400000001", email: "", marketingConsent: false } }))).json();
    const d = await db();
    await d.query(`UPDATE orders SET created_at = now() - interval '2 hours' WHERE public_token = $1`, [placed.order.token]);
    const before = (await d.query(`SELECT usage_count FROM promotions WHERE code = 'WELCOME50'`)).rows[0].usage_count;
    assert.ok(await expireUnpaidOrders(30) >= 1);
    const order = (await app.inject(`/v1/storefront/pilot/orders/${placed.order.token}`)).json();
    assert.equal(order.status, "CANCELLED");
    assert.equal(order.cancelReason, "Payment not completed");
    assert.equal(order.canRetryPayment, false);
    const afterCount = (await d.query(`SELECT usage_count FROM promotions WHERE code = 'WELCOME50'`)).rows[0].usage_count;
    assert.equal(afterCount, before - 1);
    const late = await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${placed.order.token}/payments`, payload: {} });
    assert.equal(late.json().error.code, "PAYMENT_WINDOW_CLOSED");
  });

  test("dashboard figures reconcile exactly with paid orders and refunds", async () => {
    const dash = (await app.inject({ url: "/v1/admin/analytics?range=30d", headers: headers(owner) })).json();
    const d = await db();
    const truth = (await d.query(`SELECT count(*)::int AS n, coalesce(sum(total_minor), 0)::int AS gross FROM orders WHERE payment_status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND status <> 'CANCELLED'`)).rows[0];
    const refunds = (await d.query(`SELECT coalesce(sum(amount_minor), 0)::int AS total FROM payment_refunds`)).rows[0].total;
    assert.equal(dash.summary.paidOrders, truth.n);
    assert.equal(dash.summary.grossSalesMinor, truth.gross);
    assert.equal(dash.summary.refundsMinor, refunds);
    assert.equal(dash.summary.netSalesMinor, truth.gross - refunds);
    assert.equal(dash.daily.reduce((s: number, x: { grossSalesMinor: number }) => s + x.grossSalesMinor, 0), truth.gross);
    assert.equal(dash.daily.length, 30);
    assert.ok(dash.topProducts.length > 0);
    assert.equal(dash.channelMix[0].channel, "DIRECT_WEB");
    assert.ok(dash.summary.completedOrders >= 2);
    assert.ok(dash.definitions.grossSalesMinor);
  });

  test("customers show paid history and favourites", async () => {
    const list = (await app.inject({ url: "/v1/admin/customers?q=Ops", headers: headers(owner) })).json();
    assert.ok(list.items.length > 0);
    const detail = (await app.inject({ url: `/v1/admin/customers/${list.items[0].id}`, headers: headers(owner) })).json();
    assert.ok(detail.orders.length >= 1);
    assert.equal(detail.addresses[0].postalCode, "560038");
    const repeat = (await app.inject({ url: "/v1/admin/customers?segment=repeat", headers: headers(owner) })).json();
    assert.ok(Array.isArray(repeat.items));
  });
});
