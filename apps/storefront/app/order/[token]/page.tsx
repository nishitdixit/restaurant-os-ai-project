import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { PublicOrder } from "@restaurant-os/types";
import { serverGet } from "@/lib/api";
import { storeSlug } from "@/lib/store";
import { OrderStatus } from "./order-status";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const slug = await storeSlug();
  const order = await serverGet<PublicOrder>(`/v1/storefront/${slug}/orders/${encodeURIComponent(token)}`, 0);
  if (!order) notFound();
  return <Suspense><OrderStatus initial={order} /></Suspense>;
}
