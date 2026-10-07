"use client";
// Delivery areas (PRD 5.8): pincode lists or a radius from the kitchen, each with fee, minimum order
// and ETA. Checkout refuses addresses outside every active area before payment.
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Plus } from "lucide-react";
import { DeliveryZoneInputSchema, type AdminDeliveryZone } from "@restaurant-os/types";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Switch, Textarea, formatMoney, toast } from "@restaurant-os/ui";
import { ApiError, errorMessage, fromMinor, toMinor } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

function ZoneEditor({ zone, hasLocation, onClose }: { zone: AdminDeliveryZone | null; hasLocation: boolean; onClose: () => void }) {
  const { request } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("zones");
  const [f, setF] = useState({
    name: zone?.name ?? "", ruleType: zone?.ruleType ?? "POSTAL_CODE", postalCodes: zone?.postalCodes.join(", ") ?? "", radiusKm: zone?.radiusKm ? String(zone.radiusKm) : "3",
    fee: fromMinor(zone?.feeMinor ?? 3000), minimum: fromMinor(zone?.minimumOrderMinor ?? 0), free: fromMinor(zone?.freeDeliveryMinimumMinor ?? null), etaMin: String(zone?.etaMin ?? 30), etaMax: String(zone?.etaMax ?? 45), active: zone?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: unknown) => zone ? request(`/v1/admin/delivery-zones/${zone.id}`, { method: "PUT", body }) : request("/v1/admin/delivery-zones", { body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: [key[0], "setup"] }); toast.success("Delivery area saved"); onClose(); },
    onError: (e) => { if (e instanceof ApiError) setErrors(e.fields); setFormError(errorMessage(e)); },
  });
  const submit = () => {
    const codes = f.postalCodes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const body = {
      name: f.name.trim(), ruleType: f.ruleType, postalCodes: f.ruleType === "POSTAL_CODE" ? codes : [], radiusKm: f.ruleType === "RADIUS" ? Number(f.radiusKm) : null,
      feeMinor: toMinor(f.fee || "0") ?? NaN, minimumOrderMinor: toMinor(f.minimum || "0") ?? NaN, freeDeliveryMinimumMinor: f.free.trim() ? toMinor(f.free) ?? NaN : null, etaMin: Number(f.etaMin), etaMax: Number(f.etaMax), active: f.active,
    };
    const parsed = DeliveryZoneInputSchema.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    setErrors({});
    save.mutate(body);
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={zone ? "Edit delivery area" : "New delivery area"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={submit}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name} className="sm:col-span-2">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Indiranagar and nearby" />}</Field>
        <Field label="Area defined by" className="sm:col-span-2">{(p) => (
          <Select {...p} value={f.ruleType} onChange={(e) => setF({ ...f, ruleType: e.target.value as "POSTAL_CODE" | "RADIUS" })}>
            <option value="POSTAL_CODE">Pincodes</option><option value="RADIUS">Distance from the kitchen</option>
          </Select>
        )}</Field>
        {f.ruleType === "POSTAL_CODE" ? (
          <Field label="Pincodes" required error={errors.postalCodes} hint="Separate with commas or spaces" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={f.postalCodes} onChange={(e) => setF({ ...f, postalCodes: e.target.value })} placeholder="560038, 560008, 560071" />}</Field>
        ) : (
          <>
            <Field label="Radius (km)" required error={errors.radiusKm}>{(p) => <Input {...p} type="number" min={0.5} max={50} step={0.5} value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: e.target.value })} />}</Field>
            <Alert tone={hasLocation ? "info" : "warning"} className="sm:col-span-2">
              {hasLocation ? "Applies when a customer shares their location at checkout; others are matched by pincode areas." : <>Set the kitchen&apos;s map location in <Link className="underline" href="/settings/outlet">outlet settings</Link> for distance-based areas to work.</>}
            </Alert>
          </>
        )}
        <Field label="Delivery fee" error={errors.feeMinor} hint="0 for free delivery">{(p) => <Input {...p} inputMode="decimal" prefix="₹" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />}</Field>
        <Field label="Minimum order" error={errors.minimumOrderMinor}>{(p) => <Input {...p} inputMode="decimal" prefix="₹" value={f.minimum} onChange={(e) => setF({ ...f, minimum: e.target.value })} />}</Field>
        <Field label="Free delivery above (optional)" error={errors.freeDeliveryMinimumMinor} hint="Item total before discounts. Customers see how much more they need in their cart.">{(p) => <Input {...p} inputMode="decimal" prefix="₹" value={f.free} onChange={(e) => setF({ ...f, free: e.target.value })} />}</Field>
        <Field label="Delivery time from (min)" error={errors.etaMin}>{(p) => <Input {...p} type="number" min={0} value={f.etaMin} onChange={(e) => setF({ ...f, etaMin: e.target.value })} />}</Field>
        <Field label="to (min)" error={errors.etaMax}>{(p) => <Input {...p} type="number" min={0} value={f.etaMax} onChange={(e) => setF({ ...f, etaMax: e.target.value })} />}</Field>
        <div className="sm:col-span-2"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} label="Active" description="Inactive areas are ignored at checkout" /></div>
        {formError && <Alert tone="danger" className="sm:col-span-2">{formError}</Alert>}
      </div>
    </Modal>
  );
}

