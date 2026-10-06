"use client";
// Menu management (PRD 5.3, docs/CATALOG.md "Catalog UX"): search/filter, bulk stock and publish
// actions, inline availability, reordering, categories and option groups.
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, ImageOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { AdminCategory, AdminModifierGroup, AdminProduct } from "@restaurant-os/types";
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusPill, Switch, Tabs, Textarea,
  buttonClass, cx, formatMoney, toast,
} from "@restaurant-os/ui";
import { ApiError, errorMessage, fromMinor, toMinor } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

function useCatalog() {
  const { request } = useSession();
  const categories = useQuery({ queryKey: useTenantKey("categories"), queryFn: () => request<{ items: AdminCategory[] }>("/v1/admin/categories").then((r) => r.items) });
  const products = useQuery({ queryKey: useTenantKey("products"), queryFn: () => request<{ items: AdminProduct[] }>("/v1/admin/products?status=all").then((r) => r.items) });
  const groups = useQuery({ queryKey: useTenantKey("modifier-groups"), queryFn: () => request<{ items: AdminModifierGroup[] }>("/v1/admin/modifier-groups").then((r) => r.items) });
  return { categories, products, groups };
}

function StockDialog({ products, open, onOpenChange, onConfirm, pending }: { products: AdminProduct[]; open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: string, until: string | null) => void; pending: boolean }) {
  const [reason, setReason] = useState("Sold out for today");
  const [until, setUntil] = useState<"none" | "tomorrow">("none");
  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} title={`Mark ${products.length === 1 ? products[0]!.name : `${products.length} items`} out of stock?`}
      description="Customers see it as unavailable immediately and can't order it." confirmLabel="Mark out of stock" loading={pending}
      onConfirm={() => {
        let iso: string | null = null;
        if (until === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(6, 0, 0, 0); iso = d.toISOString(); }
        onConfirm(reason, iso);
      }}>
      <div className="space-y-4">
        <Field label="Reason shown to customers">{(p) => <Input {...p} value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />}</Field>
        <Field label="Back in stock">{(p) => (
          <Select {...p} value={until} onChange={(e) => setUntil(e.target.value as typeof until)}>
            <option value="none">When I turn it back on</option>
            <option value="tomorrow">Automatically tomorrow at 6 am</option>
          </Select>
        )}</Field>
      </div>
    </ConfirmDialog>
  );
}

