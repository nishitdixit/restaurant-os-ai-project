"use client";
// New order (ADR-014): staff enter an order that reached the restaurant directly — WhatsApp, a phone call, a walk-in.
// Dishes, options, delivery fee and offers are priced by the server with the same rules as the website, so the
// total here is exactly what the website would charge. Works one-handed on a phone or tablet at the counter.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus, Search, Trash2, UserCheck } from "lucide-react";
import type { AdminOrderDetail, Menu, MenuProduct, Quote, StaffCustomerLookup, StaffOrderChannel, StaffOrderOffer, StaffPaymentMethod } from "@restaurant-os/types";
import {
  Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, cx, formatMoney, toast,
} from "@restaurant-os/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { AUDIENCE_LABELS, PAYMENT_LABELS, STAFF_CHANNELS } from "@/lib/order-labels";
import { useSession, useTenantKey } from "@/lib/session";
import { Segmented } from "./appearance/controls";

interface Line {
  key: string;
  product: MenuProduct;
  modifierIds: string[];
  quantity: number;
}

interface AddressForm { line1: string; line2: string; landmark: string; city: string; postalCode: string }
const EMPTY_ADDRESS: AddressForm = { line1: "", line2: "", landmark: "", city: "", postalCode: "" };

const lineKey = (productId: string, modifierIds: string[]) => `${productId}:${[...modifierIds].sort().join(",")}`;
const digits = (s: string) => s.replace(/\D/g, "");

function optionNames(product: MenuProduct, modifierIds: string[]) {
  return product.modifierGroups.flatMap((g) => g.modifiers.filter((m) => modifierIds.includes(m.id)).map((m) => `${g.name}: ${m.name}`));
}

function unitPrice(product: MenuProduct, modifierIds: string[]) {
  return product.priceMinor + product.modifierGroups.flatMap((g) => g.modifiers).filter((m) => modifierIds.includes(m.id)).reduce((s, m) => s + m.priceDeltaMinor, 0);
}

