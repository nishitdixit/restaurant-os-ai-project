"use client";
// Offers (PRD 5.7, Journey E): create -> define eligibility -> define benefit -> publish -> monitor -> pause.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag } from "lucide-react";
import { PromotionInputSchema, type AdminPromotion } from "@restaurant-os/types";
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Switch, Textarea, formatDateTime, formatMoney, toast, type Tone } from "@restaurant-os/ui";
import { ApiError, errorMessage, fromMinor, toMinor } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

const STATE: Record<AdminPromotion["state"], [string, Tone]> = {
  ACTIVE: ["Live", "success"], PAUSED: ["Paused", "neutral"], SCHEDULED: ["Scheduled", "info"], EXPIRED: ["Expired", "neutral"], EXHAUSTED: ["Limit reached", "warning"],
};

function localInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function OfferEditor({ promo, onClose }: { promo: AdminPromotion | null; onClose: () => void }) {
  const { request } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("promotions");
  const now = new Date();
  const month = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const [f, setF] = useState({
    code: promo?.code ?? "", title: promo?.title ?? "", description: promo?.description ?? "", type: promo?.type ?? "FIXED",
    value: promo ? (promo.type === "FIXED" ? fromMinor(promo.value) : String(promo.value)) : "", minimum: fromMinor(promo?.minimumOrderMinor ?? 0),
    max: promo?.maxDiscountMinor ? fromMinor(promo.maxDiscountMinor) : "", startsAt: localInput(promo?.startsAt ?? now.toISOString()), endsAt: localInput(promo?.endsAt ?? month.toISOString()),
    usageCap: promo?.usageCap ? String(promo.usageCap) : "", newCustomerOnly: promo?.newCustomerOnly ?? false, oncePerCustomer: promo?.oncePerCustomer ?? true,
    isPublic: promo?.isPublic ?? true, active: promo?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: unknown) => promo ? request(`/v1/admin/promotions/${promo.id}`, { method: "PUT", body }) : request("/v1/admin/promotions", { body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); toast.success("Offer saved"); onClose(); },
    onError: (e) => { if (e instanceof ApiError) setErrors(e.fields); setFormError(errorMessage(e)); },
  });
  const submit = () => {
    setFormError(null);
    const value = f.type === "FIXED" ? toMinor(f.value) : Number(f.value);
    const body = {
      code: f.code, title: f.title, description: f.description, type: f.type, value: value ?? NaN, minimumOrderMinor: toMinor(f.minimum || "0") ?? NaN,
      maxDiscountMinor: f.type === "PERCENTAGE" && f.max ? toMinor(f.max) : null, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
      usageCap: f.usageCap ? Number(f.usageCap) : null, newCustomerOnly: f.newCustomerOnly, oncePerCustomer: f.oncePerCustomer, isPublic: f.isPublic, active: f.active,
    };
    const parsed = PromotionInputSchema.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    setErrors({});
    save.mutate(body);
  };
  const benefit = f.type === "FIXED" ? (toMinor(f.value) ? `${formatMoney(toMinor(f.value)!)} off` : "") : f.value ? `${f.value}% off${f.max ? ` up to ₹${f.max}` : ""}` : "";
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={promo ? `Edit ${promo.code}` : "New offer"} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={submit}>Save offer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" required error={errors.code} hint="Customers type this at checkout">{(p) => <Input {...p} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, "") })} className="font-mono uppercase" placeholder="WELCOME50" />}</Field>
        <Field label="Title" required error={errors.title} hint="Shown on your offers page">{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="₹50 off your first order" />}</Field>
        <Field label="Discount type">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "FIXED" | "PERCENTAGE" })}><option value="FIXED">Fixed amount (₹)</option><option value="PERCENTAGE">Percentage (%)</option></Select>}</Field>
        <Field label={f.type === "FIXED" ? "Amount off" : "Percent off"} required error={errors.value}>{(p) => <Input {...p} inputMode="decimal" prefix={f.type === "FIXED" ? "₹" : "%"} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>
        <Field label="Minimum order" error={errors.minimumOrderMinor} hint="Item total before delivery fee; 0 for none">{(p) => <Input {...p} inputMode="decimal" prefix="₹" value={f.minimum} onChange={(e) => setF({ ...f, minimum: e.target.value })} />}</Field>
        {f.type === "PERCENTAGE" && <Field label="Maximum discount (optional)" error={errors.maxDiscountMinor}>{(p) => <Input {...p} inputMode="decimal" prefix="₹" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />}</Field>}
        <Field label="Starts" required error={errors.startsAt}>{(p) => <Input {...p} type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />}</Field>
        <Field label="Ends" required error={errors.endsAt}>{(p) => <Input {...p} type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />}</Field>
        <Field label="Total uses allowed (optional)" error={errors.usageCap} hint="Across all customers; leave empty for unlimited">{(p) => <Input {...p} type="number" min={1} value={f.usageCap} onChange={(e) => setF({ ...f, usageCap: e.target.value })} />}</Field>
        <Field label="Description (optional)" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <div className="space-y-3 sm:col-span-2">
          <Checkbox checked={f.newCustomerOnly} onChange={(e) => setF({ ...f, newCustomerOnly: e.target.checked })} label="First order only" description="Only customers with no previous paid order can use it" />
          <Checkbox checked={f.oncePerCustomer} onChange={(e) => setF({ ...f, oncePerCustomer: e.target.checked })} label="Once per customer" description="Matched by mobile number" />
          <Checkbox checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} label="Show on the storefront" description="Hidden codes still work when shared directly" />
          <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} label="Active" />
        </div>
        {benefit && <Alert tone="info" className="sm:col-span-2" title="Preview">{f.code || "CODE"}: {benefit}{toMinor(f.minimum || "0") ? ` on orders above ₹${f.minimum}` : ""}{f.newCustomerOnly ? ", first order only" : ""}.</Alert>}
        {formError && <Alert tone="danger" className="sm:col-span-2">{formError}</Alert>}
      </div>
    </Modal>
  );
}

