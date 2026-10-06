import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOrderTransitionAllowed, calculateCart, canTransitionOrder, evaluatePromotion, findServiceableZone, isOpenAt,
  nextOpening, normalizePhone, normalizePincode, resolveModifierSelection, slugify, unitPriceWithModifiers,
  type DeliveryZone, type PromotionContext, type PromotionRule,
} from "./index.ts";

const fmt = (minor: bigint) => `₹${Number(minor) / 100}`;

test("cart totals are computed from server prices and clamp discount to subtotal", () => {
  const r = calculateCart([{ productId: "a", unitPriceMinor: 500n, quantity: 2, available: true }], 100n, 5000n);
  assert.equal(r.subtotalMinor, 1000n);
  assert.equal(r.discountMinor, 1000n);
  assert.equal(r.totalMinor, 100n);
});

test("cart rejects unavailable lines, empty carts and bad quantities", () => {
  assert.throws(() => calculateCart([], 0n, 0n), /empty/);
  assert.throws(() => calculateCart([{ productId: "a", unitPriceMinor: 1n, quantity: 1, available: false }], 0n, 0n), /unavailable/);
  assert.throws(() => calculateCart([{ productId: "a", unitPriceMinor: 1n, quantity: 0, available: true }], 0n, 0n), /Quantity/);
  assert.throws(() => calculateCart([{ productId: "a", unitPriceMinor: 1n, quantity: 1.5, available: true }], 0n, 0n), /Quantity/);
});

const groups = [
  { id: "size", name: "Size", minSelections: 1, maxSelections: 1, modifiers: [
    { id: "half", name: "Half", priceDeltaMinor: 0n, active: true },
    { id: "full", name: "Full", priceDeltaMinor: 12000n, active: true },
  ] },
  { id: "extras", name: "Extras", minSelections: 0, maxSelections: 2, modifiers: [
    { id: "egg", name: "Egg", priceDeltaMinor: 2000n, active: true },
    { id: "raita", name: "Raita", priceDeltaMinor: 3000n, active: true },
    { id: "gone", name: "Gone", priceDeltaMinor: 100n, active: false },
  ] },
];

test("modifier selection enforces required groups, max, unknown and inactive options", () => {
  const sel = resolveModifierSelection(groups, ["full", "egg"]);
  assert.equal(unitPriceWithModifiers(30000n, sel), 44000n);
  assert.throws(() => resolveModifierSelection(groups, []), /Choose an option for Size/);
  assert.throws(() => resolveModifierSelection(groups, ["half", "full"]), /at most 1/);
  assert.throws(() => resolveModifierSelection(groups, ["half", "nope"]), /not offered/);
  assert.throws(() => resolveModifierSelection(groups, ["half", "gone"]), /no longer available/);
  assert.throws(() => resolveModifierSelection(groups, ["half", "egg", "egg"]), /more than once/);
});

test("order state machine follows fulfillment type", () => {
  assert.equal(canTransitionOrder("NEW", "DELIVERED"), false);
  assert.equal(canTransitionOrder("READY", "DISPATCHED", "DELIVERY"), true);
  assert.equal(canTransitionOrder("READY", "DISPATCHED", "PICKUP"), false);
  assert.equal(canTransitionOrder("READY", "DELIVERED", "PICKUP"), true);
  assert.equal(canTransitionOrder("DELIVERED", "CANCELLED"), false);
});

test("unpaid orders cannot be accepted and late cancellations need a manager", () => {
  assert.throws(() => assertOrderTransitionAllowed({ from: "NEW", to: "ACCEPTED", fulfillment: "DELIVERY", paymentStatus: "PENDING", role: "OWNER" }), /not been paid/);
  assertOrderTransitionAllowed({ from: "NEW", to: "ACCEPTED", fulfillment: "DELIVERY", paymentStatus: "CAPTURED", role: "KITCHEN" });
  assertOrderTransitionAllowed({ from: "ACCEPTED", to: "CANCELLED", fulfillment: "DELIVERY", paymentStatus: "CAPTURED", role: "STAFF" });
  assert.throws(() => assertOrderTransitionAllowed({ from: "PREPARING", to: "CANCELLED", fulfillment: "DELIVERY", paymentStatus: "CAPTURED", role: "KITCHEN" }), /owner or manager/);
  assertOrderTransitionAllowed({ from: "PREPARING", to: "CANCELLED", fulfillment: "DELIVERY", paymentStatus: "CAPTURED", role: "MANAGER" });
});

const promo = (overrides: Partial<PromotionRule> = {}): PromotionRule => ({
  code: "SAVE", type: "PERCENTAGE", value: 20n, active: true, startsAt: new Date("2026-01-01"), endsAt: new Date("2027-01-01"),
  minimumOrderMinor: 30000n, maxDiscountMinor: 10000n, usageCap: 10, usageCount: 0, newCustomerOnly: false, oncePerCustomer: false, ...overrides,
});
const ctx: PromotionContext = { subtotalMinor: 100000n, now: new Date("2026-06-01"), customerPriorOrders: 0, customerPriorRedemptions: 0, formatMoney: fmt };

