// "Order on WhatsApp" (ADR-014): the prefilled message a customer sends from a dish, the cart or checkout. It has to
// tell the restaurant exactly what was picked (quantity, portion, add-ons, prices) so they can take the order without
// a back-and-forth. Prices are the storefront's display prices; the restaurant confirms the bill.

export interface MessageOption {
  /** Option group, e.g. "Portion" or "Add-ons". */
  group: string;
  name: string;
  priceDeltaMinor: number;
}

export interface MessageLine {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  /** Options with their group. Empty for carts saved before groups were stored; then `optionLabels` is used. */
  options: MessageOption[];
  optionLabels?: string[];
}

export interface MessageTotals {
  subtotalMinor: number;
  discountMinor: number;
  feeMinor: number;
  totalMinor: number;
  promotionCode?: string | null;
}

export interface MessageDetails {
  fulfillment?: "DELIVERY" | "PICKUP" | null;
  name?: string;
  phone?: string;
  /** One-line delivery address. */
  address?: string;
  note?: string;
  /** Server-quoted totals (checkout); without them the message says fees and offers are to be confirmed. */
  totals?: MessageTotals | null;
}

export interface OrderMessageInput {
  storeName: string;
  currency: string;
  lines: MessageLine[];
  /** A link to the dish (single-dish messages). */
  link?: string | null;
  details?: MessageDetails | null;
}

/** Longest URL-encoded message text; longer wa.me links fail to open on some phones. */
export const WHATSAPP_TEXT_BUDGET = 3000;

function money(minor: number, currency: string): string {
  const value = minor / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function optionLines(line: MessageLine, currency: string): string[] {
  if (!line.options.length) {
    const labels = (line.optionLabels ?? []).map(clean).filter(Boolean);
    return labels.length ? [`   • ${labels.join(", ")}`] : [];
  }
  const groups = new Map<string, string[]>();
  for (const o of line.options) {
    const delta = o.priceDeltaMinor ? ` (${o.priceDeltaMinor > 0 ? "+" : "−"}${money(Math.abs(o.priceDeltaMinor), currency)})` : "";
    const key = clean(o.group) || "Options";
    groups.set(key, [...(groups.get(key) ?? []), `${clean(o.name)}${delta}`]);
  }
  return [...groups].map(([group, names]) => `   • ${group}: ${names.join(", ")}`);
}

function lineBlock(line: MessageLine, index: number, currency: string): string {
  const head = `${index + 1}. ${line.quantity} × ${clean(line.name)} — ${money(line.unitPriceMinor * line.quantity, currency)}`;
  return [head, ...optionLines(line, currency)].join("\n");
}

function footer(input: OrderMessageInput): string[] {
  const { currency, details } = input;
  const out: string[] = [];
  const t = details?.totals;
  const itemsTotal = input.lines.reduce((n, l) => n + l.unitPriceMinor * l.quantity, 0);
  if (t) {
    out.push(`Items total: ${money(t.subtotalMinor, currency)}`);
    if (t.discountMinor > 0) out.push(`Offer${t.promotionCode ? ` (${clean(t.promotionCode)})` : ""}: −${money(t.discountMinor, currency)}`);
    if (details?.fulfillment === "DELIVERY") out.push(`Delivery fee: ${t.feeMinor > 0 ? money(t.feeMinor, currency) : "Free"}`);
    out.push(`Total: ${money(t.totalMinor, currency)}`);
  } else {
    out.push(`Items total: ${money(itemsTotal, currency)}`);
    out.push(details?.fulfillment === "PICKUP" ? "Offers to be confirmed by you." : "Delivery fee & offers to be confirmed by you.");
  }
  const who: string[] = [];
  if (details?.fulfillment) who.push(details.fulfillment === "PICKUP" ? "Pickup" : `Delivery${details.address ? ` to: ${clean(details.address)}` : ""}`);
  if (details?.name) who.push(`Name: ${clean(details.name)}`);
  if (details?.phone) who.push(`Phone: ${clean(details.phone)}`);
  if (details?.note) who.push(`Note: ${clean(details.note)}`);
  return who.length ? [...out, "", ...who] : out;
}

/**
 * The prefilled WhatsApp text. Lines are listed in cart order; when the text would be too long for a wa.me link,
 * the last lines are replaced by "…and N more items" (the totals still cover the whole cart).
 */
export function whatsappOrderMessage(input: OrderMessageInput, budget = WHATSAPP_TEXT_BUDGET): string {
  const lines = input.lines.filter((l) => l.quantity > 0);
  const greeting = `Hi ${clean(input.storeName)}, I'd like to order:`;
  if (!lines.length) return `Hi ${clean(input.storeName)}, I'd like to place an order.`;
  const tail = [...(input.link ? ["", input.link] : []), "", ...footer({ ...input, lines })];
  const build = (shown: number) => {
    const blocks = lines.slice(0, shown).map((l, i) => lineBlock(l, i, input.currency));
    const rest = lines.length - shown;
    if (rest > 0) blocks.push(`…and ${rest} more item${rest === 1 ? "" : "s"}`);
    return [greeting, "", ...blocks, ...tail].join("\n");
  };
  for (let shown = lines.length; shown > 1; shown--) {
    const text = build(shown);
    if (encodeURIComponent(text).length <= budget) return text;
  }
  return build(1);
}
