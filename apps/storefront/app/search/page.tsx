import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@restaurant-os/ui";
import { SearchClient } from "./search-client";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true }, alternates: { canonical: "/search" } };

export default function SearchPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-12 max-w-2xl" />}>
      <SearchClient />
    </Suspense>
  );
}
