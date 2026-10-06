// Deterministic customer identity rules (specs/customers): phone numbers are normalized to E.164
// before matching, so "98765 43210", "+91 9876543210" and "09876543210" are the same customer.

export function normalizePhone(input: string | null | undefined, defaultCountry: "IN" = "IN"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (defaultCountry === "IN") {
    if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
    if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
    if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  }
  if (trimmed.startsWith("+") && /^\d{8,15}$/.test(digits) && !digits.startsWith("91")) return `+${digits}`;
  return null;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const value = (input ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
