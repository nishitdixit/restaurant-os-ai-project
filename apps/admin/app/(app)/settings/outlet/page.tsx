"use client";
import { useEffect, useState } from "react";
import { Copy, Crosshair, Plus, Trash2 } from "lucide-react";
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from "@restaurant-os/domain";
import { OutletSettingsSchema } from "@restaurant-os/types";
import { Alert, Button, Card, ErrorState, Field, Input, Skeleton, Switch, toast } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useSaveSettings, useSettings, type SettingsResponse } from "@/lib/settings";

type Outlet = NonNullable<SettingsResponse["outlet"]>;

function HoursEditor({ hours, onChange, disabled }: { hours: Outlet["hours"]; onChange: (h: Outlet["hours"]) => void; disabled: boolean }) {
  const set = (day: Weekday, ranges: [string, string][]) => onChange({ ...hours, [day]: ranges });
  return (
    <div className="divide-y divide-border">
      {WEEKDAYS.map((day) => {
        const ranges = hours[day] ?? [];
        return (
          <div key={day} className="flex flex-wrap items-start gap-3 py-3">
            <div className="flex w-36 items-center gap-2 pt-2">
              <Switch size="sm" checked={ranges.length > 0} disabled={disabled} onCheckedChange={(open) => set(day, open ? [["11:00", "23:00"]] : [])} ariaLabel={`Open on ${WEEKDAY_LABELS[day]}`} />
              <span className="text-sm font-medium">{WEEKDAY_LABELS[day]}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {ranges.length === 0 && <p className="pt-2 text-sm text-muted">Closed</p>}
              {ranges.map(([open, close], i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input type="time" aria-label={`${WEEKDAY_LABELS[day]} opens`} value={open} disabled={disabled} className="w-32" onChange={(e) => set(day, ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                  <span className="text-sm text-muted">to</span>
                  <Input type="time" aria-label={`${WEEKDAY_LABELS[day]} closes`} value={close} disabled={disabled} className="w-32" onChange={(e) => set(day, ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                  {close <= open && <span className="text-xs text-muted">(past midnight)</span>}
                  {!disabled && <button type="button" className="rounded p-1.5 text-muted hover:bg-subtle hover:text-danger" aria-label="Remove time range" onClick={() => set(day, ranges.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>}
                </div>
              ))}
            </div>
            {!disabled && (
              <div className="flex gap-1 pt-1">
                {ranges.length > 0 && ranges.length < 4 && <button type="button" className="rounded p-1.5 text-muted hover:bg-subtle" aria-label={`Add a split shift on ${WEEKDAY_LABELS[day]}`} onClick={() => set(day, [...ranges, ["18:00", "23:00"]])}><Plus className="size-4" /></button>}
                {ranges.length > 0 && <button type="button" className="rounded p-1.5 text-muted hover:bg-subtle" aria-label={`Copy ${WEEKDAY_LABELS[day]} to every day`} title="Copy to all days" onClick={() => onChange(Object.fromEntries(WEEKDAYS.map((d) => [d, ranges])))}><Copy className="size-4" /></button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OutletSettingsPage() {
  const { can } = useSession();
  const settings = useSettings();
  const [f, setF] = useState<Outlet | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveSettings("outlet", setErrors);
  useEffect(() => {
    if (settings.data?.outlet) {
      setF(settings.data.outlet);
      setLat(settings.data.outlet.location ? String(settings.data.outlet.location.latitude) : "");
      setLng(settings.data.outlet.location ? String(settings.data.outlet.location.longitude) : "");
    }
  }, [settings.data]);
  if (settings.isLoading || !f) return settings.error ? <ErrorState description={errorMessage(settings.error)} onRetry={() => void settings.refetch()} /> : <Skeleton className="h-96" />;
  const disabled = !can("tenant.manage");

  const locate = () => navigator.geolocation?.getCurrentPosition(
    (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); toast.success("Location filled in from this device"); },
    () => toast.error("Couldn't get your location. Enter it manually (from Google Maps: right-click → coordinates)."),
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const location = lat && lng ? { latitude: Number(lat), longitude: Number(lng) } : null;
    const body = { ...f, location };
    const parsed = OutletSettingsSchema.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.at(-1)), i.message]))); toast.error("Please fix the highlighted fields."); return; }
    if (!f.deliveryEnabled && !f.pickupEnabled) { toast.error("Turn on delivery, pickup or both."); return; }
    save.mutate(parsed.data);
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card>
        <h2 className="text-base font-semibold">Ordering</h2>
        <div className="mt-4 space-y-4">
          <Switch checked={f.acceptingOrders} disabled={disabled} onCheckedChange={(v) => setF({ ...f, acceptingOrders: v })} label="Accepting online orders" description="Pause when the kitchen is overloaded; customers can still browse." />
          <Switch checked={f.deliveryEnabled} disabled={disabled} onCheckedChange={(v) => setF({ ...f, deliveryEnabled: v })} label="Delivery" description="Uses your delivery areas for fees and coverage" />
          <Switch checked={f.pickupEnabled} disabled={disabled} onCheckedChange={(v) => setF({ ...f, pickupEnabled: v })} label="Pickup" description="Customers collect from the kitchen" />
          <Field label="Usual preparation time (minutes)" error={errors.defaultPrepMinutes} hint="Shown to pickup customers" className="max-w-xs">{(p) => <Input {...p} type="number" min={0} max={240} disabled={disabled} value={f.defaultPrepMinutes} onChange={(e) => setF({ ...f, defaultPrepMinutes: Number(e.target.value) })} />}</Field>
        </div>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">Kitchen address</h2>
        <fieldset disabled={disabled} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Outlet name" required error={errors.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Phone" required error={errors.phone}>{(p) => <Input {...p} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
          <Field label="Address line 1" required error={errors.line1} className="sm:col-span-2">{(p) => <Input {...p} value={f.address.line1} onChange={(e) => setF({ ...f, address: { ...f.address, line1: e.target.value } })} />}</Field>
          <Field label="Address line 2" className="sm:col-span-2">{(p) => <Input {...p} value={f.address.line2} onChange={(e) => setF({ ...f, address: { ...f.address, line2: e.target.value } })} />}</Field>
          <Field label="City" required error={errors.city}>{(p) => <Input {...p} value={f.address.city} onChange={(e) => setF({ ...f, address: { ...f.address, city: e.target.value } })} />}</Field>
          <Field label="State" error={errors.region}>{(p) => <Input {...p} value={f.address.region} onChange={(e) => setF({ ...f, address: { ...f.address, region: e.target.value } })} />}</Field>
          <Field label="Pincode" required error={errors.postalCode}>{(p) => <Input {...p} inputMode="numeric" maxLength={6} value={f.address.postalCode} onChange={(e) => setF({ ...f, address: { ...f.address, postalCode: e.target.value.replace(/\D/g, "") } })} />}</Field>
          <div />
          <Field label="Latitude (optional)" error={errors.latitude} hint="Needed for distance-based delivery areas">{(p) => <Input {...p} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />}</Field>
          <Field label="Longitude (optional)" error={errors.longitude}>{(p) => <Input {...p} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />}</Field>
          {!disabled && <div className="sm:col-span-2"><Button variant="ghost" size="sm" icon={<Crosshair className="size-4" aria-hidden />} onClick={locate}>Use this device&apos;s location (if you&apos;re at the kitchen)</Button></div>}
        </fieldset>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">Opening hours</h2>
        <p className="mt-0.5 text-sm text-muted">Orders are only accepted while you&apos;re open ({f.timezone}). Use + for split shifts.</p>
        {errors.hours && <Alert tone="danger" className="mt-3">{errors.hours}</Alert>}
        <div className="mt-2"><HoursEditor hours={f.hours} disabled={disabled} onChange={(hours) => setF({ ...f, hours })} /></div>
      </Card>
      {!disabled && <div className="flex justify-end"><Button type="submit" size="lg" loading={save.isPending}>Save</Button></div>}
    </form>
  );
}
