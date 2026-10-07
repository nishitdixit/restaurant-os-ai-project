"use client";
// Policy pages (ADR-013 "Trust"): refund/cancellation, terms, privacy and delivery, written by the restaurant and
// shown at /policies/{key} and in the footer. Starting templates are provided; the restaurant is responsible for
// the final wording.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Alert, Button, Card, ErrorState, Field, Skeleton, Textarea, toast } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { useSession, useTenantKey } from "@/lib/session";

type Key = "refund" | "terms" | "privacy" | "delivery";
type Policies = Record<Key, { body: { en: string; hi: string }; updatedAt: string | null }>;

const META: Record<Key, { title: string; template: (name: string) => string }> = {
  refund: {
    title: "Cancellation & refund policy",
    template: (n) => `You can cancel your order before ${n} accepts it for a full refund.\n\nOnce your order is being prepared it can't be cancelled. If something is wrong with your order, contact us within 2 hours of delivery and we'll make it right — with a replacement or a refund.\n\nRefunds go back to your original payment method and usually reach you in 5–7 working days.`,
  },
  terms: {
    title: "Terms & conditions",
    template: (n) => `These terms apply to orders placed on this website with ${n}.\n\nPrices include applicable taxes and are confirmed at checkout. We may decline or cancel an order if an item is unavailable or your address is outside our delivery area; any payment is then refunded in full.\n\nDelivery times are estimates. Please check allergens with us before ordering if you have an allergy.`,
  },
  privacy: {
    title: "Privacy policy",
    template: (n) => `${n} uses your name, phone number, email and address only to prepare, deliver and update you about your order, and — only if you agree at checkout — to send you offers.\n\nWe don't sell your information. You can ask us to see, correct or delete your details at any time by contacting us.\n\nPayments are processed by our payment provider; we never see or store your card details.`,
  },
  delivery: {
    title: "Delivery policy",
    template: () => `We deliver to the areas listed on our “Where we deliver” page. The delivery fee, minimum order and estimated time for your area are shown before you pay.\n\nIf you're not available when your order arrives, our rider will call you. Orders that can't be delivered because of an incorrect address may not be refundable.`,
  },
};

export default function PoliciesPage() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("policies");
  const settings = useSettings();
  const query = useQuery({ queryKey: key, queryFn: () => request<{ policies: Policies }>("/v1/admin/settings/policies").then((r) => r.policies) });
  const [draft, setDraft] = useState<Policies | null>(null);
  useEffect(() => { if (query.data && !draft) setDraft(query.data); }, [query.data, draft]);
  const save = useMutation({
    mutationFn: (policies: Policies) => request("/v1/admin/settings/policies", { method: "PUT", body: { policies: Object.fromEntries(Object.entries(policies).map(([k, v]) => [k, { body: v.body }])) } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); toast.success("Policies saved"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (query.isLoading || (!draft && !query.error)) return <Skeleton className="h-96" />;
  if (query.error || !draft) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const canEdit = can("tenant.manage");
  const name = settings.data?.brand.name ?? "We";
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Customers and payment providers look for these pages">
        Each policy you write appears in your storefront footer. Templates are a starting point — read them and adapt them to how your restaurant works.
      </Alert>
      {(Object.keys(META) as Key[]).map((k) => (
        <Card key={k}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><FileText className="size-4 text-muted" aria-hidden />{META[k].title}</h2>
            {canEdit && !draft[k].body.en && <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, [k]: { ...draft[k], body: { ...draft[k].body, en: META[k].template(name) } } })}>Start from a template</Button>}
          </div>
          <Field label="Text" hint={draft[k].body.en ? "Leave a blank line between paragraphs." : "Empty policies aren't shown on your storefront."}>
            {(p) => <Textarea {...p} rows={draft[k].body.en ? 8 : 3} disabled={!canEdit} maxLength={20000} value={draft[k].body.en}
              onChange={(e) => setDraft({ ...draft, [k]: { ...draft[k], body: { ...draft[k].body, en: e.target.value } } })} />}
          </Field>
        </Card>
      ))}
      {canEdit && <div className="flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate(draft)}>Save policies</Button></div>}
    </div>
  );
}
