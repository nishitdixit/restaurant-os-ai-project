import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "lucide-react";
import type { PublicOffer } from "@restaurant-os/types";
import { EmptyState, buttonClass, formatDateTime } from "@restaurant-os/ui";
import { serverGet } from "@/lib/api";
import { getConfig, previewQuery, storeSlug } from "@/lib/store";
import { CopyCode } from "./copy-code";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  return { title: "Offers", description: `Current offers when you order direct from ${config.name}.`, alternates: { canonical: "/offers" } };
}

export default async function OffersPage() {
  const [slug, pq] = await Promise.all([storeSlug(), previewQuery()]);
  const offers = (await serverGet<{ items: PublicOffer[] }>(`/v1/storefront/${slug}/offers${pq}`, 60))?.items ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Offers</h1>
      <p className="mt-1 text-muted">Apply a code at checkout. Offers are only available when you order direct.</p>
      {offers.length === 0 ? (
        <EmptyState className="mt-6" icon={<Tag className="size-6" />} title="No offers right now" description="Check back soon — or order now from the menu."
          action={<Link href="/menu" className={buttonClass("primary")}>See the menu</Link>} />
      ) : (
        <ul className="mt-6 space-y-3">
          {offers.map((o) => (
            <li key={o.code} className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-dashed border-primary/40 bg-surface p-5">
              <div className="min-w-0">
                <p className="text-lg font-semibold">{o.title}</p>
                <p className="mt-0.5 text-sm text-muted">{o.summary}{o.newCustomerOnly ? " · first order only" : ""}</p>
                {o.description && <p className="mt-1 text-sm text-muted">{o.description}</p>}
                <p className="mt-2 text-xs text-faint">Valid until {formatDateTime(o.endsAt, { dateStyle: "medium" })}</p>
              </div>
              <CopyCode code={o.code} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
