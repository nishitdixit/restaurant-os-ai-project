import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentProviderNotConfigured, PaymentVerificationError, type PaymentProvider, type PaymentStatus, type PaymentVerification } from "./types.ts";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new PaymentProviderNotConfigured(`${name} is required for Razorpay.`);
  return value;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay";
  private readonly baseUrl = process.env.RAZORPAY_BASE_URL ?? "https://api.razorpay.com/v1";

  private authHeader() {
    return `Basic ${Buffer.from(`${requireEnv("RAZORPAY_KEY_ID")}:${requireEnv("RAZORPAY_KEY_SECRET")}`).toString("base64")}`;
  }

  async createIntent(input: { amountMinor: bigint; currency: string; orderId: string; idempotencyKey: string }) {
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json", "X-Razorpay-Request-Id": input.idempotencyKey },
      body: JSON.stringify({ amount: Number(input.amountMinor), currency: input.currency, receipt: input.orderId, notes: { restaurant_os_order_id: input.orderId } }),
    });
    if (!response.ok) throw new Error(`Razorpay order creation failed: ${response.status}`);
    const data = await response.json() as { id: string; amount: number; currency: string; status: string };
    return {
      providerPaymentId: `pending:${data.id}`,
      providerOrderId: data.id,
      status: "PENDING" as const,
      amountMinor: BigInt(data.amount),
      currency: data.currency,
      metadata: { providerOrderStatus: data.status },
    };
  }

  async verifyPayment(input: { orderId: string; providerOrderId?: string; providerPaymentId: string; signature?: string }): Promise<PaymentVerification> {
    if (!input.providerOrderId || !input.signature) throw new PaymentVerificationError("Razorpay order ID and signature are required.");
    const secret = requireEnv("RAZORPAY_KEY_SECRET");
    const expected = createHmac("sha256", secret).update(`${input.providerOrderId}|${input.providerPaymentId}`).digest("hex");
    if (!safeEqual(expected, input.signature)) throw new PaymentVerificationError("Invalid Razorpay payment signature.");
    const response = await fetch(`${this.baseUrl}/payments/${encodeURIComponent(input.providerPaymentId)}`, { headers: { Authorization: this.authHeader() } });
    if (!response.ok) throw new PaymentVerificationError(`Unable to verify Razorpay payment status: ${response.status}`);
    const payment = await response.json() as { id: string; order_id: string; amount: number; status: string };
    if (payment.id !== input.providerPaymentId || payment.order_id !== input.providerOrderId) throw new PaymentVerificationError("Razorpay payment/order reference mismatch.");
    const status: PaymentVerification["status"] | "PENDING" = payment.status === "captured" ? "CAPTURED" : payment.status === "authorized" ? "AUTHORIZED" : payment.status === "failed" ? "FAILED" : payment.status === "refunded" ? "REFUNDED" : "PENDING";
    if (status === "PENDING") throw new PaymentVerificationError(`Razorpay payment is not in a terminal verification state: ${payment.status}`);
    return { providerPaymentId: input.providerPaymentId, status, amountMinor: BigInt(payment.amount) };
  }

  async verifyWebhook(rawBody: string, signature: string) {
    const secret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!safeEqual(expected, signature)) throw new PaymentVerificationError("Invalid Razorpay webhook signature.");
    const payload = JSON.parse(rawBody) as any;
    const entity = payload?.payload?.payment?.entity ?? payload?.payload?.refund?.entity;
    const eventType = String(payload.event ?? "unknown");
    const status: PaymentStatus | undefined = eventType.includes("captured") ? "CAPTURED" : eventType.includes("authorized") ? "AUTHORIZED" : eventType.includes("failed") ? "FAILED" : eventType.includes("cancelled") ? "CANCELLED" : eventType.includes("refunded") ? "REFUNDED" : undefined;
    return {
      eventId: String(payload.id ?? `${eventType}:${entity?.id ?? "unknown"}`),
      type: eventType,
      paymentId: entity?.id,
      orderId: entity?.order_id,
      status,
      amountMinor: entity?.amount === undefined ? undefined : BigInt(entity.amount),
      refundId: eventType.includes("refund") ? entity?.id : undefined,
    };
  }

  async refund(input: { providerPaymentId: string; amountMinor?: bigint; idempotencyKey: string }) {
    const body = input.amountMinor === undefined ? {} : { amount: Number(input.amountMinor) };
    const response = await fetch(`${this.baseUrl}/payments/${encodeURIComponent(input.providerPaymentId)}/refund`, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json", "X-Razorpay-Request-Id": input.idempotencyKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Razorpay refund failed: ${response.status}`);
    const data = await response.json() as { id: string; amount: number; status: string };
    const status = data.status === "processed" ? "REFUNDED" as const : "PENDING" as const;
    return { providerRefundId: data.id, status, amountMinor: BigInt(data.amount) };
  }
}
