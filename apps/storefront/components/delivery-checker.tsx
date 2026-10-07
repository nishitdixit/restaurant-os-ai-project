"use client";
// "Do you deliver to me?" — checks a pincode against the restaurant's pincode areas before anything goes in the cart.
// Radius areas need the customer's location, which checkout asks for; the server re-checks everything at checkout.
import { useState } from "react";
import { CheckCircle2, MapPinOff } from "lucide-react";
import type { StoreConfig } from "@restaurant-os/types";
import { Button, Input, formatMoney } from "@restaurant-os/ui";

export function DeliveryChecker({ areas, currency, pickup }: { areas: StoreConfig["deliveryAreas"]; currency: string; pickup: boolean }) {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<null | { area: StoreConfig["deliveryAreas"][number] | null }>(null);
  const radius = areas.some((a) => a.radiusKm);
  const check = () => {
    if (!/^[1-9][0-9]{5}$/.test(pin)) return;
    setResult({ area: areas.find((a) => a.postalCodes.includes(pin)) ?? null });
  };
  return (
    <div>
      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <Input aria-label="Your pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} placeholder="Enter your pincode" value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setResult(null); }} />
        <Button type="submit" className="h-11 shrink-0" disabled={pin.length !== 6}>Check</Button>
      </form>
      <div aria-live="polite" className="mt-3 min-h-6 text-sm">
        {result?.area && (
          <p className="ros-fade-up inline-flex items-start gap-2 rounded-[var(--ros-radius-md)] bg-success-soft px-3 py-2 text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>We deliver to {pin} in {result.area.etaMin}–{result.area.etaMax} min · {result.area.feeMinor ? `fee ${formatMoney(result.area.feeMinor, currency)}` : "free delivery"}
              {result.area.freeDeliveryMinimumMinor ? ` (free above ${formatMoney(result.area.freeDeliveryMinimumMinor, currency)})` : ""}
              {result.area.minimumOrderMinor ? ` · minimum order ${formatMoney(result.area.minimumOrderMinor, currency)}` : ""}.</span>
          </p>
        )}
        {result && !result.area && (
          <p className="ros-fade-up inline-flex items-start gap-2 rounded-[var(--ros-radius-md)] bg-subtle px-3 py-2 text-text">
            <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{radius ? "That pincode isn't on our list — we may still reach you: share your location at checkout to check." : "Sorry, we don't deliver to that pincode yet."}{pickup ? " You can always order for pickup." : ""}</span>
          </p>
        )}
      </div>
    </div>
  );
}
