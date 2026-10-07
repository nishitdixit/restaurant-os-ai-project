"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@restaurant-os/ui";
import type { BrandLinks } from "@restaurant-os/types";
import { ApiError, errorMessage } from "./api";
import { useSession, useTenantKey } from "./session";

export interface SettingsResponse {
  business: { businessName: string; legalName: string; gstin: string; fssai: string; contactName: string; contactPhone: string; contactEmail: string; currency: "INR"; locale: "en-IN" };
  brand: { name: string; slug: string; tagline: string; description: string; cuisines: string[]; logoAssetId: string | null; logoUrl: string | null; primaryColor: string; links: BrandLinks; status: string; publishedAt: string | null };
  outlet: {
    name: string; phone: string; address: { line1: string; line2: string; city: string; region: string; postalCode: string }; location: { latitude: number; longitude: number } | null;
    hours: Record<string, [string, string][]>; timezone: string; acceptingOrders: boolean; deliveryEnabled: boolean; pickupEnabled: boolean; defaultPrepMinutes: number;
  } | null;
}

export function useSettings() {
  const { request } = useSession();
  return useQuery({ queryKey: useTenantKey("settings"), queryFn: () => request<SettingsResponse>("/v1/admin/settings") });
}

/** Saves one settings section; maps server field errors back to the form. */
export function useSaveSettings(section: "business" | "brand" | "outlet", onFieldErrors: (fields: Record<string, string>) => void) {
  const { request } = useSession();
  const qc = useQueryClient();
  const settingsKey = useTenantKey("settings");
  const setupKey = useTenantKey("setup");
  return useMutation({
    mutationFn: (body: unknown) => request(`/v1/admin/settings/${section}`, { method: "PUT", body }),
    onSuccess: () => {
      onFieldErrors({});
      void qc.invalidateQueries({ queryKey: settingsKey });
      void qc.invalidateQueries({ queryKey: setupKey });
      void qc.invalidateQueries({ queryKey: ["session"] });
      toast.success("Saved");
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) onFieldErrors(e.fields);
      toast.error(errorMessage(e));
    },
  });
}
