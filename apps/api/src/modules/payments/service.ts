// Payment lifecycle (docs/PAYMENTS.md, specs/payments). Browser claims are never trusted: every
// status change comes from provider verification (signed) or a verified webhook, is applied
// idempotently under a row lock, and is checked against the server-created amount.
import type { PaymentAction, PaymentStatus } from "@restaurant-os/types";
import { withTransaction, type Tx } from "../../db/pool.ts";
import { ApiError, notFound } from "../../lib/errors.ts";
import { audit, emitEvent, type AuditActor } from "../../lib/events.ts";
import { MockPaymentProvider, type MockPaymentOutcome } from "../../integrations/payments/mock.ts";
import { paymentProvider } from "../../integrations/payments/service.ts";
import { PaymentVerificationError, type PaymentVerification } from "../../integrations/payments/types.ts";
import { canRetryPayment, ORDER_COLUMNS, refundedTotal, type OrderRow } from "../orders/read.ts";

interface PaymentRow {
  id: string;
  tenant_id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  status: PaymentStatus;
  amount_minor: number;
  currency: string;
  created_at: Date;
}

const PAYMENT_COLUMNS = `id, tenant_id, order_id, provider, provider_payment_id, provider_order_id, status, amount_minor, trim(currency) AS currency, created_at`;

export function paymentAction(provider: string, token: string, checkoutUrl?: string | null): PaymentAction {
  if (provider === "mock") return { type: "MOCK_CHECKOUT", url: `/order/${token}/pay` };
  if (checkoutUrl) return { type: "REDIRECT", url: checkoutUrl };
  return { type: "NONE", url: null };
}

async function lockOrder(tx: Tx, tenantId: string, orderId: string): Promise<OrderRow> {
  const r = await tx.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1 AND o.tenant_id = $2 FOR UPDATE`, [orderId, tenantId]);
  if (!r.rowCount) throw notFound("Order", "ORDER_NOT_FOUND");
  return r.rows[0]!;
}

/** Creates (or reuses) the pending payment attempt for an unpaid order. */
export async function startPayment(tenantId: string, orderId: string): Promise<{ status: PaymentStatus; action: PaymentAction }> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, tenantId, orderId);
    if (order.payment_status === "CAPTURED") return { status: "CAPTURED" as PaymentStatus, action: { type: "NONE", url: null } };
    if (!canRetryPayment(order)) throw new ApiError(409, "PAYMENT_WINDOW_CLOSED", "This order can no longer be paid. Please place a new order.");

    const pending = await tx.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE tenant_id = $1 AND order_id = $2 AND status IN ('CREATED','PENDING') ORDER BY created_at DESC LIMIT 1`,
      [tenantId, orderId],
    );
    if (pending.rowCount) {
      const p = pending.rows[0]!;
      return { status: p.status, action: paymentAction(p.provider, order.public_token) };
    }
    const attempts = await tx.query<{ n: number }>(`SELECT count(*) AS n FROM payments WHERE order_id = $1`, [orderId]);
    const idempotencyKey = `order:${orderId}:attempt:${attempts.rows[0]!.n + 1}`;
    const provider = paymentProvider();
    let intent;
    try {
      intent = await provider.createIntent({ amountMinor: BigInt(order.total_minor), currency: order.currency, orderId, idempotencyKey });
    } catch (error) {
      throw new ApiError(502, "PAYMENT_INITIATION_FAILED", "We couldn't start the payment. Please try again.", { cause: (error as Error).message });
    }
    if (intent.amountMinor !== BigInt(order.total_minor)) throw new ApiError(502, "PAYMENT_AMOUNT_MISMATCH", "The payment provider returned an unexpected amount.");
    await tx.query(
      `INSERT INTO payments (tenant_id, order_id, provider, provider_payment_id, provider_order_id, status, amount_minor, currency, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::payment_status, $7, $8, $9, $10)`,
      [tenantId, orderId, provider.name, intent.providerPaymentId, intent.providerOrderId ?? null, intent.status, order.total_minor, order.currency, idempotencyKey, JSON.stringify({ ...(intent.metadata ?? {}), checkoutUrl: intent.checkoutUrl ?? null })],
    );
    await tx.query(`UPDATE orders SET payment_status = 'PENDING'::payment_status, updated_at = now() WHERE id = $1 AND payment_status <> 'CAPTURED'`, [orderId]);
    return { status: intent.status, action: paymentAction(provider.name, order.public_token, intent.checkoutUrl) };
  });
}

