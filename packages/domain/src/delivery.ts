// Delivery serviceability (PRD 5.8): pincode zones, plus radius zones when the customer shares a
// location. No paid geocoding.

export type ZoneRule =
  | { type: "POSTAL_CODE"; postalCodes: readonly string[] }
  | { type: "RADIUS"; radiusKm: number };

export interface DeliveryZone {
  id: string;
  name: string;
  rule: ZoneRule;
  feeMinor: bigint;
  minimumOrderMinor: bigint;
  /** Free delivery when the item total reaches this amount; null/undefined = always charge the fee. */
  freeDeliveryMinimumMinor?: bigint | null;
  etaMin: number;
  etaMax: number;
  active: boolean;
}

/**
 * The delivery fee for an item total (BUSINESS_RULES P16): the zone fee, or nothing once the item total — before
 * any discount, like the minimum order (P2) — reaches the zone's free-delivery threshold.
 */
export function deliveryFeeFor(zone: Pick<DeliveryZone, "feeMinor" | "freeDeliveryMinimumMinor">, itemTotalMinor: bigint): bigint {
  const threshold = zone.freeDeliveryMinimumMinor ?? null;
  return threshold !== null && itemTotalMinor >= threshold ? 0n : zone.feeMinor;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function normalizePincode(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\s+/g, "");
  return /^[1-9][0-9]{5}$/.test(digits) ? digits : null;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ServiceabilityResult =
  | { serviceable: true; zone: DeliveryZone; distanceKm: number | null }
  | { serviceable: false; reason: "INVALID_PINCODE" | "NOT_SERVICEABLE" | "NO_ZONES"; message: string };

/**
 * Finds the zone serving an address. Pincode matches are preferred; a radius zone matches only
 * when both the customer location and the outlet location are known. When several zones match,
 * the cheapest fee wins (then the fastest ETA) so the customer always gets the best offer.
 */
export function findServiceableZone(
  zones: readonly DeliveryZone[],
  address: { postalCode: string | null | undefined; location?: GeoPoint | null },
  outlet: GeoPoint | null,
): ServiceabilityResult {
  const active = zones.filter((z) => z.active);
  if (!active.length) return { serviceable: false, reason: "NO_ZONES", message: "This restaurant has not set up delivery areas yet. Choose pickup instead." };
  const pincode = normalizePincode(address.postalCode);
  if (!pincode && !address.location) return { serviceable: false, reason: "INVALID_PINCODE", message: "Enter a valid 6-digit pincode." };

  const matches: { zone: DeliveryZone; distanceKm: number | null }[] = [];
  for (const zone of active) {
    if (zone.rule.type === "POSTAL_CODE" && pincode && zone.rule.postalCodes.includes(pincode)) {
      matches.push({ zone, distanceKm: null });
    } else if (zone.rule.type === "RADIUS" && address.location && outlet) {
      const distanceKm = haversineKm(outlet, address.location);
      if (distanceKm <= zone.rule.radiusKm) matches.push({ zone, distanceKm });
    }
  }
  if (!matches.length) {
    return {
      serviceable: false,
      reason: "NOT_SERVICEABLE",
      message: pincode ? `Sorry, we don't deliver to ${pincode} yet. You can choose pickup instead.` : "Sorry, your location is outside our delivery area. You can choose pickup instead.",
    };
  }
  matches.sort((a, b) => (a.zone.feeMinor === b.zone.feeMinor ? a.zone.etaMax - b.zone.etaMax : a.zone.feeMinor < b.zone.feeMinor ? -1 : 1));
  const best = matches[0]!;
  return { serviceable: true, zone: best.zone, distanceKm: best.distanceKm };
}

export function parseZoneRule(ruleType: string, config: unknown): ZoneRule | null {
  const c = (config ?? {}) as Record<string, unknown>;
  if (ruleType === "POSTAL_CODE" && Array.isArray(c.postalCodes)) {
    return { type: "POSTAL_CODE", postalCodes: c.postalCodes.map(String).map(normalizePincode).filter((p): p is string => p !== null) };
  }
  if (ruleType === "RADIUS" && typeof c.radiusKm === "number" && c.radiusKm > 0) return { type: "RADIUS", radiusKm: c.radiusKm };
  return null;
}
