"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ErrorState, Skeleton } from "@restaurant-os/ui";
import { AppShell } from "@/components/shell";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, loading, error, refresh } = useSession();
  const router = useRouter();
  const needsOnboarding = !!session && session.memberships.length === 0;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (loading || needsOnboarding) {
    return <div className="flex min-h-dvh"><div className="hidden w-60 border-r border-border bg-surface lg:block" /><div className="flex-1 space-y-4 p-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div></div>;
  }
  if (error || !session) {
    const e = error instanceof ApiError ? error : null;
    return (
      <div className="mx-auto max-w-lg p-6 pt-20">
        <ErrorState title={e?.status === 0 ? "Can't reach the Restaurant OS server" : "We couldn't load your account"} description={e?.message} requestId={e?.requestId} onRetry={() => void refresh()} />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
