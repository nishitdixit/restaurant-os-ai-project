// Order lifecycle (docs/ORDER_LIFECYCLE.md). "Pending payment" and "paid" are expressed by
// payment_status alongside status NEW; the merchant accepts only paid orders.

export type OrderStatus = "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "PACKED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
export type FulfillmentType = "DELIVERY" | "PICKUP";
export type OrderPaymentStatus =
  | "INITIATED" | "CREATED" | "PENDING" | "REQUIRES_ACTION" | "AUTHORIZED" | "CAPTURED"
  | "FAILED" | "EXPIRED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
export type StaffRole = "OWNER" | "MANAGER" | "KITCHEN" | "STAFF" | "PLATFORM_ADMIN";

const deliveryTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["PACKED", "DISPATCHED", "CANCELLED"],
  PACKED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

// Pickup orders are handed over at the counter: READY/PACKED -> DELIVERED ("collected").
const pickupTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["PACKED", "DELIVERED", "CANCELLED"],
  PACKED: ["DELIVERED", "CANCELLED"],
  DISPATCHED: [],
  DELIVERED: [],
  CANCELLED: [],
};

export function allowedTransitions(from: OrderStatus, fulfillment: FulfillmentType = "DELIVERY"): readonly OrderStatus[] {
  return (fulfillment === "PICKUP" ? pickupTransitions : deliveryTransitions)[from];
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, fulfillment: FulfillmentType = "DELIVERY"): boolean {
  return allowedTransitions(from, fulfillment).includes(to);
}

export class InvalidOrderTransitionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "InvalidOrderTransitionError";
  }
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus, fulfillment: FulfillmentType = "DELIVERY"): void {
  if (!canTransitionOrder(from, to, fulfillment)) {
    throw new InvalidOrderTransitionError("INVALID_TRANSITION", `Invalid order transition: ${from} -> ${to}`);
  }
}

export const PAID_STATUSES: readonly OrderPaymentStatus[] = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"];

export function isPaid(paymentStatus: OrderPaymentStatus): boolean {
  return paymentStatus === "CAPTURED";
}

/**
 * Full transition policy: the state machine, the payment policy (only captured orders move past
 * NEW) and the role policy for late cancellations (once cooking starts only OWNER/MANAGER cancel).
 */
export function assertOrderTransitionAllowed(input: {
  from: OrderStatus;
  to: OrderStatus;
  fulfillment: FulfillmentType;
  paymentStatus: OrderPaymentStatus;
  role: StaffRole;
}): void {
  assertOrderTransition(input.from, input.to, input.fulfillment);
  if (input.from === "NEW" && input.to === "ACCEPTED" && !isPaid(input.paymentStatus)) {
    throw new InvalidOrderTransitionError("PAYMENT_NOT_CAPTURED", "This order has not been paid yet, so it cannot be accepted.");
  }
  if (input.to === "CANCELLED" && !["NEW", "ACCEPTED"].includes(input.from) && !["OWNER", "MANAGER", "PLATFORM_ADMIN"].includes(input.role)) {
    throw new InvalidOrderTransitionError("CANCELLATION_NOT_PERMITTED", "Only an owner or manager can cancel an order after preparation has started.");
  }
}

export const CANCEL_REASON_CODES = [
  "CUSTOMER_REQUEST",
  "ITEM_UNAVAILABLE",
  "KITCHEN_CLOSED",
  "ADDRESS_ISSUE",
  "DELIVERY_FAILED",
  "PAYMENT_NOT_COMPLETED",
  "DUPLICATE_ORDER",
  "OTHER",
] as const;
export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];

export const CANCEL_REASON_LABELS: Record<CancelReasonCode, string> = {
  CUSTOMER_REQUEST: "Customer requested",
  ITEM_UNAVAILABLE: "Item unavailable",
  KITCHEN_CLOSED: "Kitchen closed / too busy",
  ADDRESS_ISSUE: "Address problem",
  DELIVERY_FAILED: "Delivery failed",
  PAYMENT_NOT_COMPLETED: "Payment not completed",
  DUPLICATE_ORDER: "Duplicate order",
  OTHER: "Other",
};

/** The status timestamp column each transition sets (first time only). */
export function timestampColumnFor(to: OrderStatus): string | null {
  switch (to) {
    case "ACCEPTED": return "accepted_at";
    case "READY": return "ready_at";
    case "DISPATCHED": return "dispatched_at";
    case "DELIVERED": return "completed_at";
    case "CANCELLED": return "cancelled_at";
    default: return null;
  }
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  PACKED: "Packed",
  DISPATCHED: "Out for delivery",
  DELIVERED: "Completed",
  CANCELLED: "Cancelled",
};
