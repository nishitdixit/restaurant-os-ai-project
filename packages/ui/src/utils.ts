// Pure, server-safe helpers shared by server and client components (no "use client").
import { clsx } from "clsx";

export const cx = clsx;

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonBase = "ros-button-text inline-flex items-center justify-center gap-2 rounded-button font-medium transition-colors duration-[var(--animate-duration-fast)] disabled:opacity-50 select-none whitespace-nowrap";
export const buttonVariants: Record<ButtonVariant, string> = {
  primary: "ros-btn-primary hover:brightness-95 active:brightness-90",
  secondary: "bg-subtle text-text hover:bg-border",
  outline: "ros-btn-outline hover:bg-subtle",
  ghost: "text-text hover:bg-subtle",
  danger: "bg-danger text-white hover:brightness-95",
};
export const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm min-h-[44px] sm:min-h-0",
  lg: "h-12 px-5 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], extra);
}

export function formatMoney(minor: number, currency = "INR", locale = "en-IN"): string {
  const value = minor / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

export function formatDateTime(iso: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }, locale = "en-IN", timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(iso));
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

export const ORDER: Record<string, [string, Tone]> = {
  NEW: ["New", "info"], ACCEPTED: ["Accepted", "primary"], PREPARING: ["Preparing", "warning"], READY: ["Ready", "success"], PACKED: ["Packed", "success"],
  DISPATCHED: ["Out for delivery", "info"], DELIVERED: ["Completed", "neutral"], CANCELLED: ["Cancelled", "danger"],
};
export const PAYMENT: Record<string, [string, Tone]> = {
  INITIATED: ["Awaiting payment", "warning"], CREATED: ["Awaiting payment", "warning"], PENDING: ["Awaiting payment", "warning"], REQUIRES_ACTION: ["Action needed", "warning"],
  AUTHORIZED: ["Authorised", "info"], CAPTURED: ["Paid", "success"], FAILED: ["Payment failed", "danger"], EXPIRED: ["Expired", "neutral"],
  CANCELLED: ["Payment cancelled", "neutral"], REFUNDED: ["Refunded", "neutral"], PARTIALLY_REFUNDED: ["Part refunded", "warning"],
};
export const DELIVERY: Record<string, [string, Tone]> = {
  PENDING: ["Pending", "neutral"], ASSIGNED: ["Rider assigned", "info"], PICKED_UP: ["Picked up", "primary"], DELIVERED: ["Delivered", "success"],
  FAILED: ["Delivery failed", "danger"], CANCELLED: ["Cancelled", "neutral"],
};

export function orderStatusLabel(status: string): string {
  return ORDER[status]?.[0] ?? status;
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT[status]?.[0] ?? status;
}
