"use client";
// Media library (ADR-013): every photo the restaurant has uploaded, with alt text for screen readers and where each
// one is used. The picker lets a section choose a photo or upload a new one; alt text is edited right where the photo
// is used, because homepage photos can't be published without it.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Trash2, Upload } from "lucide-react";
import type { MediaAsset, MediaKind } from "@restaurant-os/types";
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, Skeleton, cx, toast } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

export function useMediaLibrary() {
  const { request } = useSession();
  return useQuery({ queryKey: useTenantKey("media"), queryFn: () => request<{ items: MediaAsset[] }>("/v1/admin/media?limit=200").then((r) => r.items) });
}

export function useMediaMutations() {
  const { request } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("media");
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: [key[0], "appearance"] }); };
  return {
    upload: useMutation({
      mutationFn: ({ file, kind, alt }: { file: File; kind: MediaKind; alt?: string }) => {
        const body = new FormData();
        body.append("file", file);
        return request<MediaAsset>(`/v1/admin/media?kind=${kind}${alt ? `&alt=${encodeURIComponent(alt)}` : ""}`, { body });
      },
      onSuccess: refresh,
      onError: (e) => toast.error(errorMessage(e)),
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; altText?: string; kind?: MediaKind }) => request<MediaAsset>(`/v1/admin/media/${id}`, { method: "PATCH", body }),
      onSuccess: refresh,
      onError: (e) => toast.error(errorMessage(e)),
    }),
    remove: useMutation({
      mutationFn: (id: string) => request(`/v1/admin/media/${id}`, { method: "DELETE" }),
      onSuccess: () => { refresh(); toast.success("Photo deleted"); },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  };
}

function UploadButton({ kind, onUploaded, label = "Upload photo" }: { kind: MediaKind; onUploaded?: (asset: MediaAsset) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload } = useMediaMutations();
  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={label} tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload.mutate({ file, kind }, { onSuccess: (asset) => { toast.success("Photo uploaded"); onUploaded?.(asset); } });
        }} />
      <Button variant="outline" size="sm" loading={upload.isPending} icon={<Upload className="size-4" aria-hidden />} onClick={() => input.current?.click()}>{label}</Button>
    </>
  );
}

/** Alt text editor for one photo (saves on blur). */
export function AltTextField({ asset, label = "Describe this photo" }: { asset: { id: string; altText: string }; label?: string }) {
  const [value, setValue] = useState(asset.altText);
  const { update } = useMediaMutations();
  const save = () => { if (value.trim() !== asset.altText) update.mutate({ id: asset.id, altText: value.trim() }); };
  return (
    <Field label={label} required hint="What's in the photo, for people using screen readers — e.g. “Chicken biryani in a copper handi”."
      error={!value.trim() ? "Needed before you can publish." : null}>
      {(p) => <Input {...p} value={value} maxLength={250} onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />}
    </Field>
  );
}

export function MediaPicker({ open, onOpenChange, kind, onPick, selected }: { open: boolean; onOpenChange: (o: boolean) => void; kind: MediaKind; onPick: (asset: MediaAsset) => void; selected?: string | null }) {
  const library = useMediaLibrary();
  const items = library.data ?? [];
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Choose a photo" description="Photos from your library, newest first." size="lg"
      footer={<UploadButton kind={kind} label="Upload a new photo" onUploaded={(a) => { onPick(a); onOpenChange(false); }} />}>
      {library.isLoading ? <Skeleton className="h-64" /> : library.error ? <ErrorState description={errorMessage(library.error)} /> : !items.length ? (
        <EmptyState icon={<ImagePlus className="size-6" />} title="No photos yet" description="Upload your best food and place photos — bright, close and in focus work best." />
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => { onPick(m); onOpenChange(false); }} aria-pressed={selected === m.id}
                aria-label={`Use photo${m.altText ? `: ${m.altText}` : ""}`}
                className={cx("relative block aspect-square w-full overflow-hidden rounded-[var(--ros-radius-md)] bg-subtle ring-offset-2", selected === m.id ? "ring-2 ring-primary" : "hover:opacity-90")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" className="size-full object-cover" loading="lazy" />
                {selected === m.id && <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-contrast"><Check className="size-3.5" aria-hidden /></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** A section's photo: thumbnail, choose/replace/remove, and its alt text. */
export function ImageField({ label, imageId, onChange, kind, media, hint }: {
  label: string; imageId: string | null; onChange: (id: string | null) => void; kind: MediaKind; media: Record<string, { url: string; alt: string }>; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const library = useMediaLibrary();
  const asset = imageId ? library.data?.find((m) => m.id === imageId) ?? null : null;
  const url = asset?.url ?? (imageId ? media[imageId]?.url : undefined);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--ros-radius-md)] bg-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImagePlus className="m-auto mt-7 size-6 text-faint" aria-hidden />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{imageId ? "Replace" : "Choose photo"}</Button>
          {imageId && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>}
        </div>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {asset && <AltTextField key={asset.id} asset={asset} />}
      <MediaPicker open={open} onOpenChange={setOpen} kind={kind} selected={imageId} onPick={(a) => onChange(a.id)} />
    </div>
  );
}

const KIND_LABELS: Record<MediaKind, string> = {
  general: "General", logo: "Logo", hero: "Banner", product: "Dish", category: "Category", gallery: "Gallery", story: "Story", banner: "Banner",
};

/** The full library: every photo with its alt text, where it's used, and delete when unused. */
export function MediaLibraryPanel() {
  const library = useMediaLibrary();
  const { remove } = useMediaMutations();
  if (library.isLoading) return <Skeleton className="h-96" />;
  if (library.error) return <ErrorState description={errorMessage(library.error)} onRetry={() => void library.refetch()} />;
  const items = library.data ?? [];
  const missingAlt = items.filter((m) => !m.altText.trim() && m.usedIn.length > 0).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{items.length} photo{items.length === 1 ? "" : "s"}{missingAlt ? ` · ${missingAlt} in use without a description` : ""}</p>
        <UploadButton kind="general" />
      </div>
      {!items.length ? (
        <EmptyState icon={<ImagePlus className="size-6" />} title="Your photo library is empty" description="Photos you upload for dishes, categories and your homepage all appear here." />
      ) : (
        <ul className="space-y-3">
          {items.map((m) => (
            <li key={m.id} className="flex gap-3 rounded-[var(--ros-radius-lg)] border border-border bg-surface p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" className="size-20 shrink-0 rounded-[var(--ros-radius-md)] object-cover" loading="lazy" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge>{KIND_LABELS[m.kind]}</Badge>
                  {m.usedIn.length ? m.usedIn.map((u) => <Badge key={u} tone="info">{u}</Badge>) : <Badge tone="neutral">Not used</Badge>}
                </div>
                <AltTextField asset={m} label="Description (alt text)" />
              </div>
              <Button size="sm" variant="ghost" aria-label="Delete photo" disabled={m.usedIn.length > 0 || remove.isPending} title={m.usedIn.length ? "Remove it where it's used first" : undefined}
                onClick={() => remove.mutate(m.id)} icon={<Trash2 className="size-4" aria-hidden />} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
