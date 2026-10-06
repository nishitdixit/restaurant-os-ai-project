// Contract tests for payment adapters (engineering/TESTING.md "Contract tests").
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MockPaymentProvider } from "../src/integrations/payments/mock.ts";
import { RazorpayPaymentProvider } from "../src/integrations/payments/razorpay.ts";

const intent = (provider: MockPaymentProvider, key = "attempt-1") =>
  provider.createIntent({ amountMinor: 12500n, currency: "INR", orderId: "order-1", idempotencyKey: key });

test("mock intents are deterministic and stateless across instances", async () => {
  const a = await intent(new MockPaymentProvider());
  const b = await intent(new MockPaymentProvider());
  assert.equal(a.providerPaymentId, b.providerPaymentId);
  assert.notEqual(a.providerPaymentId, (await intent(new MockPaymentProvider(), "attempt-2")).providerPaymentId);
  assert.equal(a.status, "PENDING");
});

test("mock verification honours only signed outcomes", async () => {
  const provider = new MockPaymentProvider("success", "secret-secret-secret");
  const p = await intent(provider);
  for (const [outcome, status] of [["success", "CAPTURED"], ["failed", "FAILED"], ["cancelled", "CANCELLED"], ["pending", "AUTHORIZED"]] as const) {
    const v = await provider.verifyPayment({ orderId: "order-1", providerPaymentId: p.providerPaymentId, signature: provider.signOutcome(p.providerPaymentId, outcome), expectedAmountMinor: 12500n });
    assert.equal(v.status, status);
  }
  await assert.rejects(provider.verifyPayment({ orderId: "order-1", providerPaymentId: p.providerPaymentId, signature: "success.forged" }), /signature/);
  const other = new MockPaymentProvider("success", "another-secret-value");
  await assert.rejects(provider.verifyPayment({ orderId: "order-1", providerPaymentId: p.providerPaymentId, signature: other.signOutcome(p.providerPaymentId, "success") }), /signature/);
  await assert.rejects(provider.verifyPayment({ orderId: "order-1", providerPaymentId: "unknown" }), /Unknown/);
});

test("mock webhook signature rejects tampering", async () => {
  const provider = new MockPaymentProvider();
  const body = JSON.stringify({ eventId: "evt_1", type: "payment.captured", paymentId: "pay_1", status: "CAPTURED" });
  assert.equal((await provider.verifyWebhook(body, MockPaymentProvider.webhookSignature(body))).eventId, "evt_1");
  await assert.rejects(provider.verifyWebhook(body.replace("CAPTURED", "FAILED"), MockPaymentProvider.webhookSignature(body)));
});

test("mock refunds report partial vs full from the server ledger and are idempotent by key", async () => {
  const provider = new MockPaymentProvider();
  const first = await provider.refund({ providerPaymentId: "mock_pay_x", amountMinor: 5000n, idempotencyKey: "r1", capturedAmountMinor: 12500n, alreadyRefundedMinor: 0n });
  const replay = await provider.refund({ providerPaymentId: "mock_pay_x", amountMinor: 5000n, idempotencyKey: "r1", capturedAmountMinor: 12500n, alreadyRefundedMinor: 0n });
  assert.equal(first.providerRefundId, replay.providerRefundId);
  assert.equal(first.status, "PARTIALLY_REFUNDED");
  const rest = await provider.refund({ providerPaymentId: "mock_pay_x", amountMinor: 7500n, idempotencyKey: "r2", capturedAmountMinor: 12500n, alreadyRefundedMinor: 5000n });
  assert.equal(rest.status, "REFUNDED");
  await assert.rejects(provider.refund({ providerPaymentId: "mock_pay_x", amountMinor: 1n, idempotencyKey: "r3", capturedAmountMinor: 12500n, alreadyRefundedMinor: 12500n }));
});

test("Razorpay adapter verifies signatures and server-side status without trusting the browser", async () => {
  process.env.RAZORPAY_KEY_ID = "test_key_fixture";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).endsWith("/orders")) return new Response(JSON.stringify({ id: "order_rzp_1", amount: 12500, currency: "INR", status: "created" }), { status: 200 });
    if (String(url).endsWith("/payments/pay_rzp_1")) return new Response(JSON.stringify({ id: "pay_rzp_1", order_id: "order_rzp_1", amount: 12500, status: "captured" }), { status: 200 });
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;
  try {
    const provider = new RazorpayPaymentProvider();
    const created = await provider.createIntent({ amountMinor: 12500n, currency: "INR", orderId: "order-1", idempotencyKey: "idem-1" });
    assert.equal(created.providerOrderId, "order_rzp_1");
    const signature = createHmac("sha256", "secret").update("order_rzp_1|pay_rzp_1").digest("hex");
    const verified = await provider.verifyPayment({ orderId: "order-1", providerOrderId: "order_rzp_1", providerPaymentId: "pay_rzp_1", signature });
    assert.equal(verified.status, "CAPTURED");
    assert.equal(verified.amountMinor, 12500n);
    await assert.rejects(provider.verifyPayment({ orderId: "order-1", providerOrderId: "order_rzp_1", providerPaymentId: "pay_rzp_1", signature: "0".repeat(64) }), /signature/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
