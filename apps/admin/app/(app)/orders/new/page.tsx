"use client";
import { EmptyState } from "@restaurant-os/ui";
import { NewOrder } from "@/components/new-order";
import { useSession } from "@/lib/session";

export default function NewOrderPage() {
  const { can } = useSession();
  if (!can("order.create")) return <EmptyState title="You can't enter orders" description="Ask the restaurant owner to give your role access to new orders." />;
  return <NewOrder />;
}
