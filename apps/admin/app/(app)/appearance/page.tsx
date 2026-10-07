"use client";
// Appearance (ADR-012 + ADR-013): the restaurant's whole storefront — complete one-click styles, design tokens, the
// homepage builder, photos, menu presentation and search & sharing. Edits autosave as one private draft (look and
// layout together) and show live in the preview; customers see nothing until "Publish". Publishing is blocked while
// text would be hard to read or a homepage photo has no description.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Image as ImageIcon, LayoutTemplate, ListTree, Palette, Search, Sparkles } from "lucide-react";
import {
  applyLayoutPreset, checkExperience, checkTheme, presetById, presetDesign, type StoreExperience, type StoreTheme, type ThemeIssue,
} from "@restaurant-os/domain";
import type { AdminCategory, AdminProduct, AppearanceState } from "@restaurant-os/types";
import { Alert, Button, ConfirmDialog, DateTime, EmptyState, ErrorState, PageHeader, RelativeTime, Skeleton, Tabs, toast } from "@restaurant-os/ui";
import { ThemeControls } from "@/components/appearance/controls";
import { MediaLibraryPanel, useMediaLibrary } from "@/components/appearance/media";
import { PresetGallery, type ApplyMode, type PreviewContent } from "@/components/appearance/presets";
import { LivePreview } from "@/components/appearance/preview";
import { SectionsPanel, type BuilderData } from "@/components/appearance/sections";
import { LayoutPanel, MenuPanel, SeoPanel } from "@/components/appearance/site";
import { ApiError, errorMessage } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { useSession, useTenantKey } from "@/lib/session";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Working { theme: StoreTheme; experience: StoreExperience }
type Part = "theme" | "experience";

