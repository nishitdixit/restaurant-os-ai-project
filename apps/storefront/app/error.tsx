"use client";
import { ErrorState } from "@restaurant-os/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <ErrorState title="This page didn't load" description="It's probably a temporary problem. Please try again." onRetry={reset} requestId={error.digest ?? null} />
    </div>
  );
}
