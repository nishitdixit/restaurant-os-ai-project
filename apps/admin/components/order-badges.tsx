"use client";
import type { AdminOrderSummary } from "@restaurant-os/types";
import { Badge, cx } from "@restaurant-os/ui";
import { CHANNEL_LABELS } from "@/lib/order-labels";

/** Where a staff-entered order came from, and whether its money is still to be collected (ADR-014). */
export function OrderSourceBadges({ order, className }: { order: AdminOrderSummary; className?: string }) {
  const staff = order.channel !== "DIRECT_WEB" && order.channel !== "DIRECT";
  if (!staff && !order.paymentDue) return null;
  return (
    <span className={cx("flex flex-wrap gap-1", className)}>
      {staff && <Badge tone="info">{CHANNEL_LABELS[order.channel] ?? order.channel}</Badge>}
      {order.paymentDue && <Badge tone="warning">Payment due</Badge>}
    </span>
  );
}
