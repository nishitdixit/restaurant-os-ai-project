"use client";
// Checkout (PRD 5.5, Journey A). Every number comes from the live server quote; problems are shown
// next to the field they concern with a recovery action (docs/UX_PRINCIPLES.md #6).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Crosshair, ShoppingBag, Store, Tag, X } from "lucide-react";
import type { PlaceOrderResult, Quote, StoreConfig } from "@restaurant-os/types";
import { Alert, Button, Card, Checkbox, CartLine, EmptyState, Field, Input, Skeleton, Textarea, buttonClass, cx, formatMoney, toast } from "@restaurant-os/ui";
import { ApiRequestError, clientRequest } from "@/lib/api";
import { useCart, type CartItem } from "@/lib/cart";

interface Contact { name: string; phone: string; email: string; marketingConsent: boolean }
interface Address { line1: string; line2: string; landmark: string; city: string; region: string; postalCode: string; location: { latitude: number; longitude: number } | null }

const CHECKOUT_STORAGE = "ros-checkout-details";

function cartFingerprint(items: CartItem[]) {
  return items.map((i) => `${i.key}x${i.quantity}`).join("|");
}

/** One idempotency key per cart+details attempt, kept across refreshes so a retry can never double-order. */
function attemptKey(fingerprint: string): string {
  try {
    const raw = sessionStorage.getItem("ros-attempt");
    const saved = raw ? (JSON.parse(raw) as { fingerprint: string; key: string }) : null;
    if (saved?.fingerprint === fingerprint) return saved.key;
    const key = `web-${crypto.randomUUID()}`;
    sessionStorage.setItem("ros-attempt", JSON.stringify({ fingerprint, key }));
    return key;
  } catch {
    return `web-${crypto.randomUUID()}`;
  }
}

