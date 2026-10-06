"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, ImagePlus, Loader2, X } from "lucide-react";
import type { AdminCategory, AdminModifierGroup, AdminProduct, MediaAsset } from "@restaurant-os/types";
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, Select, Textarea, buttonClass, cx, toast } from "@restaurant-os/ui";
import { ApiError, errorMessage, fromMinor, STOREFRONT_URL, toMinor } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

interface FormState {
  name: string; categoryId: string; price: string; description: string; longDescription: string; dietary: string; spiceLevel: string;
  allergens: string; tags: string; modifierGroupIds: string[]; status: "DRAFT" | "ACTIVE"; imageAssetId: string | null; imageUrl: string | null;
}

function toForm(p: AdminProduct | null, defaultCategory: string): FormState {
  return {
    name: p?.name ?? "", categoryId: p?.categoryId ?? defaultCategory, price: p ? fromMinor(p.basePriceMinor) : "", description: p?.description ?? "",
    longDescription: p?.longDescription ?? "", dietary: p?.dietary ?? "", spiceLevel: p?.spiceLevel === null || p?.spiceLevel === undefined ? "" : String(p.spiceLevel),
    allergens: p?.allergens.join(", ") ?? "", tags: p?.tags.join(", ") ?? "", modifierGroupIds: p?.modifierGroupIds ?? [],
    status: p?.status === "ACTIVE" ? "ACTIVE" : "DRAFT", imageAssetId: p?.imageAssetId ?? null, imageUrl: p?.imageUrl ?? null,
  };
}

const list = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

