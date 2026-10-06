// Development payment provider. Stateless: ids and signatures are derived with HMAC, so it behaves
// identically across API restarts and multiple instances. The chosen outcome travels in a signed
// token produced by the mock checkout, never trusted unsigned.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PaymentVerificationError, type PaymentIntent, type PaymentProvider, type PaymentRefund, type PaymentStatus, type PaymentVerification } from "./types.ts";

export type MockPaymentOutcome = "success" | "failed" | "cancelled" | "pending";
const OUTCOMES: readonly MockPaymentOutcome[] = ["success", "failed", "cancelled", "pending"];

function digest(value: string, length = 20) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const statusFor: Record<MockPaymentOutcome, PaymentVerification["status"]> = {
  success: "CAPTURED",
  failed: "FAILED",
  cancelled: "CANCELLED",
  pending: "AUTHORIZED",
};

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  constructor(private readonly defaultOutcome: MockPaymentOutcome = "success", private readonly secret = "restaurant-os-mock-payment-secret") {}

  async createIntent(input: { amountMinor: bigint; currency: string; orderId: string; idempotencyKey: string }): Promise<PaymentIntent> {
    if (input.amountMinor <= 0n) throw new Error("Payment amount must be positive.");
    const ref = digest(`${input.orderId}:${input.idempotencyKey}`);
    return {
      providerPaymentId: `mock_pay_${ref}`,
      providerOrderId: `mock_order_${ref}`,
      status: "PENDING",
      amountMinor: input.amountMinor,
      currency: input.currency,
      metadata: { mock: true },
    };
  }

  /** Signed proof of the outcome the customer chose on the mock checkout page. */
  signOutcome(providerPaymentId: string, outcome: MockPaymentOutcome): string {
    return `${outcome}.${createHmac("sha256", this.secret).update(`${providerPaymentId}|${outcome}`).digest("hex")}`;
  }

  async verifyPayment(input: { orderId: string; providerOrderId?: string; providerPaymentId: string; signature?: string; expectedAmountMinor?: bigint }): Promise<PaymentVerification> {
    if (!/^mock_pay_[0-9a-f]{20}$/.test(input.providerPaymentId)) throw new PaymentVerificationError("Unknown mock payment.");
    let outcome = this.defaultOutcome;
    if (input.signature !== undefined) {
      const [claimed] = input.signature.split(".");
      if (!OUTCOMES.includes(claimed as MockPaymentOutcome) || !safeEqual(input.signature, this.signOutcome(input.providerPaymentId, claimed as MockPaymentOutcome))) {
        throw new PaymentVerificationError("Invalid mock payment signature.");
      }
      outcome = claimed as MockPaymentOutcome;
    }
    const status = statusFor[outcome];
    return { providerPaymentId: input.providerPaymentId, status, eventId: `mock_event_${input.providerPaymentId}_${status}`, amountMinor: input.expectedAmountMinor };
  }

  async verifyWebhook(rawBody: string, signature: string) {
    if (!safeEqual(signature, MockPaymentProvider.webhookSignature(rawBody, this.secret))) throw new PaymentVerificationError("Invalid mock webhook signature.");
    const payload = JSON.parse(rawBody) as { eventId: string; type: string; paymentId?: string; orderId?: string; status?: PaymentStatus; amountMinor?: string };
    return { ...payload, amountMinor: payload.amountMinor === undefined ? undefined : BigInt(payload.amountMinor) };
  }

  async refund(input: { providerPaymentId: string; amountMinor?: bigint; idempotencyKey: string; capturedAmountMinor?: bigint; alreadyRefundedMinor?: bigint }): Promise<PaymentRefund> {
    const captured = input.capturedAmountMinor;
    const amountMinor = input.amountMinor ?? captured;
    if (amountMinor === undefined || amountMinor <= 0n) throw new Error("Invalid refund amount.");
    const total = (input.alreadyRefundedMinor ?? 0n) + amountMinor;
    if (captured !== undefined && total > captured) throw new Error("Refund exceeds the captured amount.");
    return {
      providerRefundId: `mock_refund_${digest(`${input.providerPaymentId}:${input.idempotencyKey}`)}`,
      status: captured !== undefined && total < captured ? "PARTIALLY_REFUNDED" : "REFUNDED",
      amountMinor,
    };
  }

  static webhookSignature(rawBody: string, secret = "restaurant-os-mock-payment-secret") {
    return `mock:${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  }
}