export default function AppearancePage() {
  const { request, can } = useSession();
  const canEdit = can("tenant.manage");
  const qc = useQueryClient();
  const key = useTenantKey("appearance");
  const state = useQuery({ queryKey: key, queryFn: () => request<AppearanceState>("/v1/admin/appearance") });
  const settings = useSettings();
  const products = useQuery({ queryKey: useTenantKey("products"), queryFn: () => request<{ items: AdminProduct[] }>("/v1/admin/products?status=all").then((r) => r.items) });
  const categories = useQuery({ queryKey: useTenantKey("categories"), queryFn: () => request<{ items: AdminCategory[] }>("/v1/admin/categories").then((r) => r.items) });
  const library = useMediaLibrary();

  const [working, setWorking] = useState<Working | null>(null);
  const [tab, setTab] = useState("styles");
  const [keepBrand, setKeepBrand] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef<Set<Part>>(new Set());

  // Start from the saved draft, or what's live when there is none (once per load).
  useEffect(() => {
    if (state.data && !working) {
      setWorking({ theme: state.data.draft ?? state.data.published, experience: state.data.experience.draft ?? state.data.experience.published });
    }
  }, [state.data, working]);

  const workingRef = useRef(working);
  workingRef.current = working;

  const saveDraft = useMutation({
    mutationFn: ({ body }: { body: Partial<Working>; parts: Part[] }) => request<AppearanceState>("/v1/admin/appearance/draft", { method: "PUT", body }),
    onMutate: () => setSaving("saving"),
    onSuccess: (data, { parts }) => {
      qc.setQueryData(key, data);
      setSaving(dirty.current.size ? "pending" : "idle");
      // Layout and content changes are rendered by the server: refresh the preview once they are saved.
      if (parts.includes("experience")) setRefreshKey((k) => k + 1);
    },
    onError: (e) => { setSaving("error"); toast.error(`Couldn't save your draft: ${errorMessage(e)}`); },
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const w = workingRef.current;
    const parts = [...dirty.current];
    dirty.current.clear();
    if (!w || !parts.length) return;
    saveDraft.mutate({ body: Object.fromEntries(parts.map((p) => [p, w[p]])) as Partial<Working>, parts });
  }, [saveDraft]);

  // Save the draft on unmount so nothing is lost when leaving the page.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const update = useCallback((fn: (w: Working) => Working, parts: Part[], delay = 800) => {
    if (!workingRef.current) return;
    const next = fn(workingRef.current);
    workingRef.current = next;
    setWorking(next);
    for (const p of parts) dirty.current.add(p);
    setSaving("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), delay);
  }, []);
  const updateTheme = useCallback((fn: (t: StoreTheme) => StoreTheme) => update((w) => ({ ...w, theme: fn(w.theme) }), ["theme"]), [update]);
  const updateExperience = useCallback((fn: (e: StoreExperience) => StoreExperience) => update((w) => ({ ...w, experience: fn(w.experience) }), ["experience"], 600), [update]);

  const publish = useMutation({
    mutationFn: (w: Working) => {
      if (timer.current) clearTimeout(timer.current);
      dirty.current.clear();
      return request<AppearanceState>("/v1/admin/appearance/publish", { body: { theme: w.theme, experience: w.experience } });
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setWorking({ theme: data.published, experience: data.experience.published });
      setSaving("idle");
      setRefreshKey((k) => k + 1);
      toast.success("Your new look is live");
    },
    onError: (e) => toast.error(e instanceof ApiError && (e.code === "THEME_NOT_READABLE" || e.code === "EXPERIENCE_NOT_READY") ? e.message : errorMessage(e)),
  });

  const discard = useMutation({
    mutationFn: () => request<AppearanceState>("/v1/admin/appearance/draft", { method: "DELETE" }),
    onSuccess: (data) => {
      if (timer.current) clearTimeout(timer.current);
      dirty.current.clear();
      qc.setQueryData(key, data);
      setWorking({ theme: data.published, experience: data.experience.published });
      setSaving("idle");
      setConfirmDiscard(false);
      setRefreshKey((k) => k + 1);
      toast.success("Draft discarded");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => request<AppearanceState>("/v1/admin/appearance/restore", { body: { versionId } }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setWorking({ theme: data.published, experience: data.experience.published });
      setRestoreId(null);
      setRefreshKey((k) => k + 1);
      toast.success("Earlier version restored and live");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Every photo the builder may show: the library (newest names and alt text) over what the server resolved.
  const mediaMap = useMemo(() => {
    const map: Record<string, { url: string; alt: string }> = { ...(state.data?.media ?? {}) };
    for (const m of library.data ?? []) map[m.id] = { url: m.url, alt: m.altText };
    return map;
  }, [state.data?.media, library.data]);

  const themeCheck = useMemo(() => (working ? checkTheme(working.theme) : { errors: [], warnings: [] }), [working]);
  const experienceCheck = useMemo(() => (working ? checkExperience(working.experience, { altText: (id) => mediaMap[id]?.alt }) : { errors: [], warnings: [] }), [working, mediaMap]);
  const fix = (issue: ThemeIssue) => { if (issue.fix) updateTheme((t) => ({ ...t, colors: { ...t.colors, [issue.fix!.color]: issue.fix!.value } })); };
  const fixAll = () => updateTheme((t) => {
    const next = structuredClone(t);
    for (const i of checkTheme(t).errors) if (i.fix) next.colors[i.fix.color] = i.fix.value;
    return next;
  });

  const applyStyle = (theme: StoreTheme, presetId: string, name: string, mode: ApplyMode) => {
    if (mode === "look") {
      updateTheme(() => theme);
      toast.success(`${name} look applied to your draft`, { description: "Your homepage layout is unchanged." });
    } else {
      update((w) => ({ theme, experience: applyLayoutPreset(w.experience, presetId) }), ["theme", "experience"], 300);
      toast.success(`${name} applied to your draft`, { description: "Look, homepage and menu. Your photos, story and reviews carried over — refine anything, then publish." });
    }
  };

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
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><div className="grid gap-6 lg:grid-cols-[440px_1fr]"><Skeleton className="h-[640px]" /><Skeleton className="h-[640px]" /></div></div>;
  }
  if (state.error || !state.data || !working) return <ErrorState description={errorMessage(state.error)} onRetry={() => void state.refetch()} />;

  const data = state.data;
  const unpublished = !same(working.theme, data.published) || !same(working.experience, data.experience.published);
  const errors = themeCheck.errors.length + experienceCheck.errors.length;
  const status = saving === "saving" ? "Saving draft…" : saving === "pending" ? "Unsaved changes…" : saving === "error" ? "Draft not saved" : unpublished ? "Draft saved · not live yet" : "Everything is live";
  const preset = working.theme.presetId ? presetById(working.theme.presetId) : null;
  const layoutName = working.experience.layoutPresetId ? presetById(working.experience.layoutPresetId)?.name : null;
  const builderData: BuilderData = { products: products.data ?? [], categories: categories.data ?? [], media: mediaMap };

  return (
    <>
      <PageHeader title="Appearance" description="Your storefront's look, homepage and menu. Changes are saved as a draft and go live when you publish."
        actions={canEdit ? (
          <>
            <span className="text-sm text-muted" role="status" aria-live="polite">{status}</span>
            <Button variant="outline" disabled={!unpublished || discard.isPending} onClick={() => setConfirmDiscard(true)}>Discard changes</Button>
            <Button disabled={!unpublished || errors > 0} loading={publish.isPending} onClick={() => publish.mutate(working)}>Publish</Button>
          </>
        ) : undefined} />

      {!canEdit && <Alert tone="info" className="mb-4" title="View only">Only the restaurant owner can change the store&apos;s look.</Alert>}
      {themeCheck.errors.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`Fix ${themeCheck.errors.length} readability issue${themeCheck.errors.length === 1 ? "" : "s"} before publishing`}
          action={canEdit ? <Button size="sm" variant="outline" onClick={fixAll}>Fix all</Button> : undefined}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {themeCheck.errors.map((e) => <li key={e.key}>{e.message} <span className="text-muted">({e.ratio}:1, needs {e.required}:1)</span></li>)}
          </ul>
        </Alert>
      )}
      {experienceCheck.errors.length > 0 && (
        <Alert tone="danger" className="mb-4" title="Describe your homepage photos before publishing">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {experienceCheck.errors.map((e) => (
              <li key={e.key}>{e.message} {e.sectionId && <button type="button" className="font-medium underline" onClick={() => { setTab("homepage"); setSelectedSection(e.sectionId); }}>Open</button>}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-3 text-sm text-muted">
            Style: <span className="font-medium text-text">{preset ? preset.name : "Custom"}</span>
            {preset && !same(working.theme, preset.theme) && " (customised)"}
            {layoutName && layoutName !== preset?.name && <> · layout from {layoutName}</>}
            {data.publishedAt && <> · live since <DateTime iso={data.publishedAt} options={{ dateStyle: "medium" }} /></>}
          </p>
          <Tabs value={tab} onValueChange={setTab} className="mb-4" items={[
            { value: "styles", label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-4" aria-hidden />Styles</span> },
            { value: "design", label: <span className="inline-flex items-center gap-1.5"><Palette className="size-4" aria-hidden />Design</span> },
            { value: "homepage", label: <span className="inline-flex items-center gap-1.5"><LayoutTemplate className="size-4" aria-hidden />Homepage</span>, count: experienceCheck.warnings.filter((w) => w.sectionId).length || undefined },
            { value: "photos", label: <span className="inline-flex items-center gap-1.5"><ImageIcon className="size-4" aria-hidden />Photos</span> },
            { value: "menu", label: <span className="inline-flex items-center gap-1.5"><ListTree className="size-4" aria-hidden />Menu</span> },
            { value: "seo", label: <span className="inline-flex items-center gap-1.5"><Search className="size-4" aria-hidden />Search</span> },
            { value: "history", label: <span className="inline-flex items-center gap-1.5"><History className="size-4" aria-hidden />History</span> },
          ]} />
          <fieldset disabled={!canEdit} className="min-w-0 space-y-3">
            {tab === "styles" && (
              <PresetGallery current={working.theme} layoutPresetId={working.experience.layoutPresetId} brandColor={data.published.colors.primary} keepBrandColor={keepBrand}
                onKeepBrandColor={setKeepBrand} content={content} disabled={!canEdit}
                onApply={(theme, p, mode) => applyStyle(theme, p.id, p.name, mode)} />
            )}
            {tab === "design" && <ThemeControls theme={working.theme} update={updateTheme} issues={themeCheck.errors} onFix={fix} />}
            {tab === "homepage" && (
              <>
                <LayoutPanel experience={working.experience} update={updateExperience} />
                <SectionsPanel experience={working.experience} update={updateExperience} data={builderData}
                  issues={[...experienceCheck.errors, ...experienceCheck.warnings]} selected={selectedSection} onSelect={setSelectedSection} />
                {experienceCheck.warnings.filter((w) => !w.sectionId).map((w) => <Alert key={w.key} tone="warning">{w.message}</Alert>)}
              </>
            )}
            {tab === "photos" && <MediaLibraryPanel />}
            {tab === "menu" && <MenuPanel experience={working.experience} update={updateExperience} theme={working.theme} updateTheme={updateTheme} />}
            {tab === "seo" && <SeoPanel experience={working.experience} update={updateExperience} media={mediaMap} storeName={settings.data?.brand.name ?? "Your restaurant"} />}
          </fieldset>
          {tab === "history" && (
            data.versions.length === 0
              ? <EmptyState title="Nothing published yet" description="Each time you publish, the look and layout are saved here together so you can go back to them." />
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
          <LivePreview theme={working.theme} refreshKey={refreshKey} focusSectionId={tab === "homepage" ? selectedSection : null} />
          {tab === "styles" && preset && <p className="mt-2 text-xs text-muted">{presetDesign(preset.id).personality}.</p>}
        </div>
      </div>

      <ConfirmDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Discard your changes?" description="Your draft goes back to the look and layout customers see now."
        confirmLabel="Discard" tone="danger" loading={discard.isPending} onConfirm={() => discard.mutate()} />
      <ConfirmDialog open={!!restoreId} onOpenChange={(o) => !o && setRestoreId(null)} title="Restore this version?" description="Its look and homepage go live for customers straight away. Your current version stays in the history."
        confirmLabel="Restore and publish" loading={restore.isPending} onConfirm={() => restoreId && restore.mutate(restoreId)} />
    </>
  );
}
