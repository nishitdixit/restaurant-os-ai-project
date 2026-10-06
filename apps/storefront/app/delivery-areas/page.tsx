// Service area page (docs/WEBSTORE.md): real, merchant-configured areas only — no generated location pages.
import type { Metadata } from "next";
import Link from "next/link";
import { Bike, Store } from "lucide-react";
import { Card, EmptyState, buttonClass, formatMoney } from "@restaurant-os/ui";
import { getConfig } from "@/lib/store";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  const pins = config.deliveryAreas.flatMap((a) => a.postalCodes).slice(0, 8).join(", ");
  return {
    title: "Delivery areas",
    description: `${config.name} delivers to ${pins || "nearby areas"}. See delivery fees, minimum order and delivery times.`,
    alternates: { canonical: "/delivery-areas" },
  };
}

export default async function DeliveryAreasPage() {
  const config = await getConfig();
  const o = config.outlet;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Where we deliver</h1>
      <p className="mt-1 text-muted">Enter your pincode at checkout and we&apos;ll confirm the fee before you pay.</p>
      {!o?.deliveryEnabled || config.deliveryAreas.length === 0 ? (
        <EmptyState className="mt-6" icon={<Store className="size-6" />} title={o?.pickupEnabled ? "Pickup only for now" : "Delivery isn't available right now"}
          description={o?.pickupEnabled ? `Order online and collect from ${[o.address.line1, o.address.city].filter(Boolean).join(", ")}.` : undefined}
          action={<Link href="/menu" className={buttonClass("primary")}>Order now</Link>} />
      ) : (
        <div className="mt-6 space-y-3">
          {config.deliveryAreas.map((area) => (
            <Card key={area.name} as="article">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2"><Bike className="size-5 text-primary" aria-hidden /><h2 className="font-semibold">{area.name}</h2></div>
                <p className="text-sm text-muted">{area.etaMin}–{area.etaMax} min</p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">Delivery fee</dt><dd className="font-medium">{area.feeMinor ? formatMoney(area.feeMinor, config.currency) : "Free"}</dd></div>
                <div><dt className="text-muted">Minimum order</dt><dd className="font-medium">{area.minimumOrderMinor ? formatMoney(area.minimumOrderMinor, config.currency) : "None"}</dd></div>
                {area.radiusKm && <div><dt className="text-muted">Radius</dt><dd className="font-medium">Within {area.radiusKm} km (share your location at checkout)</dd></div>}
              </dl>
              {area.postalCodes.length > 0 && <p className="mt-3 text-sm"><span className="text-muted">Pincodes: </span>{area.postalCodes.join(", ")}</p>}
            </Card>
          ))}
          {o.pickupEnabled && <p className="text-sm text-muted">Outside these areas? You can always order for pickup.</p>}
        </div>
      )}
    </div>
  );
}