/**
 * Applies a verified provider result. Idempotent: a repeated result is a no-op, a captured payment
 * never moves backwards, and the amount must equal the server-created amount.
 */
export async function applyPaymentResult(tx: Tx, paymentId: string, result: Pick<PaymentVerification, "status" | "amountMinor">, source: string): Promise<{ changed: boolean; status: PaymentStatus }> {
  const r = await tx.query<PaymentRow>(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1 FOR UPDATE`, [paymentId]);
  const payment = r.rows[0];
  if (!payment) throw notFound("Payment", "PAYMENT_NOT_FOUND");
  if (payment.status === result.status) return { changed: false, status: payment.status };
  if (["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status)) return { changed: false, status: payment.status };
  if ((result.status === "CAPTURED" || result.status === "AUTHORIZED") && result.amountMinor !== undefined && result.amountMinor !== BigInt(payment.amount_minor)) {
    await audit(tx, { tenantId: payment.tenant_id, userId: null }, "PaymentAmountMismatch", { type: "Payment", id: payment.id }, { expected: payment.amount_minor, received: result.amountMinor.toString(), source });
    throw new ApiError(409, "PAYMENT_AMOUNT_MISMATCH", "The verified payment amount does not match this order.");
  }

  await tx.query(
    `UPDATE payments SET status = $1::payment_status,
       captured_at = CASE WHEN $1::payment_status = 'CAPTURED' THEN now() ELSE captured_at END,
       cancelled_at = CASE WHEN $1::payment_status IN ('CANCELLED','FAILED') THEN now() ELSE cancelled_at END,
       updated_at = now()
     WHERE id = $2`,
    [result.status, payment.id],
  );
  const order = await lockOrder(tx, payment.tenant_id, payment.order_id);

  if (result.status === "CAPTURED") {
    await tx.query(`UPDATE orders SET payment_status = 'CAPTURED', paid_at = coalesce(paid_at, now()), updated_at = now() WHERE id = $1`, [order.id]);
    if (order.status === "CANCELLED") {
      // Money arrived after the payment window closed: keep the order cancelled and flag it for refund.
      await audit(tx, { tenantId: order.tenant_id, userId: null }, "PaymentCapturedForCancelledOrder", { type: "Order", id: order.id }, { paymentId: payment.id, source });
      await emitEvent(tx, { tenantId: order.tenant_id, type: "PaymentCapturedAfterCancellation", aggregateType: "Order", aggregateId: order.id, payload: { paymentId: payment.id } });
    } else {
      await emitEvent(tx, { tenantId: order.tenant_id, type: "PaymentCaptured", aggregateType: "Order", aggregateId: order.id, payload: { paymentId: payment.id, amountMinor: payment.amount_minor } });
    }
  } else if (result.status === "AUTHORIZED") {
    await tx.query(`UPDATE orders SET payment_status = 'AUTHORIZED', updated_at = now() WHERE id = $1 AND payment_status <> 'CAPTURED'`, [order.id]);
  } else if (result.status === "FAILED" || result.status === "CANCELLED") {
    const updated = await tx.query(`UPDATE orders SET payment_status = $1::payment_status, updated_at = now() WHERE id = $2 AND payment_status NOT IN ('CAPTURED','REFUNDED','PARTIALLY_REFUNDED')`, [result.status, order.id]);
    if (updated.rowCount && order.status !== "CANCELLED") {
      await emitEvent(tx, { tenantId: order.tenant_id, type: "PaymentFailed", aggregateType: "Order", aggregateId: order.id, payload: { paymentId: payment.id, status: result.status } });
    }
  }
  return { changed: true, status: result.status };
}

/** Mock checkout: the customer picks an outcome; the server signs and verifies it like a provider callback. */
export async function completeMockPayment(tenantId: string, orderId: string, outcome: MockPaymentOutcome): Promise<PaymentStatus> {
  const provider = paymentProvider();
  if (!(provider instanceof MockPaymentProvider)) throw new ApiError(404, "ROUTE_NOT_FOUND", "Mock payments are disabled.");
  const started = await startPayment(tenantId, orderId);
  if (started.status === "CAPTURED") return "CAPTURED";
  return withTransaction(async (tx) => {
    const p = await tx.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE tenant_id = $1 AND order_id = $2 AND status IN ('CREATED','PENDING') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [tenantId, orderId],
    );
    const payment = p.rows[0];
    if (!payment) throw new ApiError(409, "PAYMENT_NOT_PENDING", "There is no pending payment for this order.");
    const verification = await provider.verifyPayment({
      orderId, providerPaymentId: payment.provider_payment_id!, providerOrderId: payment.provider_order_id ?? undefined,
      signature: provider.signOutcome(payment.provider_payment_id!, outcome), expectedAmountMinor: BigInt(payment.amount_minor),
    });
    return (await applyPaymentResult(tx, payment.id, verification, "mock-checkout")).status;
  });
}

/** Provider redirect/callback verification (e.g. Razorpay checkout handler). */
export async function verifyPayment(tenantId: string, orderId: string, input: { providerPaymentId: string; providerOrderId?: string; signature?: string }): Promise<PaymentStatus> {
  return withTransaction(async (tx) => {
    const p = await tx.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE tenant_id = $1 AND order_id = $2 AND (provider_payment_id = $3 OR provider_order_id = $4) ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [tenantId, orderId, input.providerPaymentId, input.providerOrderId ?? null],
    );
    const payment = p.rows[0];
    if (!payment) throw notFound("Payment", "PAYMENT_NOT_FOUND");
    try {
      const verification = await paymentProvider().verifyPayment({ orderId, ...input, expectedAmountMinor: BigInt(payment.amount_minor) });
      if (payment.provider_payment_id !== verification.providerPaymentId) {
        await tx.query(`UPDATE payments SET provider_payment_id = $1 WHERE id = $2`, [verification.providerPaymentId, payment.id]);
      }
      return (await applyPaymentResult(tx, payment.id, verification, "verify")).status;
    } catch (error) {
      if (error instanceof PaymentVerificationError) throw new ApiError(400, "PAYMENT_VERIFICATION_FAILED", error.message);
      throw error;
    }
  });
}

/** Verified, replay-safe webhook processing (docs/API_CONTRACTS.md "Webhooks"). */
export async function handlePaymentWebhook(rawBody: string, signature: string): Promise<{ duplicate: boolean }> {
  const provider = paymentProvider();
  let event;
  try {
    event = await provider.verifyWebhook(rawBody, signature);
  } catch {
    throw new ApiError(401, "INVALID_SIGNATURE", "Webhook signature verification failed.");
  }
  return withTransaction(async (tx) => {
    const payment = event.paymentId || event.orderId
      ? (await tx.query<PaymentRow>(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE provider = $1 AND (provider_payment_id = $2 OR provider_order_id = $3) ORDER BY created_at DESC LIMIT 1`, [provider.name, event.paymentId ?? null, event.orderId ?? null])).rows[0]
      : undefined;
    const inserted = await tx.query(
      `INSERT INTO payment_webhook_events (tenant_id, provider, provider_event_id, event_type, payload) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [payment?.tenant_id ?? null, provider.name, event.eventId, event.type, rawBody],
    );
    if (!inserted.rowCount) return { duplicate: true };
    if (payment && event.status && ["CAPTURED", "AUTHORIZED", "FAILED", "CANCELLED"].includes(event.status)) {
      if (event.paymentId && payment.provider_payment_id !== event.paymentId) {
        await tx.query(`UPDATE payments SET provider_payment_id = $1 WHERE id = $2`, [event.paymentId, payment.id]);
      }
      await applyPaymentResult(tx, payment.id, { status: event.status as PaymentVerification["status"], amountMinor: event.amountMinor }, `webhook:${event.type}`);
    }
    await tx.query(`UPDATE payment_webhook_events SET processed_at = now() WHERE id = $1`, [(inserted.rows[0] as { id: string }).id]);
    return { duplicate: false };
  });
}

/** Refunds part or all of an order's captured payment. Separate financial record; idempotent by key. */
export async function refundOrder(
  actor: AuditActor,
  orderId: string,
  input: { amountMinor?: number; reason: string; idempotencyKey: string },
): Promise<{ refundedMinor: number; paymentStatus: PaymentStatus; duplicate: boolean }> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.tenantId, orderId);
    const p = await tx.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE tenant_id = $1 AND order_id = $2 AND status IN ('CAPTURED','PARTIALLY_REFUNDED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [actor.tenantId, orderId],
    );
    const payment = p.rows[0];
    if (!payment) throw new ApiError(409, "PAYMENT_NOT_REFUNDABLE", "This order has no captured payment to refund.");
    const existing = await tx.query<{ amount_minor: number }>(`SELECT amount_minor FROM payment_refunds WHERE tenant_id = $1 AND payment_id = $2 AND idempotency_key = $3`, [actor.tenantId, payment.id, input.idempotencyKey]);
    const already = await refundedTotal(tx, orderId);
    if (existing.rowCount) return { refundedMinor: already, paymentStatus: order.payment_status, duplicate: true };
    const refundable = payment.amount_minor - already;
    const amount = input.amountMinor ?? refundable;
    if (amount <= 0 || amount > refundable) throw new ApiError(422, "REFUND_AMOUNT_INVALID", `You can refund up to ${refundable / 100} ${payment.currency}.`, { refundableMinor: refundable });

    // Money collected by the restaurant itself (staff-entered orders, ADR-014) is returned by the restaurant; the
    // refund is recorded so totals and analytics stay right.
    let refund: { providerRefundId: string | null; status: string };
    if (payment.provider === "manual") refund = { providerRefundId: null, status: "REFUNDED" };
    else try {
      refund = await paymentProvider().refund({
        providerPaymentId: payment.provider_payment_id!, amountMinor: BigInt(amount), idempotencyKey: input.idempotencyKey,
        capturedAmountMinor: BigInt(payment.amount_minor), alreadyRefundedMinor: BigInt(already),
      });
    } catch (error) {
      throw new ApiError(502, "REFUND_FAILED", "The payment provider could not process the refund. Please try again.", { cause: (error as Error).message });
    }
    await tx.query(
      `INSERT INTO payment_refunds (tenant_id, payment_id, provider_refund_id, status, amount_minor, idempotency_key, reason) VALUES ($1, $2, $3, $4::payment_status, $5, $6, $7)`,
      [actor.tenantId, payment.id, refund.providerRefundId, refund.status === "PENDING" ? "PENDING" : "REFUNDED", amount, input.idempotencyKey, input.reason],
    );
    const total = already + amount;
    const status: PaymentStatus = total >= payment.amount_minor ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.query(`UPDATE payments SET status = $1::payment_status, updated_at = now() WHERE id = $2`, [status, payment.id]);
    await tx.query(`UPDATE orders SET payment_status = $1::payment_status, updated_at = now() WHERE id = $2`, [status, orderId]);
    await audit(tx, actor, "PaymentRefunded", { type: "Order", id: orderId }, { amountMinor: amount, reason: input.reason, totalRefundedMinor: total, providerRefundId: refund.providerRefundId });
    return { refundedMinor: total, paymentStatus: status, duplicate: false };
  });
}

/**
 * Cancels orders whose payment window passed without a capture, releasing promotion usage.
 * Runs from the worker; safe to run concurrently (SKIP LOCKED) and repeatedly.
 */
export async function expireUnpaidOrders(windowMinutes: number, limit = 100): Promise<number> {
  return withTransaction(async (tx) => {
    const r = await tx.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM orders
       WHERE status = 'NEW' AND payment_status NOT IN ('CAPTURED','AUTHORIZED','REFUNDED','PARTIALLY_REFUNDED')
         AND created_at < now() - make_interval(mins => $1)
       ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [windowMinutes, limit],
    );
    for (const order of r.rows) {
      await tx.query(
        `UPDATE orders SET status = 'CANCELLED', cancelled_at = now(), cancel_reason_code = 'PAYMENT_NOT_COMPLETED', cancel_note = 'Payment was not completed in time.', updated_at = now() WHERE id = $1`,
        [order.id],
      );
      await tx.query(`UPDATE payments SET status = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE order_id = $1 AND status IN ('CREATED','PENDING')`, [order.id]);
      await tx.query(`INSERT INTO order_status_events (tenant_id, order_id, from_status, to_status, reason_code, note) VALUES ($1, $2, 'NEW', 'CANCELLED', 'PAYMENT_NOT_COMPLETED', 'Payment window expired')`, [order.tenant_id, order.id]);
      await releasePromotion(tx, order.tenant_id, order.id);
    }
    return r.rowCount ?? 0;
  });
}

/** Returns promotion usage held by a cancelled order. */
export async function releasePromotion(tx: Tx, tenantId: string, orderId: string): Promise<void> {
  const released = await tx.query<{ promotion_id: string }>(`DELETE FROM promotion_redemptions WHERE tenant_id = $1 AND order_id = $2 RETURNING promotion_id`, [tenantId, orderId]);
  for (const row of released.rows) {
    await tx.query(`UPDATE promotions SET usage_count = greatest(usage_count - 1, 0), updated_at = now() WHERE id = $1`, [row.promotion_id]);
  }
}
