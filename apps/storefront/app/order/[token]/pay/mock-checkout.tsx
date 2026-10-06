"use client";
// Test-mode payment page standing in for the provider checkout. The outcome is signed and verified on
// the server exactly like a real provider callback; nothing here marks an order paid by itself.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FlaskConical, ShieldCheck } from "lucide-react";
import type { PublicOrder } from "@restaurant-os/types";
import { Alert, Button, Card, formatMoney } from "@restaurant-os/ui";
import { ApiRequestError, clientRequest } from "@/lib/api";
import { useStore } from "@/components/providers";

export function MockCheckout({ order }: { order: PublicOrder }) {
  const router = useRouter();
  const { slug, name } = useStore();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const complete = async (outcome: "success" | "failed" | "cancelled") => {
    setPending(outcome);
    setError(null);
    try {
      await clientRequest(`/v1/storefront/${slug}/orders/${order.token}/payments/mock-complete`, { body: { outcome } });
      router.replace(`/order/${order.token}${outcome === "success" ? "?paid=1" : ""}`);
    } catch (e) {
      setPending(null);
      setError(e instanceof ApiRequestError ? e.message : "The payment could not be completed. Please try again.");
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="overflow-hidden" padded={false}>
        <div className="flex items-center gap-2 bg-warning-soft px-5 py-2.5 text-sm font-medium text-warning">
          <FlaskConical className="size-4" aria-hidden />Test mode — no real money moves
        </div>
        <div className="p-6">
          <p className="text-sm text-muted">Paying {name}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatMoney(order.totalMinor, order.currency)}</p>
          <p className="mt-1 text-sm text-muted">Order #{order.number} · {order.items.reduce((n, i) => n + i.quantity, 0)} items</p>
          <div className="mt-6 flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3">
            <CreditCard className="size-5 text-muted" aria-hidden />
            <span className="text-sm">UPI, cards and netbanking</span>
          </div>
          {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
          <Button size="lg" block className="mt-6" loading={pending === "success"} disabled={!!pending} onClick={() => void complete("success")}>
            Pay {formatMoney(order.totalMinor, order.currency)}
          </Button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!!pending} loading={pending === "failed"} onClick={() => void complete("failed")}>Simulate failure</Button>
            <Button variant="ghost" disabled={!!pending} loading={pending === "cancelled"} onClick={() => void complete("cancelled")}>Cancel payment</Button>
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-4" aria-hidden />Payment is confirmed by the server, never by this page.</p>
        </div>
      </Card>
    </div>
  );
}