export function CheckoutClient({ config }: { config: StoreConfig }) {
  const router = useRouter();
  const { items, ready, setQuantity, remove, clear } = useCart();
  const outlet = config.outlet;
  const canDeliver = !!outlet?.deliveryEnabled;
  const canPickup = !!outlet?.pickupEnabled;

  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">(canDeliver ? "DELIVERY" : "PICKUP");
  const [contact, setContact] = useState<Contact>({ name: "", phone: "", email: "", marketingConsent: false });
  const [address, setAddress] = useState<Address>({ line1: "", line2: "", landmark: "", city: outlet?.address.city ?? "", region: outlet?.address.region ?? "", postalCode: "", location: null });
  const [note, setNote] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const restored = useRef(false);

  // Remember contact and address for next time (on this device only).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(CHECKOUT_STORAGE) ?? "null") as { contact?: Contact; address?: Address; fulfillment?: "DELIVERY" | "PICKUP" } | null;
      if (saved?.contact) setContact((c) => ({ ...c, ...saved.contact }));
      if (saved?.address) setAddress((a) => ({ ...a, ...saved.address, location: null }));
      if (saved?.fulfillment && ((saved.fulfillment === "DELIVERY" && canDeliver) || (saved.fulfillment === "PICKUP" && canPickup))) setFulfillment(saved.fulfillment);
    } catch { /* ignore */ }
  }, [canDeliver, canPickup]);

  const pincodeValid = /^[1-9][0-9]{5}$/.test(address.postalCode);
  const quoteBody = useMemo(() => ({
    lines: items.map((i) => ({ productId: i.productId, quantity: i.quantity, modifierIds: i.modifierIds })),
    fulfillmentType: fulfillment,
    address: fulfillment === "DELIVERY" && pincodeValid ? { line1: address.line1 || "pending", line2: address.line2, landmark: address.landmark, city: address.city || "pending", region: address.region, postalCode: address.postalCode, location: address.location } : null,
    promotionCode: appliedCoupon,
    customerPhone: contact.phone,
  }), [items, fulfillment, pincodeValid, address, appliedCoupon, contact.phone]);

  const refreshQuote = useCallback(async (signal?: AbortSignal) => {
    if (!items.length) return;
    setQuoting(true);
    try {
      const q = await clientRequest<Quote>(`/v1/storefront/${config.slug}/checkout/quote`, { body: quoteBody, signal });
      setQuote(q);
      setQuoteError(null);
      if (appliedCoupon && q.promotionError) {
        toast.error(q.promotionError);
        setAppliedCoupon("");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setQuoteError(e instanceof ApiRequestError ? e.message : "We couldn't calculate your total.");
    } finally {
      setQuoting(false);
    }
  }, [items.length, config.slug, quoteBody, appliedCoupon]);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => void refreshQuote(controller.signal), 300);
    return () => { clearTimeout(t); controller.abort(); };
  }, [refreshQuote]);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    try {
      const q = await clientRequest<Quote>(`/v1/storefront/${config.slug}/checkout/quote`, { body: { ...quoteBody, promotionCode: code } });
      if (q.promotionError) { setFieldErrors((f) => ({ ...f, coupon: q.promotionError! })); return; }
      setFieldErrors(({ coupon: _c, ...rest }) => rest);
      setAppliedCoupon(code);
      setCouponInput("");
      setQuote(q);
      toast.success(`${code} applied — you save ${formatMoney(q.discountMinor, q.currency)}`);
    } catch (e) {
      setFieldErrors((f) => ({ ...f, coupon: e instanceof ApiRequestError ? e.message : "Couldn't check that code." }));
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Location isn't available on this device."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setAddress((a) => ({ ...a, location: { latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) } })); setLocating(false); toast.success("Location added — we'll use it to check delivery."); },
      () => { setLocating(false); toast.error("We couldn't get your location. Enter your pincode instead."); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const computeErrors = useCallback((): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!contact.name.trim()) errors.name = "Enter your name.";
    if (contact.phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a 10-digit mobile number.";
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) errors.email = "Enter a valid email or leave it blank.";
    if (fulfillment === "DELIVERY") {
      if (!address.line1.trim()) errors.line1 = "Enter your house / flat and street.";
      if (!address.city.trim()) errors.city = "Enter your city.";
      if (!pincodeValid) errors.postalCode = "Enter a valid 6-digit pincode.";
    }
    return errors;
  }, [contact, address, fulfillment, pincodeValid]);

  // Once a field is corrected its error disappears immediately (errors are only *added* on submit).
  useEffect(() => {
    setFieldErrors((current) => {
      const formKeys = ["name", "phone", "email", "line1", "city", "postalCode"];
      const stillInvalid = computeErrors();
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => !formKeys.includes(key) || key in stillInvalid));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [computeErrors]);

  const validate = (): boolean => {
    const errors = computeErrors();
    setFieldErrors((current) => ({ ...(current.coupon ? { coupon: current.coupon } : {}), ...errors }));
    if (Object.keys(errors).length) {
      document.querySelector<HTMLElement>(`[data-field="${Object.keys(errors)[0]}"] input, [data-field="${Object.keys(errors)[0]}"] textarea`)?.focus();
      return false;
    }
    return true;
  };

  const placeOrder = async () => {
    setSubmitError(null);
    if (!validate() || !quote) return;
    setSubmitting(true);
    const body = {
      ...quoteBody,
      address: fulfillment === "DELIVERY" ? { line1: address.line1.trim(), line2: address.line2.trim(), landmark: address.landmark.trim(), city: address.city.trim(), region: address.region.trim(), postalCode: address.postalCode, location: address.location } : null,
      customer: { ...contact, name: contact.name.trim(), email: contact.email.trim() },
      customerNote: note.trim(),
      paymentMethod: "ONLINE",
      expectedTotalMinor: quote.totalMinor,
    };
    try {
      localStorage.setItem(CHECKOUT_STORAGE, JSON.stringify({ contact, address: { ...address, location: null }, fulfillment }));
    } catch { /* ignore */ }
    try {
      const result = await clientRequest<PlaceOrderResult>(`/v1/storefront/${config.slug}/orders`, { body, headers: { "idempotency-key": attemptKey(`${cartFingerprint(items)}#${fulfillment}#${address.postalCode}#${appliedCoupon}#${contact.phone}`) } });
      clear();
      try { sessionStorage.removeItem("ros-attempt"); } catch { /* ignore */ }
      const action = result.payment.action;
      router.push(action.type === "MOCK_CHECKOUT" && action.url ? action.url : action.type === "REDIRECT" && action.url ? action.url : `/order/${result.order.token}`);
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ApiRequestError) {
        const details = e.details as { quote?: Quote; fields?: Record<string, string> };
        if (details.quote) setQuote(details.quote);
        if (e.code === "PRICE_CHANGED") { setSubmitError("Prices changed since you opened checkout. Please check the new total and place the order again."); return; }
        if (e.code === "INVALID_PHONE") { setFieldErrors((f) => ({ ...f, phone: e.message })); return; }
        if (e.code === "PROMOTION_INVALID") { setAppliedCoupon(""); setSubmitError(`${e.message} We've removed the code — please review your total.`); return; }
        if (details.fields) setFieldErrors(Object.fromEntries(Object.entries(details.fields).map(([k, v]) => [k.split(".").pop()!, v])));
        setSubmitError(e.message);
      } else {
        setSubmitError("We couldn't place your order. Please try again.");
      }
    }
  };

  if (!ready) return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;
  if (!items.length) {
    return (
      <EmptyState className="mx-auto mt-6 max-w-lg" icon={<ShoppingBag className="size-6" />} title="Your cart is empty" description="Add a few dishes and come back to check out."
        action={<Link href="/menu" className={buttonClass("primary")}>Browse the menu</Link>} />
    );
  }

  const issues = quote?.issues ?? [];
  const addressIssue = issues.find((i) => i.code === "ADDRESS_NOT_SERVICEABLE");
  const blocking = issues.filter((i) => i.code !== "ADDRESS_REQUIRED");
  const lineProblem = (productId: string) => quote?.lines.find((l) => l.productId === productId && l.problem)?.problem ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl ros-heading">Checkout</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-base ros-heading">How would you like your order?</h2>
            <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Delivery or pickup">
              {([["DELIVERY", "Delivery", <Bike key="b" className="size-5" />, canDeliver], ["PICKUP", "Pickup", <Store key="s" className="size-5" />, canPickup]] as const).map(([value, label, icon, enabled]) => (
                <button key={value} type="button" role="radio" aria-checked={fulfillment === value} disabled={!enabled} onClick={() => setFulfillment(value)}
                  className={cx("flex h-14 items-center justify-center gap-2 rounded-[var(--ros-radius-md)] border-2 text-sm font-semibold transition-colors disabled:opacity-40",
                    fulfillment === value ? "border-primary bg-primary-soft text-link" : "border-border bg-surface text-text hover:border-border-strong")}>
                  {icon}{label}{!enabled && <span className="sr-only"> (unavailable)</span>}
                </button>
              ))}
            </div>
            {fulfillment === "PICKUP" && outlet && (
              <p className="mt-3 text-sm text-muted">Collect from <span className="font-medium text-text">{[outlet.address.line1, outlet.address.city].filter(Boolean).join(", ")}</span>. Ready in about {outlet.prepMinutes} minutes.</p>
            )}
          </Card>

          <Card>
            <h2 className="text-base ros-heading">Your details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div data-field="name"><Field label="Name" required error={fieldErrors.name}>{(p) => <Input {...p} autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />}</Field></div>
              <div data-field="phone"><Field label="Mobile number" required hint="For order updates on WhatsApp/SMS" error={fieldErrors.phone}>{(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" prefix="+91" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />}</Field></div>
              <div data-field="email" className="sm:col-span-2"><Field label="Email (optional)" hint="We'll email your receipt" error={fieldErrors.email}>{(p) => <Input {...p} type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />}</Field></div>
            </div>
          </Card>

          {fulfillment === "DELIVERY" && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base ros-heading">Delivery address</h2>
                <Button variant="ghost" size="sm" loading={locating} onClick={useMyLocation} icon={<Crosshair className="size-4" aria-hidden />}>
                  {address.location ? "Location added" : "Use my location"}
                </Button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div data-field="line1" className="sm:col-span-2"><Field label="House / flat, building, street" required error={fieldErrors.line1}>{(p) => <Input {...p} autoComplete="address-line1" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />}</Field></div>
                <div data-field="line2"><Field label="Area / locality">{(p) => <Input {...p} autoComplete="address-line2" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />}</Field></div>
                <div data-field="landmark"><Field label="Landmark (optional)">{(p) => <Input {...p} value={address.landmark} onChange={(e) => setAddress({ ...address, landmark: e.target.value })} />}</Field></div>
                <div data-field="city"><Field label="City" required error={fieldErrors.city}>{(p) => <Input {...p} autoComplete="address-level2" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />}</Field></div>
                <div data-field="postalCode">
                  <Field label="Pincode" required error={fieldErrors.postalCode ?? addressIssue?.message ?? null}
                    hint={quote?.delivery ? `Delivers in ${quote.delivery.etaMin}–${quote.delivery.etaMax} min · fee ${formatMoney(quote.delivery.feeMinor, quote.currency)}` : undefined}>
                    {(p) => <Input {...p} inputMode="numeric" autoComplete="postal-code" maxLength={6} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value.replace(/\D/g, "") })} />}
                  </Field>
                </div>
              </div>
              {addressIssue && canPickup && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setFulfillment("PICKUP")}>Switch to pickup instead</Button>
              )}
              {addressIssue && <p className="mt-2 text-xs text-muted"><Link href="/delivery-areas" className="underline">See where we deliver</Link></p>}
            </Card>
          )}

          <Card>
            <Field label="Note for the kitchen (optional)" hint="Allergies, spice preference or delivery instructions">
              {(p) => <Textarea {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            <Checkbox className="mt-4" label="Send me offers from this restaurant" description="Occasional WhatsApp/SMS messages. Unsubscribe any time."
              checked={contact.marketingConsent} onChange={(e) => setContact({ ...contact, marketingConsent: e.target.checked })} />
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <h2 className="text-base ros-heading">Order summary</h2>
            <ul className="mt-2 divide-y divide-border">
              {items.map((item) => {
                const line = quote?.lines.find((l) => l.productId === item.productId && l.modifiers.map((m) => m.modifierId).sort().join() === [...item.modifierIds].sort().join());
                return (
                  <li key={item.key}>
                    <CartLine name={item.name} options={item.optionLabels} quantity={item.quantity} unitPriceMinor={line?.unitPriceMinor ?? item.unitPriceMinor}
                      lineTotalMinor={line?.lineTotalMinor ?? item.unitPriceMinor * item.quantity} currency={config.currency} problem={line?.problem ?? lineProblem(item.productId)}
                      onQuantityChange={(q) => setQuantity(item.key, q)} />
                    {(line?.problem) && <button type="button" onClick={() => remove(item.key)} className="-mt-2 mb-2 text-xs font-medium text-danger underline">Remove item</button>}
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 border-t border-border pt-3">
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-[var(--ros-radius-md)] bg-success-soft px-3 py-2 text-sm text-success">
                  <span className="inline-flex items-center gap-2 font-medium"><Tag className="size-4" aria-hidden />{appliedCoupon} applied</span>
                  <button type="button" onClick={() => setAppliedCoupon("")} aria-label={`Remove ${appliedCoupon}`} className="rounded p-1 hover:bg-surface/60"><X className="size-4" /></button>
                </div>
              ) : (
                <form className="flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); void applyCoupon(); }}>
                  <div className="flex gap-2">
                    <Input aria-label="Coupon code" aria-invalid={fieldErrors.coupon ? true : undefined} aria-describedby={fieldErrors.coupon ? "coupon-error" : undefined}
                      placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} className="uppercase" />
                    <Button type="submit" variant="outline" className="h-11">Apply</Button>
                  </div>
                  {fieldErrors.coupon && <p id="coupon-error" role="alert" className="text-xs font-medium text-danger">{fieldErrors.coupon}</p>}
                </form>
              )}
            </div>

            <dl className="mt-4 space-y-2 text-sm" aria-live="polite" aria-busy={quoting}>
              {!quote ? <Skeleton className="h-20" /> : (
                <>
                  <div className="flex justify-between"><dt className="text-muted">Item total</dt><dd className="tabular-nums">{formatMoney(quote.subtotalMinor, quote.currency)}</dd></div>
                  {quote.discountMinor > 0 && <div className="flex justify-between text-success"><dt>Discount{quote.promotion ? ` (${quote.promotion.code})` : ""}</dt><dd className="tabular-nums">−{formatMoney(quote.discountMinor, quote.currency)}</dd></div>}
                  {fulfillment === "DELIVERY" && (
                    <div className="flex justify-between"><dt className="text-muted">Delivery fee</dt>
                      <dd className="tabular-nums">{quote.delivery ? (quote.feeMinor ? formatMoney(quote.feeMinor, quote.currency) : "Free") : <span className="text-muted">Enter pincode</span>}</dd></div>
                  )}
                  {quote.delivery && quote.delivery.minimumOrderMinor > 0 && <p className="text-xs text-muted">Minimum order for your area: {formatMoney(quote.delivery.minimumOrderMinor, quote.currency)}</p>}
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>To pay</dt><dd className="tabular-nums">{formatMoney(quote.totalMinor, quote.currency)}</dd></div>
                </>
              )}
            </dl>

            {quoteError && <Alert tone="danger" className="mt-4" title="Couldn't update your total" action={<Button size="sm" variant="outline" onClick={() => void refreshQuote()}>Retry</Button>}>{quoteError}</Alert>}
            {blocking.filter((i) => i.code !== "ADDRESS_NOT_SERVICEABLE").map((issue) => (
              <Alert key={issue.code} tone="warning" className="mt-4">{issue.message}</Alert>
            ))}
            {submitError && <Alert tone="danger" className="mt-4">{submitError}</Alert>}

            <Button size="lg" block className="mt-4" loading={submitting} disabled={!quote || quoting || blocking.length > 0} onClick={() => void placeOrder()}>
              {quote ? `Place order · ${formatMoney(quote.totalMinor, quote.currency)}` : "Place order"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted">You&apos;ll pay securely on the next step.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