test("promotion discount respects percentage cap and fixed clamp", () => {
  assert.deepEqual(evaluatePromotion(promo(), ctx), { eligible: true, discountMinor: 10000n });
  assert.deepEqual(evaluatePromotion(promo({ maxDiscountMinor: null }), ctx), { eligible: true, discountMinor: 20000n });
  assert.deepEqual(evaluatePromotion(promo({ type: "FIXED", value: 500000n, minimumOrderMinor: 0n, maxDiscountMinor: null }), ctx), { eligible: true, discountMinor: 100000n });
});

test("promotion eligibility rules", () => {
  const reason = (r: PromotionRule, c = ctx) => { const e = evaluatePromotion(r, c); return e.eligible ? "OK" : e.reason; };
  assert.equal(reason(promo({ active: false })), "NOT_ACTIVE");
  assert.equal(reason(promo({ startsAt: new Date("2026-07-01") })), "NOT_STARTED");
  assert.equal(reason(promo({ endsAt: new Date("2026-06-01") })), "EXPIRED");
  assert.equal(reason(promo({ usageCount: 10 })), "USAGE_LIMIT_REACHED");
  assert.equal(reason(promo(), { ...ctx, subtotalMinor: 29999n }), "MINIMUM_NOT_MET");
  assert.equal(reason(promo({ newCustomerOnly: true }), { ...ctx, customerPriorOrders: 1 }), "NEW_CUSTOMERS_ONLY");
  assert.equal(reason(promo({ newCustomerOnly: true }), { ...ctx, customerPriorOrders: null }), "OK");
  assert.equal(reason(promo({ oncePerCustomer: true }), { ...ctx, customerPriorRedemptions: 1 }), "ALREADY_USED");
  const e = evaluatePromotion(promo(), { ...ctx, subtotalMinor: 25000n });
  assert.ok(!e.eligible && e.message.includes("Add ₹50 more"));
});

const zone = (overrides: Partial<DeliveryZone>): DeliveryZone => ({
  id: "z", name: "Z", rule: { type: "POSTAL_CODE", postalCodes: ["560038"] }, feeMinor: 3000n, minimumOrderMinor: 0n, etaMin: 30, etaMax: 45, active: true, ...overrides,
});

test("serviceability prefers the cheapest matching zone and supports radius with location", () => {
  const outlet = { latitude: 12.9784, longitude: 77.6408 };
  const zones = [
    zone({ id: "pin", feeMinor: 4000n }),
    zone({ id: "near", rule: { type: "RADIUS", radiusKm: 3 }, feeMinor: 2000n }),
    zone({ id: "off", active: false, feeMinor: 0n }),
  ];
  const byPin = findServiceableZone(zones, { postalCode: "560 038" }, outlet);
  assert.ok(byPin.serviceable && byPin.zone.id === "pin");
  const byLoc = findServiceableZone(zones, { postalCode: "560038", location: { latitude: 12.97, longitude: 77.64 } }, outlet);
  assert.ok(byLoc.serviceable && byLoc.zone.id === "near");
  const far = findServiceableZone(zones, { postalCode: "110001" }, outlet);
  assert.ok(!far.serviceable && far.reason === "NOT_SERVICEABLE");
  const bad = findServiceableZone(zones, { postalCode: "12" }, outlet);
  assert.ok(!bad.serviceable && bad.reason === "INVALID_PINCODE");
  assert.equal(normalizePincode("012345"), null);
});

test("phone normalization makes identity deterministic", () => {
  for (const v of ["9876543210", "+91 98765 43210", "098765-43210", "919876543210"]) assert.equal(normalizePhone(v), "+919876543210");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("5876543210"), null);
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
});

test("opening hours handle overnight ranges and timezone", () => {
  const hours = { mon: [["11:00", "23:00"]], tue: [["18:00", "02:00"]] } as const;
  const tz = "Asia/Kolkata";
  assert.equal(isOpenAt(hours, new Date("2026-10-05T06:00:00Z"), tz), true); // Mon 11:30 IST
  assert.equal(isOpenAt(hours, new Date("2026-10-05T04:00:00Z"), tz), false); // Mon 09:30 IST
  assert.equal(isOpenAt(hours, new Date("2026-10-06T19:30:00Z"), tz), true); // Wed 01:00 IST, from Tue overnight
  assert.equal(isOpenAt({}, new Date(), tz), true);
  assert.equal(nextOpening(hours, new Date("2026-10-05T04:00:00Z"), tz), "today at 11:00");
});

test("slugify", () => {
  assert.equal(slugify("Paneer Butter Masala!"), "paneer-butter-masala");
  assert.equal(slugify("Café & Bar"), "cafe-and-bar");
});
