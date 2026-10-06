"use client";
// Appearance (ADR-012): the restaurant's storefront look and feel. Edits autosave as a private draft and show live
// in the preview; customers see nothing until "Publish". Publishing is blocked while text would be hard to read.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Palette, SlidersHorizontal } from "lucide-react";
import { checkTheme, presetById, type StoreTheme, type ThemeIssue } from "@restaurant-os/domain";
import type { AdminProduct, AppearanceState } from "@restaurant-os/types";
import { Alert, Button, ConfirmDialog, DateTime, EmptyState, ErrorState, PageHeader, RelativeTime, Skeleton, Tabs, toast } from "@restaurant-os/ui";
import { ThemeControls } from "@/components/appearance/controls";
import { PresetGallery, type PreviewContent } from "@/components/appearance/presets";
import { LivePreview } from "@/components/appearance/preview";
import { ApiError, errorMessage } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { useSession, useTenantKey } from "@/lib/session";

const same = (a: StoreTheme | null | undefined, b: StoreTheme | null | undefined) => JSON.stringify(a) === JSON.stringify(b);

export default function AppearancePage() {
  const { request, can } = useSession();
  const canEdit = can("tenant.manage");
  const qc = useQueryClient();
  const key = useTenantKey("appearance");
  const state = useQuery({ queryKey: key, queryFn: () => request<AppearanceState>("/v1/admin/appearance") });
  const settings = useSettings();
  const products = useQuery({ queryKey: useTenantKey("products"), queryFn: () => request<{ items: AdminProduct[] }>("/v1/admin/products?status=all").then((r) => r.items) });

  const [working, setWorking] = useState<StoreTheme | null>(null);
  const [tab, setTab] = useState("presets");
  const [keepBrand, setKeepBrand] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<StoreTheme | null>(null);

  // Start from the saved draft, or the live theme when there is none (once per load).
  useEffect(() => {
    if (state.data && !working) setWorking(state.data.draft ?? state.data.published);
  }, [state.data, working]);

  const saveDraft = useMutation({
    mutationFn: (theme: StoreTheme) => request<AppearanceState>("/v1/admin/appearance/draft", { method: "PUT", body: { theme } }),
    onMutate: () => setSaving("saving"),
    onSuccess: (data) => { qc.setQueryData(key, data); setSaving(pending.current ? "pending" : "idle"); },
    onError: (e) => { setSaving("error"); toast.error(`Couldn't save your draft: ${errorMessage(e)}`); },
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const theme = pending.current;
    pending.current = null;
    if (theme) saveDraft.mutate(theme);
  }, [saveDraft]);

  // Save the draft on unmount so nothing is lost when leaving the page.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const workingRef = useRef(working);
  workingRef.current = working;
  const update = useCallback((fn: (theme: StoreTheme) => StoreTheme) => {
    if (!workingRef.current) return;
    const next = fn(workingRef.current);
    workingRef.current = next;
    setWorking(next);
    pending.current = next;
    setSaving("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 800);
  }, []);

  const replace = useCallback((theme: StoreTheme) => update(() => theme), [update]);

  const publish = useMutation({
    mutationFn: (theme: StoreTheme) => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
      return request<AppearanceState>("/v1/admin/appearance/publish", { body: { theme } });
    },
    onSuccess: (data) => { qc.setQueryData(key, data); setWorking(data.published); setSaving("idle"); toast.success("Your new look is live"); },
    onError: (e) => toast.error(e instanceof ApiError && e.code === "THEME_NOT_READABLE" ? "Fix the readability issues first." : errorMessage(e)),
  });

  const discard = useMutation({
    mutationFn: () => request<AppearanceState>("/v1/admin/appearance/draft", { method: "DELETE" }),
    onSuccess: (data) => { if (timer.current) clearTimeout(timer.current); pending.current = null; qc.setQueryData(key, data); setWorking(data.published); setSaving("idle"); setConfirmDiscard(false); toast.success("Draft discarded"); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => request<AppearanceState>("/v1/admin/appearance/restore", { body: { versionId } }),
    onSuccess: (data) => { qc.setQueryData(key, data); setWorking(data.published); setRestoreId(null); toast.success("Earlier look restored and live"); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const check = useMemo(() => (working ? checkTheme(working) : { errors: [], warnings: [] }), [working]);
  const fix = (issue: ThemeIssue) => { if (issue.fix) update((t) => ({ ...t, colors: { ...t.colors, [issue.fix!.color]: issue.fix!.value } })); };
  const fixAll = () => update((t) => {
    const next = structuredClone(t);
    for (const i of checkTheme(t).errors) if (i.fix) next.colors[i.fix.color] = i.fix.value;
    return next;
  });

  const content: PreviewContent = useMemo(() => {
    const active = (products.data ?? []).filter((p) => p.status === "ACTIVE");
    const dishes = (active.length ? active : products.data ?? []).slice(0, 3).map((p) => ({ name: p.name, priceMinor: p.basePriceMinor, imageUrl: p.imageUrl }));
    return {
      name: settings.data?.brand.name ?? "Your restaurant",
      logoUrl: settings.data?.brand.logoUrl ?? null,
      dishes: dishes.length ? dishes : [{ name: "Paneer tikka", priceMinor: 24900, imageUrl: null }, { name: "Dal makhani", priceMinor: 21900, imageUrl: null }, { name: "Butter naan", priceMinor: 5900, imageUrl: null }],
    };
  }, [products.data, settings.data]);

  if (state.isLoading || (state.data && !working)) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><div className="grid gap-6 lg:grid-cols-[420px_1fr]"><Skeleton className="h-[640px]" /><Skeleton className="h-[640px]" /></div></div>;
  }
  if (state.error || !state.data || !working) return <ErrorState description={errorMessage(state.error)} onRetry={() => void state.refetch()} />;

  const data = state.data;
  const unpublished = !same(working, data.published);
  const status = saving === "saving" ? "Saving draft…" : saving === "pending" ? "Unsaved changes…" : saving === "error" ? "Draft not saved" : unpublished ? "Draft saved · not live yet" : "Everything is live";
  const preset = working.presetId ? presetById(working.presetId) : null;

  return (
    <>
      <PageHeader title="Appearance" description="How your online store looks to customers. Changes are saved as a draft and go live when you publish."
        actions={canEdit ? (
          <>
            <span className="text-sm text-muted" role="status" aria-live="polite">{status}</span>
            <Button variant="outline" disabled={!unpublished || discard.isPending} onClick={() => setConfirmDiscard(true)}>Discard changes</Button>
            <Button disabled={!unpublished || check.errors.length > 0} loading={publish.isPending} onClick={() => publish.mutate(working)}>Publish</Button>
          </>
        ) : undefined} />

      {!canEdit && <Alert tone="info" className="mb-4" title="View only">Only the restaurant owner can change the store&apos;s look.</Alert>}
      {check.errors.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`Fix ${check.errors.length} readability issue${check.errors.length === 1 ? "" : "s"} before publishing`}
          action={canEdit ? <Button size="sm" variant="outline" onClick={fixAll}>Fix all</Button> : undefined}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {check.errors.map((e) => <li key={e.key}>{e.message} <span className="text-muted">({e.ratio}:1, needs {e.required}:1)</span></li>)}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-3 text-sm text-muted">
            Current style: <span className="font-medium text-text">{preset ? preset.name : "Custom"}</span>
            {preset && !same(working, preset.theme) && " (customised)"}
            {data.publishedAt && <> · live since <DateTime iso={data.publishedAt} options={{ dateStyle: "medium" }} /></>}
          </p>
          <Tabs value={tab} onValueChange={setTab} className="mb-4" items={[
            { value: "presets", label: <span className="inline-flex items-center gap-1.5"><Palette className="size-4" aria-hidden />Styles</span> },
            { value: "customise", label: <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="size-4" aria-hidden />Customise</span> },
            { value: "history", label: <span className="inline-flex items-center gap-1.5"><History className="size-4" aria-hidden />History</span> },
          ]} />
          <fieldset disabled={!canEdit} className="min-w-0">
            {tab === "presets" && (
              <PresetGallery current={working} brandColor={data.published.colors.primary} keepBrandColor={keepBrand} onKeepBrandColor={setKeepBrand} content={content} disabled={!canEdit}
                onApply={(theme, p) => { replace(theme); toast.success(`${p.name} applied to your draft`, { description: "Fine-tune it under Customise, then publish." }); }} />
            )}
            {tab === "customise" && <ThemeControls theme={working} update={update} issues={check.errors} onFix={fix} />}
          </fieldset>
          {tab === "history" && (
            data.versions.length === 0
              ? <EmptyState title="No published looks yet" description="Each time you publish, the look is saved here so you can go back to it." />
              : (
                <ul className="divide-y divide-border rounded-[var(--ros-radius-lg)] border border-border bg-surface">
                  {data.versions.map((v, i) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{v.presetId ? presetById(v.presetId)?.name ?? "Custom" : "Custom"}{i === 0 && <span className="ml-2 text-xs font-normal text-success">Live</span>}</p>
                        <p className="text-xs text-muted"><RelativeTime iso={v.publishedAt} />{v.publishedBy ? ` · ${v.publishedBy}` : ""}</p>
                      </div>
                      {i > 0 && canEdit && <Button size="sm" variant="outline" onClick={() => setRestoreId(v.id)}>Restore</Button>}
                    </li>
                  ))}
                </ul>
              )
          )}
        </div>
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <LivePreview theme={working} />
        </div>
      </div>

      <ConfirmDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Discard your changes?" description="Your draft goes back to the look customers see now."
        confirmLabel="Discard" tone="danger" loading={discard.isPending} onConfirm={() => discard.mutate()} />
      <ConfirmDialog open={!!restoreId} onOpenChange={(o) => !o && setRestoreId(null)} title="Restore this look?" description="It goes live for customers straight away. Your current look stays in the history."
        confirmLabel="Restore and publish" loading={restore.isPending} onConfirm={() => restoreId && restore.mutate(restoreId)} />
    </>
  );
}
