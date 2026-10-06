// Small shared helpers for money formatting, cursors and timestamps at the API boundary.
import { randomBytes } from "node:crypto";

export function formatMoney(minor: bigint | number, currency = "INR", locale = "en-IN"): string {
  const value = Number(minor) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
}

export function moneyFormatter(currency: string, locale = "en-IN") {
  return (minor: bigint) => formatMoney(minor, currency, locale);
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function publicToken(): string {
  return randomBytes(18).toString("base64url");
}

export interface Cursor { at: string; id: string }

export function encodeCursor(at: Date | string, id: string): string {
  return Buffer.from(JSON.stringify({ at: iso(at), id })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): Cursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Cursor;
    return typeof parsed.at === "string" && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}
