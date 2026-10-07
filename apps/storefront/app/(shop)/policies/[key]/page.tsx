// Policy pages (refund, terms, privacy, delivery): plain text the restaurant writes in Settings → Policies.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PolicyKey, PolicyPage } from "@restaurant-os/types";
import { formatDateTime } from "@restaurant-os/ui";
import { serverGet } from "@/lib/api";
import { localized, paragraphs } from "@/lib/experience";
import { getConfig, previewQuery, storeSlug } from "@/lib/store";

const KEYS: PolicyKey[] = ["refund", "terms", "privacy", "delivery"];
type Params = { params: Promise<{ key: string }> };

async function load(key: string) {
  if (!KEYS.includes(key as PolicyKey)) return null;
  const [slug, pq] = await Promise.all([storeSlug(), previewQuery()]);
  return serverGet<PolicyPage>(`/v1/storefront/${slug}/policies/${key}${pq}`, pq ? 0 : 300);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { key } = await params;
  const [page, config] = await Promise.all([load(key), getConfig()]);
  if (!page) return { title: "Not found", robots: { index: false } };
  return { title: page.title, description: `${page.title} for ordering from ${config.name}.`, alternates: { canonical: `/policies/${key}` } };
}

export default async function PolicyPageView({ params }: Params) {
  const { key } = await params;
  const [page, config] = await Promise.all([load(key), getConfig()]);
  if (!page) notFound();
  const body = localized(config, page.body);
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-2xl ros-heading">{page.title}</h1>
      {page.updatedAt && <p className="mt-1 text-sm text-muted">Last updated {formatDateTime(page.updatedAt, { dateStyle: "medium" })}</p>}
      <div className="mt-6 space-y-4 leading-relaxed">
        {paragraphs(body.primary).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
      </div>
      <p className="mt-10 text-sm text-muted">{config.name}{config.credentials.legalName ? ` · ${config.credentials.legalName}` : ""}{config.outlet?.phone ? ` · ${config.outlet.phone}` : ""}</p>
    </article>
  );
}