export default function DeliveryPage() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("zones");
  const zones = useQuery({ queryKey: key, queryFn: () => request<{ items: AdminDeliveryZone[] }>("/v1/admin/delivery-zones").then((r) => r.items) });
  const settings = useQuery({ queryKey: useTenantKey("settings"), queryFn: () => request<{ outlet: { deliveryEnabled: boolean; pickupEnabled: boolean; location: unknown } | null }>("/v1/admin/settings"), enabled: can("tenant.read") });
  const [editing, setEditing] = useState<AdminDeliveryZone | "new" | null>(null);
  const [removing, setRemoving] = useState<AdminDeliveryZone | null>(null);
  const remove = useMutation({
    mutationFn: (z: AdminDeliveryZone) => request(`/v1/admin/delivery-zones/${z.id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); setRemoving(null); toast.success("Delivery area removed"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const outlet = settings.data?.outlet;
  return (
    <>
      <PageHeader title="Delivery areas" description="Where you deliver, what it costs, and how long it takes." actions={<Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing("new")}>Add area</Button>} />
      {outlet && !outlet.deliveryEnabled && (
        <Alert tone="warning" className="mb-4" title="Delivery is turned off" action={<Link href="/settings/outlet" className="text-sm font-medium underline">Change</Link>}>
          Customers can only order for pickup. Turn delivery on in outlet settings.
        </Alert>
      )}
      {zones.isLoading ? <Skeleton className="h-64" /> : zones.error ? <ErrorState description={errorMessage(zones.error)} onRetry={() => void zones.refetch()} /> :
        !zones.data?.length ? <EmptyState icon={<Bike className="size-6" />} title="No delivery areas yet" description="Add the pincodes you deliver to. Customers outside them are told before they pay, and can choose pickup." action={<Button onClick={() => setEditing("new")}>Add your first area</Button>} /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {zones.data.map((z) => (
              <Card key={z.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{z.name} {!z.active && <Badge>Inactive</Badge>}</p>
                    <p className="mt-0.5 text-sm text-muted">{z.ruleType === "POSTAL_CODE" ? `${z.postalCodes.length} pincode${z.postalCodes.length === 1 ? "" : "s"}` : `Within ${z.radiusKm} km`}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(z)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(z)}>Remove</Button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-muted">Fee</dt><dd className="font-medium">{z.feeMinor ? formatMoney(z.feeMinor) : "Free"}</dd></div>
                  <div><dt className="text-muted">Minimum</dt><dd className="font-medium">{z.minimumOrderMinor ? formatMoney(z.minimumOrderMinor) : "None"}</dd></div>
                  {z.freeDeliveryMinimumMinor !== null && <div><dt className="text-muted">Free delivery</dt><dd className="font-medium">above {formatMoney(z.freeDeliveryMinimumMinor)}</dd></div>}
                  <div><dt className="text-muted">Time</dt><dd className="font-medium">{z.etaMin}–{z.etaMax} min</dd></div>
                </dl>
                {z.ruleType === "POSTAL_CODE" && <p className="mt-3 text-xs text-muted">{z.postalCodes.join(", ")}</p>}
              </Card>
            ))}
          </div>
        )}
      {editing && <ZoneEditor zone={editing === "new" ? null : editing} hasLocation={!!outlet?.location} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Remove ${removing?.name}?`} tone="danger" confirmLabel="Remove"
        description="Customers in this area won't be able to order delivery." loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing)} />
    </>
  );
}
