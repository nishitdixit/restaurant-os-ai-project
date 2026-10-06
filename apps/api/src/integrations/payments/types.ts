export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface PaymentIntent {
  providerPaymentId: string;
  providerOrderId?: string;
  status: PaymentStatus;
  checkoutUrl?: string;
  amountMinor: bigint;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentVerification {
  providerPaymentId: string;
  status: Extract<PaymentStatus, "AUTHORIZED" | "CAPTURED" | "FAILED" | "CANCELLED" | "REFUNDED">;
  eventId?: string;
  amountMinor?: bigint;
}

export interface PaymentRefund {
  providerRefundId: string;
  status: Extract<PaymentStatus, "PENDING" | "REFUNDED" | "PARTIALLY_REFUNDED">;
  amountMinor: bigint;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: {
    amountMinor: bigint;
    currency: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<PaymentIntent>;
  verifyPayment(input: {
    orderId: string;
    providerOrderId?: string;
    providerPaymentId: string;
    signature?: string;
    /** The server-created amount, for providers that cannot report one themselves. */
    expectedAmountMinor?: bigint;
  }): Promise<PaymentVerification>;
  verifyWebhook(rawBody: string, signature: string): Promise<{
    eventId: string;
    type: string;
    paymentId?: string;
    orderId?: string;
    status?: PaymentStatus;
    amountMinor?: bigint;
    refundId?: string;
  }>;
  refund(input: {
    providerPaymentId: string;
    amountMinor?: bigint;
    idempotencyKey: string;
    /** Server-side ledger values so stateless providers can report partial vs full refunds. */
    capturedAmountMinor?: bigint;
    alreadyRefundedMinor?: bigint;
  }): Promise<PaymentRefund>;
}

export class PaymentProviderNotConfigured extends Error {
  constructor(message = "Payment provider is not configured.") {
    super(message);
    this.name = "PaymentProviderNotConfigured";
  }
}

export class PaymentVerificationError extends Error {
  constructor(message = "Payment verification failed.") {
    super(message);
    this.name = "PaymentVerificationError";
  }
}
