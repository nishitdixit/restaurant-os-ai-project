"use client";
// Journey B entry: a signed-in user without a restaurant creates one (or is told to ask for an invite).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { slugify } from "@restaurant-os/domain";
import { CreateRestaurantSchema } from "@restaurant-os/types";
import { Alert, Button, Card, Field, Input, Skeleton } from "@restaurant-os/ui";
import { ApiError, STOREFRONT_URL } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function OnboardingPage() {
  const { session, loading, request, refresh, selectTenant } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({ businessName: "", brandName: "", brandSlug: "", phone: "", city: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRestaurant = !!session && session.memberships.length > 0;
  useEffect(() => { if (hasRestaurant) router.replace("/"); }, [hasRestaurant, router]);
  if (loading || hasRestaurant) return <div className="mx-auto max-w-xl p-6"><Skeleton className="h-96" /></div>;

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "brandName" && !slugTouched) next.brandSlug = slugify(value);
      if (key === "businessName" && !f.brandName) next.brandName = value;
      if (key === "businessName" && !f.brandName && !slugTouched) next.brandSlug = slugify(value);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = CreateRestaurantSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await request<{ tenantId: string }>("/v1/restaurants", { body: parsed.data, tenant: null });
      selectTenant(result.tenantId);
      await refresh();
      router.replace("/");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) {
        if (Object.keys(err.fields).length) setErrors(err.fields);
        setError(err.message);
      } else setError("Something went wrong. Please try again.");
    }
  };

  if (session && !session.selfSignupEnabled) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-20">
        <Card>
          <h1 className="text-xl font-semibold">Ask your restaurant owner for an invite</h1>
          <p className="mt-2 text-sm text-muted">Your account isn&apos;t linked to a restaurant yet. Once an owner invites {session.user?.email ?? "your email"}, sign in again.</p>
          <SignOutButton><Button variant="outline" className="mt-4">Sign out</Button></SignOutButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6 pt-12">
      <p className="text-sm font-medium text-primary">Welcome to Restaurant OS</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Set up your restaurant</h1>
      <p className="mt-1 text-muted">Takes a minute. You can change everything later, and nothing is public until you publish.</p>
      <Card className="mt-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Business name" required error={errors.businessName}>{(p) => <Input {...p} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Sharma Foods Pvt Ltd" />}</Field>
          <Field label="Restaurant / brand name" hint="What customers see" required error={errors.brandName}>{(p) => <Input {...p} value={form.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="Sharma's Kitchen" />}</Field>
          <Field label="Web address" hint={`${STOREFRONT_URL.replace(/^https?:\/\//, "")} · ${form.brandSlug || "your-name"}`} required error={errors.brandSlug}>
            {(p) => <Input {...p} value={form.brandSlug} onChange={(e) => { setSlugTouched(true); set("brandSlug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kitchen phone" required error={errors.phone}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />}</Field>
            <Field label="City" required error={errors.city}>{(p) => <Input {...p} value={form.city} onChange={(e) => set("city", e.target.value)} />}</Field>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" size="lg" block loading={submitting}>Create restaurant</Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">Joining an existing restaurant? Ask the owner to invite {session?.user?.email ?? "your email"}.</p>
    </div>
  );
}
