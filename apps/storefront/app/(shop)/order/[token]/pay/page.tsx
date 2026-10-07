import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { PublicOrder } from "@restaurant-os/types";
import { serverGet } from "@/lib/api";
import { storeSlug } from "@/lib/store";
import { MockCheckout } from "./mock-checkout";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const slug = await storeSlug();
  const order = await serverGet<PublicOrder>(`/v1/storefront/${slug}/orders/${encodeURIComponent(token)}`, 0);
  if (!order) notFound();
  if (order.paymentStatus === "CAPTURED" || !order.canRetryPayment) redirect(`/order/${token}`);
  return <MockCheckout order={order} />;
}