function ItemsTab() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const productsKey = useTenantKey("products");
  const { categories, products } = useCatalog();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [stock, setStock] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stockTarget, setStockTarget] = useState<AdminProduct[] | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: productsKey });
  const availability = useMutation({
    mutationFn: (body: { productIds: string[]; available: boolean; reason: string; until?: string | null }) => request<{ updated: number }>("/v1/admin/products/availability", { body }),
    onSuccess: (r, v) => { invalidate(); setStockTarget(null); setSelected(new Set()); toast.success(`${r.updated} item${r.updated === 1 ? "" : "s"} ${v.available ? "back in stock" : "marked out of stock"}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setStatusMutation = useMutation({
    mutationFn: (body: { productIds: string[]; status: "DRAFT" | "ACTIVE" | "ARCHIVED" }) => request<{ updated: number }>("/v1/admin/products/status", { body }),
    onSuccess: (r, v) => { invalidate(); setSelected(new Set()); toast.success(`${r.updated} item${r.updated === 1 ? "" : "s"} ${v.status === "ACTIVE" ? "published" : v.status === "DRAFT" ? "moved to draft" : "archived"}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => request<{ id: string }>(`/v1/admin/products/${id}/duplicate`, { method: "POST" }),
    onSuccess: (r) => { invalidate(); router.push(`/catalog/${r.id}`); toast.success("Copy created as a draft"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => request("/v1/admin/products/reorder", { body: { ids } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = useMemo(() => (products.data ?? []).filter((p) =>
    (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (!category || p.categoryId === category) && (!status || p.status === status) &&
    (!stock || (stock === "out" ? !p.available : p.available)) && p.status !== "ARCHIVED"), [products.data, q, category, status, stock]);

  if (products.isLoading || categories.isLoading) return <Skeleton className="h-96" />;
  if (products.error) return <ErrorState description={errorMessage(products.error)} onRetry={() => void products.refetch()} />;
  if (!categories.data?.length) {
    return <EmptyState title="Start with a category" description="Group your dishes, e.g. Biryani, Curries, Breads. Then add items to each." action={<Link href="/catalog?tab=categories" className={buttonClass("primary")}>Add a category</Link>} />;
  }
  if (!(products.data ?? []).filter((p) => p.status !== "ARCHIVED").length) {
    return <EmptyState title="No menu items yet" description="Add your first dish with its price, photo and options." action={<Link href="/catalog/new" className={buttonClass("primary")}>Add item</Link>} />;
  }
  const chosen = rows.filter((r) => selected.has(r.id));
  const moveWithinCategory = (p: AdminProduct, dir: -1 | 1) => {
    const siblings = (products.data ?? []).filter((x) => x.categoryId === p.categoryId && x.status !== "ARCHIVED");
    const i = siblings.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };
  const canManage = can("catalog.manage");
  const canStock = can("availability.manage");

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" aria-label="Search items" className="pl-9" />
        </div>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto"><option value="">All categories</option>{categories.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto"><option value="">Any status</option><option value="ACTIVE">Published</option><option value="DRAFT">Draft</option></Select>
        <Select aria-label="Stock" value={stock} onChange={(e) => setStock(e.target.value)} className="w-auto"><option value="">Any stock</option><option value="in">In stock</option><option value="out">Out of stock</option></Select>
      </div>
      {chosen.length > 0 && (
        <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--ros-radius-md)] border border-primary/30 bg-primary-soft p-2.5" role="region" aria-label="Bulk actions">
          <span className="px-1 text-sm font-medium">{chosen.length} selected</span>
          {canStock && <Button size="sm" variant="outline" onClick={() => setStockTarget(chosen)}>Mark out of stock</Button>}
          {canStock && <Button size="sm" variant="outline" onClick={() => availability.mutate({ productIds: chosen.map((c) => c.id), available: true, reason: "" })}>Back in stock</Button>}
          {canManage && <Button size="sm" variant="outline" onClick={() => setStatusMutation.mutate({ productIds: chosen.map((c) => c.id), status: "ACTIVE" })}>Publish</Button>}
          {canManage && <Button size="sm" variant="outline" onClick={() => setStatusMutation.mutate({ productIds: chosen.map((c) => c.id), status: "DRAFT" })}>Unpublish</Button>}
          {canManage && <Button size="sm" variant="ghost" className="text-danger" onClick={() => setStatusMutation.mutate({ productIds: chosen.map((c) => c.id), status: "ARCHIVED" })}>Archive</Button>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
      <DataTable rows={rows} rowKey={(p) => p.id} caption="Menu items" selection={canManage || canStock ? { selected, onChange: setSelected } : undefined}
        onRowClick={canManage ? (p) => router.push(`/catalog/${p.id}`) : undefined}
        empty={<EmptyState title="No items match these filters" />}
        columns={[
          { key: "img", header: <span className="sr-only">Photo</span>, className: "w-14", hideOnMobile: true, cell: (p) => p.imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.imageUrl} alt="" className="size-10 rounded-md object-cover" />
            : <span className="flex size-10 items-center justify-center rounded-md bg-subtle text-faint"><ImageOff className="size-4" aria-hidden /></span> },
          { key: "name", header: "Item", cell: (p) => <span className="font-medium">{p.name}<span className="block text-xs font-normal text-muted">{p.categoryName}{p.modifierGroupIds.length ? " · options" : ""}</span></span> },
          { key: "price", header: "Price", align: "right", cell: (p) => formatMoney(p.basePriceMinor, p.currency) },
          { key: "status", header: "Status", cell: (p) => <StatusPill kind="publish" status={p.status} /> },
          { key: "stock", header: "In stock", cell: (p) => (
            <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch size="sm" checked={p.available} disabled={!canStock || availability.isPending} ariaLabel={`${p.name} in stock`}
                onCheckedChange={(v) => (v ? availability.mutate({ productIds: [p.id], available: true, reason: "" }) : setStockTarget([p]))} />
              {!p.available && <span className="max-w-32 truncate text-xs text-muted" title={p.unavailableReason ?? ""}>{p.unavailableUntil ? "until tomorrow" : p.unavailableReason}</span>}
            </span>
          ) },
          { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", cell: (p) => canManage && (
            <span className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
              <button className="rounded p-1.5 text-muted hover:bg-subtle hover:text-text" aria-label={`Move ${p.name} up`} onClick={() => moveWithinCategory(p, -1)}><ArrowUp className="size-4" /></button>
              <button className="rounded p-1.5 text-muted hover:bg-subtle hover:text-text" aria-label={`Move ${p.name} down`} onClick={() => moveWithinCategory(p, 1)}><ArrowDown className="size-4" /></button>
              <button className="rounded p-1.5 text-muted hover:bg-subtle hover:text-text" aria-label={`Duplicate ${p.name}`} onClick={() => duplicate.mutate(p.id)}><Copy className="size-4" /></button>
              <Link href={`/catalog/${p.id}`} className="rounded p-1.5 text-muted hover:bg-subtle hover:text-text" aria-label={`Edit ${p.name}`}><Pencil className="size-4" /></Link>
            </span>
          ) },
        ]} />
      {stockTarget && <StockDialog products={stockTarget} open onOpenChange={(o) => !o && setStockTarget(null)} pending={availability.isPending}
        onConfirm={(reason, until) => availability.mutate({ productIds: stockTarget.map((p) => p.id), available: false, reason, until })} />}
    </>
  );
}

function CategoriesTab() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("categories");
  const { categories } = useCatalog();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", status: "ACTIVE" as "ACTIVE" | "INACTIVE" });
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const invalidate = () => { void qc.invalidateQueries({ queryKey: key }); };
  const save = useMutation({
    mutationFn: () => editing === "new" ? request("/v1/admin/categories", { body: form }) : request(`/v1/admin/categories/${(editing as AdminCategory).id}`, { method: "PUT", body: form }),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Category saved"); },
    onError: (e) => setError(e instanceof ApiError ? (e.fields.name ?? e.message) : errorMessage(e)),
  });
  const reorder = useMutation({ mutationFn: (ids: string[]) => request("/v1/admin/categories/reorder", { body: { ids } }), onSuccess: invalidate });
  const remove = useMutation({
    mutationFn: (id: string) => request(`/v1/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setDeleting(null); toast.success("Category removed"); },
    onError: (e) => { setDeleting(null); toast.error(errorMessage(e)); },
  });
  const open = (c: AdminCategory | "new") => {
    setEditing(c);
    setError(null);
    setForm(c === "new" ? { name: "", description: "", status: "ACTIVE" } : { name: c.name, description: c.description, status: c.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" });
  };
  if (categories.isLoading) return <Skeleton className="h-64" />;
  const list = categories.data ?? [];
  const move = (i: number, dir: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };
  return (
    <>
      {can("catalog.manage") && <div className="mb-3 flex justify-end"><Button icon={<Plus className="size-4" />} onClick={() => open("new")}>Add category</Button></div>}
      {list.length === 0 ? <EmptyState title="No categories yet" description="Categories organise your menu and get their own page for search engines." /> : (
        <Card padded={false}>
          <ul className="divide-y divide-border">
            {list.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name} {c.status === "INACTIVE" && <Badge>Hidden</Badge>}</p>
                  <p className="text-sm text-muted">{c.productCount} item{c.productCount === 1 ? "" : "s"} · /{c.slug}</p>
                </div>
                {can("catalog.manage") && <>
                  <button className="rounded p-1.5 text-muted hover:bg-subtle" aria-label={`Move ${c.name} up`} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></button>
                  <button className="rounded p-1.5 text-muted hover:bg-subtle" aria-label={`Move ${c.name} down`} onClick={() => move(i, 1)} disabled={i === list.length - 1}><ArrowDown className="size-4" /></button>
                  <Button size="sm" variant="ghost" onClick={() => open(c)}>Edit</Button>
                  <button className="rounded p-1.5 text-muted hover:bg-subtle hover:text-danger" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}><Trash2 className="size-4" /></button>
                </>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Add category" : "Edit category"} size="sm"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name" required error={error}>{(p) => <Input {...p} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Description" hint="Shown on the category page">{(p) => <Textarea {...p} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <Switch checked={form.status === "ACTIVE"} onCheckedChange={(v) => setForm({ ...form, status: v ? "ACTIVE" : "INACTIVE" })} label="Visible on the storefront" />
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete ${deleting?.name}?`} tone="danger" confirmLabel="Delete"
        description="Only empty categories can be deleted. Move or archive its items first." loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

type OptionRow = { id?: string; name: string; price: string; active: boolean };

function GroupEditor({ group, onClose }: { group: AdminModifierGroup | null; onClose: () => void }) {
  const { request } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("modifier-groups");
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [required, setRequired] = useState((group?.minSelections ?? 0) > 0);
  const [max, setMax] = useState(String(group?.maxSelections ?? 1));
  const [options, setOptions] = useState<OptionRow[]>(group?.modifiers.map((m) => ({ id: m.id, name: m.name, price: fromMinor(m.priceDeltaMinor), active: m.active })) ?? [{ name: "", price: "0", active: true }]);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: unknown) => group ? request(`/v1/admin/modifier-groups/${group.id}`, { method: "PUT", body }) : request("/v1/admin/modifier-groups", { body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); toast.success("Option group saved"); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = () => {
    const modifiers = options.filter((o) => o.name.trim()).map((o) => {
      const negative = o.price.trim().startsWith("-");
      const minor = toMinor(o.price.replace("-", "") || "0");
      return { id: o.id, name: o.name.trim(), priceDeltaMinor: minor === null ? NaN : negative ? -minor : minor, active: o.active };
    });
    if (!name.trim()) return setError("Give the group a name, e.g. “Portion” or “Add-ons”.");
    if (!modifiers.length) return setError("Add at least one option.");
    if (modifiers.some((m) => Number.isNaN(m.priceDeltaMinor))) return setError("Prices must be numbers like 30 or 12.50.");
    const maxSelections = Math.max(1, Number(max) || 1);
    save.mutate({ name: name.trim(), description, minSelections: required ? 1 : 0, maxSelections, modifiers });
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={group ? "Edit option group" : "New option group"} description="E.g. Portion (choose 1, required) or Add-ons (up to 3, optional)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Group name" required>{(p) => <Input {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Description (optional)">{(p) => <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Switch checked={required} onCheckedChange={setRequired} label="Customer must choose" description="At least one option is required" />
          <Field label="Customer can choose up to">{(p) => <Input {...p} type="number" min={1} max={20} value={max} onChange={(e) => setMax(e.target.value)} />}</Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Options</legend>
          <ul className="mt-2 space-y-2">
            {options.map((o, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input aria-label={`Option ${i + 1} name`} placeholder="Option name" value={o.name} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input aria-label={`Option ${i + 1} extra price`} prefix="₹" className="w-32" inputMode="decimal" value={o.price} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                <Switch size="sm" checked={o.active} onCheckedChange={(v) => setOptions(options.map((x, j) => (j === i ? { ...x, active: v } : x)))} ariaLabel={`Option ${i + 1} available`} />
                <button className="rounded p-1.5 text-muted hover:bg-subtle hover:text-danger" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setOptions([...options, { name: "", price: "0", active: true }])}>Add option</Button>
          <p className="mt-1 text-xs text-muted">Price is added to the item price (use 0 for no change). Switch off an option to show it as unavailable.</p>
        </fieldset>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

function OptionsTab() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const { groups } = useCatalog();
  const [editing, setEditing] = useState<AdminModifierGroup | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminModifierGroup | null>(null);
  const key = useTenantKey("modifier-groups");
  const remove = useMutation({
    mutationFn: (id: string) => request(`/v1/admin/modifier-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); setDeleting(null); toast.success("Option group removed"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (groups.isLoading) return <Skeleton className="h-64" />;
  const list = groups.data ?? [];
  return (
    <>
      {can("catalog.manage") && <div className="mb-3 flex justify-end"><Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New option group</Button></div>}
      {list.length === 0 ? <EmptyState title="No option groups yet" description="Create choices like portion size or add-ons once, then attach them to any item." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((g) => (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-sm text-muted">{g.minSelections > 0 ? "Required" : "Optional"} · up to {g.maxSelections} · used by {g.productCount} item{g.productCount === 1 ? "" : "s"}</p>
                </div>
                {can("catalog.manage") && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Edit</Button>
                  <button className="rounded p-1.5 text-muted hover:bg-subtle hover:text-danger" aria-label={`Delete ${g.name}`} onClick={() => setDeleting(g)}><Trash2 className="size-4" /></button></div>}
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {g.modifiers.map((m) => <li key={m.id}><Badge tone={m.active ? "neutral" : "warning"}>{m.name}{m.priceDeltaMinor ? ` +${formatMoney(m.priceDeltaMinor)}` : ""}{!m.active && " (off)"}</Badge></li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {editing && <GroupEditor group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete ${deleting?.name}?`} tone="danger" confirmLabel="Delete"
        description={`It will be removed from ${deleting?.productCount ?? 0} item(s). Past orders keep their choices.`} loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

function CatalogInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const tab = params.get("tab") ?? "items";
  return (
    <>
      <PageHeader title="Menu" description="Changes go live on your storefront immediately."
        actions={can("catalog.manage") && tab === "items" ? <Link href="/catalog/new" className={buttonClass("primary")}><Plus className="size-4" aria-hidden />Add item</Link> : undefined} />
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "items" ? "/catalog" : `/catalog?tab=${v}`)} className="mb-4"
        items={[{ value: "items", label: "Items" }, { value: "categories", label: "Categories" }, { value: "options", label: "Option groups" }]} />
      <div className={cx(tab !== "items" && "max-w-4xl")}>
        {tab === "items" && <ItemsTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "options" && <OptionsTab />}
      </div>
    </>
  );
}

export default function CatalogPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><CatalogInner /></Suspense>;
}
