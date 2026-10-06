import { env } from "../../config/env.ts";
import { MockPaymentProvider } from "./mock.ts";
import { RazorpayPaymentProvider } from "./razorpay.ts";
import type { PaymentProvider } from "./types.ts";

let override: PaymentProvider | undefined;
let singleton: PaymentProvider | undefined;

export function paymentProvider(): PaymentProvider {
  if (override) return override;
  if (!singleton) {
    const config = env();
    singleton = config.PAYMENT_PROVIDER === "razorpay"
      ? new RazorpayPaymentProvider()
      : new MockPaymentProvider("success", config.MOCK_PAYMENT_SECRET);
  }
  return singleton as PaymentProvider;
}

export function setPaymentProviderForTests(provider: PaymentProvider | undefined): void {
  override = provider;
}

export class PaymentService {
  constructor(private readonly provider: PaymentProvider) {}
  get providerName() { return this.provider.name; }
  createIntent(input: Parameters<PaymentProvider["createIntent"]>[0]) { return this.provider.createIntent(input); }
  verifyPayment(input: Parameters<PaymentProvider["verifyPayment"]>[0]) { return this.provider.verifyPayment(input); }
  verifyWebhook(rawBody: string, signature: string) { return this.provider.verifyWebhook(rawBody, signature); }
  refund(input: Parameters<PaymentProvider["refund"]>[0]) { return this.provider.refund(input); }
}
