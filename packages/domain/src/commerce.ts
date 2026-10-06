// Money, cart pricing and modifier rules. All amounts are integer minor units (ADR-005).

export type Money = Readonly<{ minor: bigint; currency: string }>;

export function money(minor: bigint | number, currency: string): Money {
  const value = typeof minor === "number" ? BigInt(minor) : minor;
  if (value < 0n) throw new Error("Money cannot be negative.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be an ISO 4217 code.");
  return { minor: value, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error("Currency mismatch.");
  return money(a.minor + b.minor, a.currency);
}

export function percentageDiscount(subtotal: bigint, percent: bigint): bigint {
  if (subtotal < 0n || percent < 0n || percent > 100n) throw new Error("Invalid discount.");
  return (subtotal * percent) / 100n;
}

export function fixedDiscount(subtotal: bigint, amount: bigint): bigint {
  if (subtotal < 0n || amount < 0n) throw new Error("Invalid discount.");
  return amount > subtotal ? subtotal : amount;
}

export {
  type OrderStatus,
  type FulfillmentType,
  canTransitionOrder,
  assertOrderTransition,
  InvalidOrderTransitionError,
} from "./orders.ts";

export class CartValidationError extends Error {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "CartValidationError";
  }
}

export interface CartLine {
  productId: string;
  unitPriceMinor: bigint;
  quantity: number;
  available: boolean;
}

export const MAX_LINE_QUANTITY = 50;

export function calculateCart(lines: readonly CartLine[], feeMinor: bigint, discountMinor: bigint) {
  if (!lines.length) throw new CartValidationError("EMPTY_CART", "Cart is empty.");
  const unavailable = lines.filter((line) => !line.available).map((line) => line.productId);
  if (unavailable.length) throw new CartValidationError("ITEM_UNAVAILABLE", "Cart contains unavailable items.", { productIds: unavailable });
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
      throw new CartValidationError("INVALID_QUANTITY", `Quantity must be between 1 and ${MAX_LINE_QUANTITY}.`, { productId: line.productId });
    }
    if (line.unitPriceMinor < 0n) throw new CartValidationError("INVALID_PRICE", "Line price cannot be negative.");
  }
  if (feeMinor < 0n || discountMinor < 0n) throw new CartValidationError("INVALID_COMPONENTS", "Invalid checkout components.");
  const subtotal = lines.reduce((sum, line) => sum + line.unitPriceMinor * BigInt(line.quantity), 0n);
  const discount = discountMinor > subtotal ? subtotal : discountMinor;
  return { subtotalMinor: subtotal, discountMinor: discount, feeMinor, totalMinor: subtotal - discount + feeMinor };
}

// Modifiers -----------------------------------------------------------------------------------

export interface ModifierOption {
  id: string;
  name: string;
  priceDeltaMinor: bigint;
  active: boolean;
}

export interface ModifierGroupRule {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  modifiers: readonly ModifierOption[];
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  modifierId: string;
  name: string;
  priceDeltaMinor: bigint;
}

/**
 * Validates a customer's modifier selection against the product's groups and returns the
 * priced selection. Unknown ids, inactive options and min/max violations are rejected.
 */
export function resolveModifierSelection(groups: readonly ModifierGroupRule[], selectedIds: readonly string[]): SelectedModifier[] {
  const unique = new Set(selectedIds);
  if (unique.size !== selectedIds.length) throw new CartValidationError("INVALID_MODIFIERS", "A modifier was selected more than once.");
  const byId = new Map<string, { group: ModifierGroupRule; option: ModifierOption }>();
  for (const group of groups) for (const option of group.modifiers) byId.set(option.id, { group, option });

  const selected: SelectedModifier[] = [];
  for (const id of selectedIds) {
    const match = byId.get(id);
    if (!match) throw new CartValidationError("INVALID_MODIFIERS", "A selected option is not offered for this item.", { modifierId: id });
    if (!match.option.active) throw new CartValidationError("MODIFIER_UNAVAILABLE", `${match.option.name} is no longer available.`, { modifierId: id });
    selected.push({ groupId: match.group.id, groupName: match.group.name, modifierId: id, name: match.option.name, priceDeltaMinor: match.option.priceDeltaMinor });
  }
  for (const group of groups) {
    const count = selected.filter((s) => s.groupId === group.id).length;
    if (count < group.minSelections) {
      throw new CartValidationError("MODIFIER_REQUIRED", group.minSelections === 1 ? `Choose an option for ${group.name}.` : `Choose at least ${group.minSelections} options for ${group.name}.`, { groupId: group.id });
    }
    if (count > group.maxSelections) {
      throw new CartValidationError("TOO_MANY_MODIFIERS", `Choose at most ${group.maxSelections} options for ${group.name}.`, { groupId: group.id });
    }
  }
  return selected;
}

export function unitPriceWithModifiers(basePriceMinor: bigint, modifiers: readonly SelectedModifier[]): bigint {
  const total = modifiers.reduce((sum, m) => sum + m.priceDeltaMinor, basePriceMinor);
  if (total < 0n) throw new CartValidationError("INVALID_PRICE", "Item price cannot be negative.");
  return total;
}
