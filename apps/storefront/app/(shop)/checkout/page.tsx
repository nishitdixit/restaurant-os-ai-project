import type { Metadata } from "next";
import { getConfig } from "@/lib/store";
import { CheckoutClient } from "./checkout-client";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const config = await getConfig();
  return <CheckoutClient config={config} />;
}
