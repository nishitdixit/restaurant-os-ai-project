"use client";
import { useEffect, useState } from "react";
import { BusinessSettingsSchema } from "@restaurant-os/types";
import { Button, Card, ErrorState, Field, Input, Skeleton } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useSaveSettings, useSettings, type SettingsResponse } from "@/lib/settings";

export default function BusinessSettingsPage() {
  const { can } = useSession();
  const settings = useSettings();
  const [f, setF] = useState<SettingsResponse["business"] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveSettings("business", setErrors);
  useEffect(() => { if (settings.data) setF(settings.data.business); }, [settings.data]);
  if (settings.isLoading || !f) return settings.error ? <ErrorState description={errorMessage(settings.error)} onRetry={() => void settings.refetch()} /> : <Skeleton className="h-96" />;
  const disabled = !can("tenant.manage");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = BusinessSettingsSchema.safeParse(f);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    save.mutate(parsed.data);
  };
  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <h2 className="text-base font-semibold">Business details</h2>
        <p className="mt-0.5 text-sm text-muted">Used on receipts and for your account. Not shown on the storefront.</p>
        <fieldset disabled={disabled} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Business name" required error={errors.businessName}>{(p) => <Input {...p} value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} />}</Field>
          <Field label="Legal name (optional)" error={errors.legalName}>{(p) => <Input {...p} value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} />}</Field>
          <Field label="GSTIN (optional)" error={errors.gstin}>{(p) => <Input {...p} value={f.gstin} maxLength={15} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} />}</Field>
          <Field label="FSSAI licence number" error={errors.fssai} hint="14 digits. Food businesses selling online must show it; it appears in your storefront footer.">{(p) => <Input {...p} inputMode="numeric" value={f.fssai} maxLength={14} onChange={(e) => setF({ ...f, fssai: e.target.value.replace(/\D/g, "") })} />}</Field>
          <Field label="Currency">{(p) => <Input {...p} value="INR (₹)" disabled />}</Field>
          <Field label="Primary contact" error={errors.contactName}>{(p) => <Input {...p} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />}</Field>
          <Field label="Contact phone" error={errors.contactPhone}>{(p) => <Input {...p} type="tel" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} />}</Field>
          <Field label="Contact email" error={errors.contactEmail} className="sm:col-span-2">{(p) => <Input {...p} type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />}</Field>
        </fieldset>
        {!disabled && <div className="mt-6 flex justify-end"><Button type="submit" loading={save.isPending}>Save</Button></div>}
      </Card>
    </form>
  );
}
