import test from "node:test";
import assert from "node:assert/strict";
import { applyLayoutPreset, defaultExperience, normalizeExperience, whatsappOrderMessage, type MessageLine } from "./index.ts";

const tikka: MessageLine = {
  name: "Paneer Tikka", quantity: 2, unitPriceMinor: 30000,
  options: [
    { group: "Portion", name: "Full", priceDeltaMinor: 8000 },
    { group: "Add-ons", name: "Extra mint chutney", priceDeltaMinor: 2000 },
    { group: "Add-ons", name: "Onion rings", priceDeltaMinor: 0 },
  ],
};
const naan: MessageLine = { name: "Butter Naan", quantity: 1, unitPriceMinor: 6000, options: [] };

test("a cart message lists every line with quantity, grouped options, prices and the items total", () => {
  const text = whatsappOrderMessage({ storeName: "Desi Mandap", currency: "INR", lines: [tikka, naan] });
  assert.equal(text, [
    "Hi Desi Mandap, I'd like to order:",
    "",
    "1. 2 × Paneer Tikka — ₹600",
    "   • Portion: Full (+₹80)",
    "   • Add-ons: Extra mint chutney (+₹20), Onion rings",
    "2. 1 × Butter Naan — ₹60",
    "",
    "Items total: ₹660",
    "Delivery fee & offers to be confirmed by you.",
  ].join("\n"));
});

test("a single-dish message carries the dish link", () => {
  const text = whatsappOrderMessage({ storeName: "Desi Mandap", currency: "INR", lines: [{ ...tikka, quantity: 1 }], link: "https://desi.example/menu/paneer-tikka" });
  assert.match(text, /1\. 1 × Paneer Tikka — ₹300\n {3}• Portion: Full/);
  assert.match(text, /\n\nhttps:\/\/desi\.example\/menu\/paneer-tikka\n\nItems total: ₹300/);
});

test("checkout messages include the quoted totals, fulfilment and customer details", () => {
  const text = whatsappOrderMessage({
    storeName: "Desi Mandap", currency: "INR", lines: [tikka, naan],
    details: {
      fulfillment: "DELIVERY", name: "Asha", phone: "+91 98765 43210", address: "12 MG Road, Indore 452001", note: "Less spicy",
      totals: { subtotalMinor: 66000, discountMinor: 5000, feeMinor: 3000, totalMinor: 64000, promotionCode: "WELCOME50" },
    },
  });
  assert.ok(text.endsWith([
    "Items total: ₹660", "Offer (WELCOME50): −₹50", "Delivery fee: ₹30", "Total: ₹640",
    "", "Delivery to: 12 MG Road, Indore 452001", "Name: Asha", "Phone: +91 98765 43210", "Note: Less spicy",
  ].join("\n")), text);
  const pickup = whatsappOrderMessage({ storeName: "X", currency: "INR", lines: [naan], details: { fulfillment: "PICKUP" } });
  assert.match(pickup, /Offers to be confirmed by you\.\n\nPickup$/);
});

test("carts saved before option groups were stored fall back to the plain option names", () => {
  const text = whatsappOrderMessage({ storeName: "X", currency: "INR", lines: [{ ...naan, optionLabels: ["Garlic", "Extra butter"] }] });
  assert.match(text, /1\. 1 × Butter Naan — ₹60\n {3}• Garlic, Extra butter\n/);
});

test("an empty cart sends the plain greeting; whitespace in names cannot break the layout", () => {
  assert.equal(whatsappOrderMessage({ storeName: "X", currency: "INR", lines: [] }), "Hi X, I'd like to place an order.");
  const text = whatsappOrderMessage({ storeName: "X", currency: "INR", lines: [{ ...naan, name: "Butter\n\nNaan  " }] });
  assert.match(text, /1 × Butter Naan — /);
});

test("very large carts are shortened to fit a wa.me link, keeping the whole-cart total", () => {
  const lines = Array.from({ length: 80 }, (_, i) => ({ ...tikka, name: `Dish number ${i + 1}` }));
  const text = whatsappOrderMessage({ storeName: "X", currency: "INR", lines });
  assert.ok(encodeURIComponent(text).length <= 3000);
  assert.match(text, /…and \d+ more items\n/);
  assert.match(text, /Items total: ₹48,000/);
});

test("the WhatsApp ordering setting defaults on, survives normalisation and is kept when a style is applied", () => {
  assert.equal(defaultExperience().site.whatsappOrdering, true);
  const off = normalizeExperience({ ...defaultExperience(), site: { ...defaultExperience().site, whatsappOrdering: false } });
  assert.equal(off.site.whatsappOrdering, false);
  assert.equal(normalizeExperience({ version: 1, site: { whatsappOrdering: "yes" } }).site.whatsappOrdering, true);
  assert.equal(applyLayoutPreset(off, "street-pop").site.whatsappOrdering, false);
});
