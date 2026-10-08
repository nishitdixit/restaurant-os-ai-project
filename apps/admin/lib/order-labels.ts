// Labels for where an order came from and how a staff-entered order is paid (ADR-014).
import type { StaffOrderChannel, StaffPaymentMethod } from "@restaurant-os/types";

export const CHANNEL_LABELS: Record<string, string> = {
  DIRECT_WEB: "Website", DIRECT: "Website", WHATSAPP: "WhatsApp", PHONE: "Phone", WALK_IN: "Walk-in", OTHER: "Other", SWIGGY: "Swiggy", ZOMATO: "Zomato",
};

export const STAFF_CHANNELS: { value: StaffOrderChannel; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" }, { value: "PHONE", label: "Phone call" }, { value: "WALK_IN", label: "Walk-in / counter" }, { value: "OTHER", label: "Other" },
];

export const PAYMENT_LABELS: Record<StaffPaymentMethod, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", PAY_LATER: "Pay later" };

export const AUDIENCE_LABELS = { PUBLIC: "Everyone · shown on website", CODE_ONLY: "Everyone · code only", STAFF_ONLY: "Staff only" } as const;