export default function OffersPage() {
  const { request } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("promotions");
  const promos = useQuery({ queryKey: key, queryFn: () => request<{ items: AdminPromotion[] }>("/v1/admin/promotions").then((r) => r.items) });
  const [editing, setEditing] = useState<AdminPromotion | "new" | null>(null);
  const [archiving, setArchiving] = useState<AdminPromotion | null>(null);
  const toggle = useMutation({
    mutationFn: (p: AdminPromotion) => request(`/v1/admin/promotions/${p.id}/active`, { body: { active: !p.active } }),
    onSuccess: (_d, p) => { void qc.invalidateQueries({ queryKey: key }); toast.success(p.active ? `${p.code} paused` : `${p.code} resumed`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: (p: AdminPromotion) => request(`/v1/admin/promotions/${p.id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); setArchiving(null); toast.success("Offer removed"); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Offers" description="Coupon codes for direct orders. Usage limits are enforced even when many customers check out at once."
        actions={<Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing("new")}>New offer</Button>} />
      {promos.isLoading ? <Skeleton className="h-64" /> : promos.error ? <ErrorState description={errorMessage(promos.error)} onRetry={() => void promos.refetch()} /> :
        !promos.data?.length ? <EmptyState icon={<Tag className="size-6" />} title="No offers yet" description="A welcome offer for first orders is a great way to move customers from aggregators to direct." action={<Button onClick={() => setEditing("new")}>Create an offer</Button>} /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {promos.data.map((p) => {
              const [label, tone] = STATE[p.state];
              return (
                <Card key={p.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-semibold">{p.code}</span><Badge tone={tone} dot>{label}</Badge>{!p.isPublic && <Badge>Hidden</Badge>}</p>
                      <p className="mt-0.5 text-sm text-muted">{p.title}</p>
                    </div>
                    <Switch checked={p.active} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(p)} ariaLabel={`${p.code} active`} />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div><dt className="text-muted">Benefit</dt><dd className="font-medium">{p.type === "FIXED" ? formatMoney(p.value) : `${p.value}%`}{p.minimumOrderMinor ? <span className="block text-xs font-normal text-muted">min {formatMoney(p.minimumOrderMinor)}</span> : null}</dd></div>
                    <div><dt className="text-muted">Used</dt><dd className="font-medium">{p.usageCount}{p.usageCap ? ` / ${p.usageCap}` : ""}</dd></div>
                    <div><dt className="text-muted">Discount given</dt><dd className="font-medium">{formatMoney(p.discountGivenMinor)}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-muted">{formatDateTime(p.startsAt, { dateStyle: "medium" })} – {formatDateTime(p.endsAt, { dateStyle: "medium" })}{p.newCustomerOnly ? " · first order only" : ""}{p.oncePerCustomer ? " · once per customer" : ""}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setArchiving(p)}>Remove</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      {editing && <OfferEditor promo={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} title={`Remove ${archiving?.code}?`} tone="danger" confirmLabel="Remove"
        description="The code stops working immediately. Past orders keep their discount." loading={archive.isPending} onConfirm={() => archiving && archive.mutate(archiving)} />
    </>
  );
}