/** Option picker with the merchant's min/max rules (same rules the server enforces). */
function OptionsModal({ product, onClose, onAdd }: { product: MenuProduct; onClose: () => void; onAdd: (modifierIds: string[], quantity: number) => void }) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() => Object.fromEntries(product.modifierGroups.map((g) => {
    const first = g.modifiers.find((m) => m.available);
    return [g.id, g.minSelections === 1 && g.maxSelections === 1 && first ? [first.id] : []];
  })));
  const [quantity, setQuantity] = useState(1);
  const [tried, setTried] = useState(false);
  const ids = product.modifierGroups.flatMap((g) => selected[g.id] ?? []);
  const missing = product.modifierGroups.find((g) => (selected[g.id] ?? []).length < g.minSelections);
  const toggle = (groupId: string, id: string) => {
    const g = product.modifierGroups.find((x) => x.id === groupId)!;
    setSelected((cur) => {
      const now = cur[groupId] ?? [];
      if (g.maxSelections === 1) return { ...cur, [groupId]: now.includes(id) && g.minSelections === 0 ? [] : [id] };
      if (now.includes(id)) return { ...cur, [groupId]: now.filter((x) => x !== id) };
      return now.length >= g.maxSelections ? cur : { ...cur, [groupId]: [...now, id] };
    });
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={product.name} size="md"
      footer={<div className="flex w-full items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Fewer" onClick={() => setQuantity((q) => Math.max(1, q - 1))}><Minus className="size-4" /></Button>
          <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{quantity}</span>
          <Button variant="outline" size="sm" aria-label="More" onClick={() => setQuantity((q) => Math.min(50, q + 1))}><Plus className="size-4" /></Button>
        </span>
        <Button className="flex-1" onClick={() => { setTried(true); if (!missing) onAdd(ids, quantity); }}>Add · {formatMoney(unitPrice(product, ids) * quantity, product.currency)}</Button>
      </div>}>
      <div className="space-y-4">
        {product.modifierGroups.map((g) => {
          const multi = g.maxSelections > 1;
          const chosen = selected[g.id] ?? [];
          return (
            <fieldset key={g.id}>
              <legend className="flex w-full justify-between text-sm"><span className="font-semibold">{g.name}</span>
                <span className={cx("text-xs", tried && chosen.length < g.minSelections ? "font-medium text-danger" : "text-muted")}>{g.minSelections > 0 ? "Required" : "Optional"}{multi ? ` · up to ${g.maxSelections}` : ""}</span>
              </legend>
              <div className="mt-1.5 divide-y divide-border rounded-[var(--ros-radius-md)] border border-border">
                {g.modifiers.map((m) => {
                  const checked = chosen.includes(m.id);
                  const full = multi && !checked && chosen.length >= g.maxSelections;
                  return (
                    <label key={m.id} className={cx("flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm", (!m.available || full) && "cursor-not-allowed opacity-50")}>
                      <input type={multi ? "checkbox" : "radio"} name={`g-${g.id}`} checked={checked} disabled={!m.available || full} onChange={() => toggle(g.id, m.id)} className="size-4" />
                      <span className="flex-1">{m.name}{!m.available && " (unavailable)"}</span>
                      {m.priceDeltaMinor !== 0 && <span className="text-muted">{m.priceDeltaMinor > 0 ? "+" : "−"}{formatMoney(Math.abs(m.priceDeltaMinor), product.currency)}</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        {tried && missing && <p role="alert" className="text-sm font-medium text-danger">Choose {missing.name.toLowerCase()} to continue.</p>}
      </div>
    </Modal>
  );
}

function MenuPicker({ menu, onPick }: { menu: Menu; onPick: (p: MenuProduct) => void }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const term = q.trim().toLowerCase();
  const categories = menu.categories;
  const products = categories
    .filter((c) => !category || c.id === category)
    .flatMap((c) => c.products)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.nameHi.includes(q.trim()));
  return (
    <Card>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" className="pl-9" />
      </div>
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categories">
        {[{ id: "", name: "All" }, ...categories].map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={category === c.id} onClick={() => setCategory(c.id)}
            className={cx("h-8 shrink-0 rounded-full border px-3 text-xs font-medium", category === c.id ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-text")}>{c.name}</button>
        ))}
      </div>
      {products.length === 0 ? <p className="py-8 text-center text-sm text-muted">No dishes match “{q}”.</p> : (
        <ul className="mt-2 divide-y divide-border">
          {products.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={!p.available} onClick={() => onPick(p)}
                className="flex min-h-12 w-full items-center gap-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Add ${p.name}${p.modifierGroups.length ? " (choose options)" : ""}`}>
                <span className={cx("size-2.5 shrink-0 rounded-full", p.dietary === "VEG" || p.dietary === "VEGAN" ? "bg-success" : p.dietary ? "bg-danger" : "bg-border")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">{p.available ? (p.modifierGroups.length ? "Options" : p.categoryName) : p.unavailableReason ?? "Out of stock"}</span>
                </span>
                <span className="text-sm tabular-nums">{formatMoney(p.priceMinor, p.currency)}</span>
                {p.available && <Plus className="size-4 text-primary" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NewOrder() {
  const { request } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const ordersKey = useTenantKey("orders");
  const menu = useQuery({ queryKey: useTenantKey("new-order", "menu"), queryFn: () => request<Menu>("/v1/admin/orders/new/menu") });
  const offers = useQuery({ queryKey: useTenantKey("new-order", "offers"), queryFn: () => request<{ items: StaffOrderOffer[] }>("/v1/admin/orders/new/offers") });

  const [channel, setChannel] = useState<StaffOrderChannel>("PHONE");
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<StaffPaymentMethod>("CASH");
  const [notify, setNotify] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());

  // Known customer: fill name and offer saved addresses once a full number is typed.
  const phoneDigits = digits(customer.phone);
  const lookupPhone = phoneDigits.length >= 10 ? phoneDigits : "";
  const lookup = useQuery({
    queryKey: useTenantKey("new-order", "customer", lookupPhone),
    queryFn: () => request<StaffCustomerLookup>(`/v1/admin/orders/new/customer?phone=${lookupPhone}`),
    enabled: !!lookupPhone, staleTime: 60_000,
  });
  const filledFor = useRef("");
  useEffect(() => {
    const found = lookup.data;
    if (!found?.found || filledFor.current === lookupPhone) return;
    filledFor.current = lookupPhone;
    setCustomer((c) => ({ ...c, name: c.name || found.name, email: c.email || found.email }));
    if (found.addresses[0]) setAddress((a) => (a.line1 ? a : found.addresses[0]!));
  }, [lookup.data, lookupPhone]);

  const addressReady = fulfillment === "PICKUP" || /^[1-9][0-9]{5}$/.test(address.postalCode);
  const quoteBody = useMemo(() => ({
    lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, modifierIds: l.modifierIds })),
    fulfillmentType: fulfillment,
    address: fulfillment === "DELIVERY" && addressReady ? { ...address, line1: address.line1 || "pending", city: address.city || "pending", region: "" } : null,
    promotionCode,
    customerPhone: customer.phone,
  }), [lines, fulfillment, address, addressReady, promotionCode, customer.phone]);
  const [debounced, setDebounced] = useState(quoteBody);
  useEffect(() => { const t = setTimeout(() => setDebounced(quoteBody), 300); return () => clearTimeout(t); }, [quoteBody]);
  const quote = useQuery({
    queryKey: useTenantKey("new-order", "quote", debounced),
    queryFn: () => request<Quote>("/v1/admin/orders/quote", { body: debounced }),
    enabled: debounced.lines.length > 0, placeholderData: (prev) => prev,
  });
  const q = lines.length ? quote.data : undefined;
  const issues = (q?.issues ?? []).filter((i) => !(i.code === "ADDRESS_REQUIRED" && fulfillment === "DELIVERY" && !addressReady));

  const add = (product: MenuProduct, modifierIds: string[], quantity: number) => {
    const key = lineKey(product.id, modifierIds);
    setLines((cur) => cur.some((l) => l.key === key) ? cur.map((l) => l.key === key ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l) : [...cur, { key, product, modifierIds, quantity }]);
    toast.success(`${quantity} × ${product.name} added`);
  };
  const pick = (p: MenuProduct) => (p.modifierGroups.length ? setPicking(p) : add(p, [], 1));
  const setQty = (key: string, quantity: number) => setLines((cur) => quantity <= 0 ? cur.filter((l) => l.key !== key) : cur.map((l) => l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l));

  const create = useMutation({
    mutationFn: () => request<{ order: AdminOrderDetail; duplicate: boolean }>("/v1/admin/orders", {
      body: {
        ...quoteBody, address: fulfillment === "DELIVERY" ? { ...address, region: "" } : null, channel, customer, customerNote: note, payment, notifyCustomer: notify,
        expectedTotalMinor: q?.totalMinor ?? 0,
      },
      headers: { "idempotency-key": attempt },
    }),
    onSuccess: ({ order }) => {
      void qc.invalidateQueries({ queryKey: ordersKey });
      setAttempt(crypto.randomUUID());
      toast.success(`Order #${order.number} created · ${formatMoney(order.totalMinor, order.currency)}`);
      router.push(`/orders?order=${order.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        if (e.code === "PRICE_CHANGED") void quote.refetch();
      }
      toast.error(errorMessage(e));
    },
  });

  const submit = () => {
    const next: Record<string, string> = {};
    const anonymousOk = fulfillment === "PICKUP" && (channel === "WALK_IN" || channel === "OTHER");
    if (!anonymousOk && phoneDigits.length < 10) next.phone = "Enter the customer's mobile number.";
    if (fulfillment === "DELIVERY") {
      if (!customer.name.trim()) next.name = "Enter the customer's name for the rider.";
      if (!address.line1.trim()) next.line1 = "Enter the house / flat and street.";
      if (!address.city.trim()) next.city = "Enter the city.";
      if (!/^[1-9][0-9]{5}$/.test(address.postalCode)) next.postalCode = "Enter a valid 6-digit pincode.";
    }
    setErrors(next);
    if (Object.keys(next).length || !q || issues.length) return;
    create.mutate();
  };

  if (menu.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (menu.error || !menu.data) return <ErrorState description={errorMessage(menu.error)} onRetry={() => void menu.refetch()} />;
  const currency = menu.data.categories[0]?.products[0]?.currency ?? "INR";
  const offerList = offers.data?.items ?? [];
  const selectedOffer = offerList.find((o) => o.code === promotionCode);
  const canCreate = !!q && !quote.isFetching && issues.length === 0 && lines.length > 0;

  return (
    <>
      <PageHeader title="New order" description="For orders that came by WhatsApp, phone or at the counter. Prices, delivery fees and offers are the same as on your website."
        back={<Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />Orders</Link>} />

      <div className="grid gap-4 pb-24 lg:grid-cols-[minmax(0,1fr)_26rem] lg:pb-0">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Segmented label="Order came by" value={channel} onChange={setChannel} options={STAFF_CHANNELS} />
              <Segmented label="Delivery or pickup" value={fulfillment} onChange={setFulfillment} options={[{ value: "DELIVERY", label: "Delivery" }, { value: "PICKUP", label: "Pickup" }]} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Mobile number" required={!(fulfillment === "PICKUP" && (channel === "WALK_IN" || channel === "OTHER"))} error={errors.phone}
                hint={lookup.data?.found ? `Returning customer · ${lookup.data.orderCount} order${lookup.data.orderCount === 1 ? "" : "s"}` : channel === "WALK_IN" ? "Optional for walk-in pickups" : undefined}>
                {(p) => <Input {...p} type="tel" inputMode="tel" prefix="+91" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} autoFocus />}
              </Field>
              <Field label="Name" required={fulfillment === "DELIVERY"} error={errors.name}>
                {(p) => <Input {...p} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />}
              </Field>
            </div>
            {lookup.data?.found && <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-success"><UserCheck className="size-3.5" aria-hidden />Filled from {lookup.data.name}&apos;s last order</p>}
            {fulfillment === "DELIVERY" && (
              <div className="mt-4 space-y-3">
                {(lookup.data?.addresses.length ?? 0) > 1 && (
                  <Field label="Saved addresses">{(p) => (
                    <Select {...p} value="" onChange={(e) => { const a = lookup.data!.addresses[Number(e.target.value)]; if (a) setAddress(a); }}>
                      <option value="">Choose a saved address…</option>
                      {lookup.data!.addresses.map((a, i) => <option key={i} value={i}>{[a.line1, a.line2, a.postalCode].filter(Boolean).join(", ")}</option>)}
                    </Select>
                  )}</Field>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="House / flat, building, street" required error={errors.line1}>{(p) => <Input {...p} value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />}</Field></div>
                  <Field label="Area / locality">{(p) => <Input {...p} value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />}</Field>
                  <Field label="Landmark">{(p) => <Input {...p} value={address.landmark} onChange={(e) => setAddress({ ...address, landmark: e.target.value })} />}</Field>
                  <Field label="City" required error={errors.city}>{(p) => <Input {...p} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />}</Field>
                  <Field label="Pincode" required error={errors.postalCode ?? q?.issues.find((i) => i.code === "ADDRESS_NOT_SERVICEABLE")?.message ?? null}
                    hint={q?.delivery ? `${q.delivery.zoneName} · fee ${q.feeMinor ? formatMoney(q.feeMinor, currency) : "free"} · ${q.delivery.etaMin}–${q.delivery.etaMax} min` : undefined}>
                    {(p) => <Input {...p} inputMode="numeric" maxLength={6} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: digits(e.target.value) })} />}
                  </Field>
                </div>
              </div>
            )}
          </Card>
          <MenuPicker menu={menu.data} onPick={pick} />
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <h2 className="text-sm font-semibold">Order</h2>
            {lines.length === 0 ? <EmptyState title="No dishes yet" description="Tap dishes in the menu to add them." /> : (
              <ul className="mt-2 divide-y divide-border">
                {lines.map((l) => {
                  const ql = q?.lines.find((x) => x.productId === l.product.id && x.modifiers.map((m) => m.modifierId).sort().join() === [...l.modifierIds].sort().join());
                  return (
                    <li key={l.key} className="py-2.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{l.product.name}</p>
                          {l.modifierIds.length > 0 && <p className="text-xs text-muted">{optionNames(l.product, l.modifierIds).join(" · ")}</p>}
                          {ql?.problem && <p className="text-xs font-medium text-danger">{ql.problem}</p>}
                        </div>
                        <span className="text-sm tabular-nums">{formatMoney(ql?.lineTotalMinor ?? unitPrice(l.product, l.modifierIds) * l.quantity, currency)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1">
                        <Button variant="outline" size="sm" aria-label={`One less ${l.product.name}`} onClick={() => setQty(l.key, l.quantity - 1)}>{l.quantity === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}</Button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-label={`${l.quantity} of ${l.product.name}`}>{l.quantity}</span>
                        <Button variant="outline" size="sm" aria-label={`One more ${l.product.name}`} onClick={() => setQty(l.key, l.quantity + 1)}><Plus className="size-3.5" /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <Field label="Offer" hint={selectedOffer ? `${selectedOffer.summary}${selectedOffer.audience === "STAFF_ONLY" ? " · staff only" : ""}` : offerList.length ? undefined : "No live offers"}
                error={promotionCode && q?.promotionError ? q.promotionError : null}>
                {(p) => (
                  <Select {...p} value={promotionCode} onChange={(e) => setPromotionCode(e.target.value)}>
                    <option value="">No offer</option>
                    {(["STAFF_ONLY", "PUBLIC", "CODE_ONLY"] as const).map((aud) => {
                      const group = offerList.filter((o) => o.audience === aud);
                      return group.length ? <optgroup key={aud} label={AUDIENCE_LABELS[aud]}>{group.map((o) => <option key={o.id} value={o.code}>{o.code} — {o.title}</option>)}</optgroup> : null;
                    })}
                  </Select>
                )}
              </Field>
              <Field label="Note for the kitchen / rider">{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Less spicy, ring the bell twice" />}</Field>
              <Segmented label="Payment" value={payment} onChange={setPayment}
                options={(["CASH", "UPI", "CARD", "PAY_LATER"] as const).map((m) => ({ value: m, label: PAYMENT_LABELS[m] }))}
                hint={payment === "PAY_LATER" ? `Collect on ${fulfillment === "DELIVERY" ? "delivery" : "pickup"}, then “Mark as paid” on the order.` : "Received now."} />
              <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Send order updates to the customer" description="Confirmation and status messages on WhatsApp/SMS." />
            </div>

            <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm" aria-live="polite" aria-busy={quote.isFetching}>
              {!q ? <p className="text-muted">{lines.length ? "Calculating…" : "Add dishes to see the total."}</p> : (
                <>
                  <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="tabular-nums">{formatMoney(q.subtotalMinor, currency)}</dd></div>
                  {q.discountMinor > 0 && <div className="flex justify-between text-success"><dt>Offer {q.promotion && <Badge tone={selectedOffer?.audience === "STAFF_ONLY" ? "info" : "neutral"}>{q.promotion.code}</Badge>}</dt><dd className="tabular-nums">−{formatMoney(q.discountMinor, currency)}</dd></div>}
                  {fulfillment === "DELIVERY" && <div className="flex justify-between"><dt className="text-muted">Delivery fee</dt><dd className="tabular-nums">{q.delivery ? (q.feeMinor ? formatMoney(q.feeMinor, currency) : "Free") : "Enter pincode"}</dd></div>}
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(q.totalMinor, currency)}</dd></div>
                </>
              )}
            </dl>
            {issues.map((i) => <Alert key={i.code + i.message} tone="warning" className="mt-3">{i.message}</Alert>)}
            <Button size="lg" block className="mt-4 max-lg:hidden" loading={create.isPending} disabled={!canCreate} onClick={submit}>
              {q ? `Create order · ${formatMoney(q.totalMinor, currency)}` : "Create order"}
            </Button>
          </Card>
        </div>
      </div>

      {/* Phones: the create button stays in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <Button size="lg" block loading={create.isPending} disabled={!canCreate} onClick={submit}>
          {q ? `Create order · ${formatMoney(q.totalMinor, currency)}` : lines.length ? "Calculating…" : "Add dishes to create the order"}
        </Button>
      </div>

      {picking && <OptionsModal product={picking} onClose={() => setPicking(null)} onAdd={(ids, quantity) => { add(picking, ids, quantity); setPicking(null); }} />}
    </>
  );
}
