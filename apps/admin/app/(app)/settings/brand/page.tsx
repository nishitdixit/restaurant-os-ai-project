"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { BrandSettingsSchema, type MediaAsset, type SetupStatus } from "@restaurant-os/types";
import { Alert, Button, Card, ConfirmDialog, ErrorState, Field, Input, Skeleton, Textarea, toast } from "@restaurant-os/ui";
import { errorMessage, STOREFRONT_URL } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";
import { useSaveSettings, useSettings, type SettingsResponse } from "@/lib/settings";

export default function BrandSettingsPage() {
  const { can, request } = useSession();
  const qc = useQueryClient();
  const settings = useSettings();
  const setupKey = useTenantKey("setup");
  const [f, setF] = useState<(SettingsResponse["brand"] & { cuisinesText: string }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useSaveSettings("brand", setErrors);
  const publish = useMutation({
    mutationFn: (published: boolean) => request<SetupStatus>("/v1/admin/publish", { body: { published } }),
    onSuccess: (s) => { qc.setQueryData(setupKey, s); void settings.refetch(); setUnpublishing(false); toast.success(s.published ? "Storefront published" : "Storefront unpublished"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  useEffect(() => { if (settings.data) setF({ ...settings.data.brand, cuisinesText: settings.data.brand.cuisines.join(", ") }); }, [settings.data]);
  if (settings.isLoading || !f) return settings.error ? <ErrorState description={errorMessage(settings.error)} onRetry={() => void settings.refetch()} /> : <Skeleton className="h-96" />;
  const disabled = !can("tenant.manage");

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const asset = await request<MediaAsset>("/v1/admin/media", { body: data });
      setF({ ...f, logoAssetId: asset.id, logoUrl: asset.url });
    } catch (e) { toast.error(errorMessage(e)); } finally { setUploading(false); }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: f.name, slug: f.slug, tagline: f.tagline, description: f.description, cuisines: f.cuisinesText.split(",").map((s) => s.trim()).filter(Boolean), logoAssetId: f.logoAssetId, links: f.links };
    const parsed = BrandSettingsSchema.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.at(-1)), i.message]))); return; }
    save.mutate(parsed.data);
  };
  const live = f.status === "ACTIVE";
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Storefront status</h2>
            <p className="mt-0.5 text-sm text-muted">{live ? "Live — customers can find you and order." : "Not published — only you can preview it."}</p>
          </div>
          {!disabled && (live
            ? <Button variant="outline" onClick={() => setUnpublishing(true)}>Unpublish</Button>
            : <Button loading={publish.isPending} onClick={() => publish.mutate(true)}>Publish</Button>)}
        </div>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">Brand</h2>
        <fieldset disabled={disabled} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 sm:col-span-2">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.logoUrl ? <img src={f.logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <ImagePlus className="size-6 text-faint" aria-hidden />}
            </div>
            <div className="flex flex-col gap-1">
              <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>{f.logoUrl ? "Change logo" : "Upload logo"}</Button>
              {f.logoUrl && <Button variant="ghost" size="sm" onClick={() => setF({ ...f, logoAssetId: null, logoUrl: null })}>Remove</Button>}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload logo" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
            </div>
          </div>
          <Field label="Brand name" required error={errors.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Web address" required error={errors.slug} hint={live ? "Changing it breaks links you've already shared." : `${STOREFRONT_URL.replace(/^https?:\/\//, "")}`}>{(p) => <Input {...p} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />}</Field>
          <Field label="Tagline" error={errors.tagline} hint="One line under your name" className="sm:col-span-2">{(p) => <Input {...p} maxLength={140} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} />}</Field>
          <Field label="About" error={errors.description} hint="Your story — shown on the home and contact pages and used by search engines" className="sm:col-span-2">{(p) => <Textarea {...p} rows={4} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <Field label="Cuisines" hint="Comma separated, e.g. Biryani, North Indian">{(p) => <Input {...p} value={f.cuisinesText} onChange={(e) => setF({ ...f, cuisinesText: e.target.value })} />}</Field>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Colours, fonts &amp; style</p>
            <Link href="/appearance" className="inline-flex h-11 items-center gap-2 rounded-[var(--ros-radius-md)] border border-border-strong bg-surface px-3 text-sm hover:bg-subtle">
              <span className="size-5 rounded-full ring-1 ring-border" style={{ background: f.primaryColor }} aria-hidden />Edit in Appearance →
            </Link>
          </div>
        </fieldset>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">Order channels &amp; links</h2>
        <p className="mt-0.5 text-sm text-muted">Shown as secondary options next to “Order direct”.</p>
        <fieldset disabled={disabled} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp number" error={errors.whatsapp}>{(p) => <Input {...p} type="tel" value={f.links.whatsapp} onChange={(e) => setF({ ...f, links: { ...f.links, whatsapp: e.target.value } })} />}</Field>
          <Field label="Instagram URL" error={errors.instagram}>{(p) => <Input {...p} type="url" value={f.links.instagram} onChange={(e) => setF({ ...f, links: { ...f.links, instagram: e.target.value } })} />}</Field>
          <Field label="Swiggy page URL" error={errors.swiggy}>{(p) => <Input {...p} type="url" value={f.links.swiggy} onChange={(e) => setF({ ...f, links: { ...f.links, swiggy: e.target.value } })} />}</Field>
          <Field label="Zomato page URL" error={errors.zomato}>{(p) => <Input {...p} type="url" value={f.links.zomato} onChange={(e) => setF({ ...f, links: { ...f.links, zomato: e.target.value } })} />}</Field>
          <Field label="Other website" error={errors.website} className="sm:col-span-2">{(p) => <Input {...p} type="url" value={f.links.website} onChange={(e) => setF({ ...f, links: { ...f.links, website: e.target.value } })} />}</Field>
        </fieldset>
      </Card>
      {Object.keys(errors).length > 0 && <Alert tone="danger">Please fix the highlighted fields.</Alert>}
      {!disabled && <div className="flex justify-end"><Button type="submit" size="lg" loading={save.isPending}>Save brand</Button></div>}
      <ConfirmDialog open={unpublishing} onOpenChange={setUnpublishing} title="Unpublish your storefront?" tone="danger" confirmLabel="Unpublish" loading={publish.isPending}
        description="Customers will see “coming soon” and can't order until you publish again." onConfirm={() => publish.mutate(false)} />
    </form>
  );
}