export function ProductForm({ product }: { product: AdminProduct | null }) {
  const { request } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const productsKey = useTenantKey("products");
  const categories = useQuery({ queryKey: useTenantKey("categories"), queryFn: () => request<{ items: AdminCategory[] }>("/v1/admin/categories").then((r) => r.items) });
  const groups = useQuery({ queryKey: useTenantKey("modifier-groups"), queryFn: () => request<{ items: AdminModifierGroup[] }>("/v1/admin/modifier-groups").then((r) => r.items) });
  const [form, setForm] = useState<FormState>(() => toForm(product, ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!form.categoryId && categories.data?.[0]) setForm((f) => ({ ...f, categoryId: categories.data![0]!.id }));
  }, [categories.data, form.categoryId]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => { setForm((f) => ({ ...f, [key]: value })); setDirty(true); };

  const save = useMutation({
    mutationFn: (body: unknown) => product ? request<{ id: string }>(`/v1/admin/products/${product.id}`, { method: "PUT", body }) : request<{ id: string }>("/v1/admin/products", { body }),
    onSuccess: (r) => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: productsKey });
      toast.success(product ? "Item saved" : form.status === "ACTIVE" ? "Item added and published" : "Item saved as draft");
      router.push(product ? "/catalog" : `/catalog/${r.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      setFormError(errorMessage(e));
    },
  });

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast.error("Images must be smaller than 5 MB."); return; }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const asset = await request<MediaAsset>("/v1/admin/media", { body: data });
      setForm((f) => ({ ...f, imageAssetId: asset.id, imageUrl: asset.url }));
      setDirty(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = (status: "DRAFT" | "ACTIVE") => {
    setFormError(null);
    const errs: Record<string, string> = {};
    const price = toMinor(form.price);
    if (!form.name.trim()) errs.name = "Enter a name.";
    if (!form.categoryId) errs.categoryId = "Choose a category.";
    if (price === null) errs.basePriceMinor = "Enter a price like 249 or 249.50.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setForm((f) => ({ ...f, status }));
    save.mutate({
      categoryId: form.categoryId, name: form.name.trim(), description: form.description.trim(), longDescription: form.longDescription.trim(), basePriceMinor: price,
      imageAssetId: form.imageAssetId, dietary: form.dietary || null, spiceLevel: form.spiceLevel === "" ? null : Number(form.spiceLevel),
      allergens: list(form.allergens), tags: list(form.tags), modifierGroupIds: form.modifierGroupIds, status,
    });
  };

  const priceMinor = toMinor(form.price);
  return (
    <>
      <PageHeader title={product ? product.name : "Add menu item"}
        back={<Link href="/catalog" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />Menu</Link>}
        actions={product?.status === "ACTIVE" ? <a href={`${STOREFRONT_URL}/menu/${product.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}>View on storefront<ExternalLink className="size-3.5" aria-hidden /></a> : undefined} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required error={errors.name} className="sm:col-span-2">{(p) => <Input {...p} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Chicken Dum Biryani" />}</Field>
              <Field label="Category" required error={errors.categoryId}>{(p) => (
                <Select {...p} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}</Field>
              <Field label="Price" required error={errors.basePriceMinor} hint="Including taxes, as customers pay it">{(p) => <Input {...p} inputMode="decimal" prefix="₹" value={form.price} onChange={(e) => set("price", e.target.value)} />}</Field>
              <Field label="Short description" hint="One line on the menu card" className="sm:col-span-2">{(p) => <Input {...p} maxLength={300} value={form.description} onChange={(e) => set("description", e.target.value)} />}</Field>
              <Field label="Full description (optional)" hint="Shown on the item page — great for search engines" className="sm:col-span-2">{(p) => <Textarea {...p} rows={4} maxLength={3000} value={form.longDescription} onChange={(e) => set("longDescription", e.target.value)} />}</Field>
            </div>
          </Card>
          <Card>
            <h2 className="text-base font-semibold">Options</h2>
            <p className="mt-0.5 text-sm text-muted">Let customers choose a portion or add extras. <Link href="/catalog?tab=options" className="text-primary hover:underline">Manage option groups</Link></p>
            {groups.data?.length ? (
              <div className="mt-3 space-y-2">
                {groups.data.map((g) => (
                  <Checkbox key={g.id} checked={form.modifierGroupIds.includes(g.id)} label={g.name}
                    description={`${g.minSelections > 0 ? "Required" : "Optional"} · ${g.modifiers.map((m) => m.name).join(", ")}`}
                    onChange={(e) => set("modifierGroupIds", e.target.checked ? [...form.modifierGroupIds, g.id] : form.modifierGroupIds.filter((id) => id !== g.id))} />
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-muted">No option groups yet.</p>}
          </Card>
          <Card>
            <h2 className="text-base font-semibold">Food details</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Food type">{(p) => (
                <Select {...p} value={form.dietary} onChange={(e) => set("dietary", e.target.value)}>
                  <option value="">Not specified</option><option value="VEG">Vegetarian</option><option value="NON_VEG">Non-vegetarian</option><option value="EGG">Contains egg</option><option value="VEGAN">Vegan</option>
                </Select>
              )}</Field>
              <Field label="Spice level">{(p) => (
                <Select {...p} value={form.spiceLevel} onChange={(e) => set("spiceLevel", e.target.value)}>
                  <option value="">Not specified</option><option value="0">Not spicy</option><option value="1">Mild</option><option value="2">Medium</option><option value="3">Hot</option>
                </Select>
              )}</Field>
              <Field label="Allergens" hint="Comma separated, e.g. dairy, nuts">{(p) => <Input {...p} value={form.allergens} onChange={(e) => set("allergens", e.target.value)} />}</Field>
              <Field label="Tags" hint="Help search, e.g. bestseller, lunch">{(p) => <Input {...p} value={form.tags} onChange={(e) => set("tags", e.target.value)} />}</Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold">Photo</h2>
            <div className={cx("relative mt-3 flex aspect-square items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-subtle")}>
              {form.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
                  <button className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white" aria-label="Remove photo" onClick={() => { set("imageAssetId", null); set("imageUrl", null); }}><X className="size-4" /></button>
                </>
              ) : uploading ? <Loader2 className="size-6 animate-spin text-muted" aria-label="Uploading" /> : (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 p-6 text-sm text-muted hover:text-text">
                  <ImagePlus className="size-8" aria-hidden />Add a photo<span className="text-xs">JPEG, PNG or WebP · up to 5 MB</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            {form.imageUrl && <Button variant="ghost" size="sm" className="mt-2" onClick={() => fileRef.current?.click()} loading={uploading}>Replace photo</Button>}
          </Card>
          <Card className="lg:sticky lg:top-20">
            <h2 className="text-base font-semibold">Publish</h2>
            <p className="mt-1 text-sm text-muted">{product?.status === "ACTIVE" ? "This item is live on your storefront." : "Drafts are saved but not shown to customers."}</p>
            {priceMinor !== null && product && priceMinor !== product.basePriceMinor && (
              <Alert tone="warning" className="mt-3">Price changes from {fromMinor(product.basePriceMinor)} to {fromMinor(priceMinor)}. Past orders keep the price they were placed at.</Alert>
            )}
            {formError && <Alert tone="danger" className="mt-3">{formError}</Alert>}
            <div className="mt-4 flex flex-col gap-2">
              <Button size="lg" loading={save.isPending && form.status === "ACTIVE"} disabled={save.isPending || uploading} onClick={() => submit("ACTIVE")}>
                {product?.status === "ACTIVE" ? "Save changes" : "Save & publish"}
              </Button>
              <Button variant="outline" loading={save.isPending && form.status === "DRAFT"} disabled={save.isPending || uploading} onClick={() => submit("DRAFT")}>
                {product?.status === "ACTIVE" ? "Unpublish (save as draft)" : "Save as draft"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
