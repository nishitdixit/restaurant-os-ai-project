import Link from "next/link";
import { buttonClass } from "@restaurant-os/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-muted">The dish or page may have moved. The full menu is one tap away.</p>
      <Link href="/menu" className={buttonClass("primary", "lg", "mt-2")}>Go to the menu</Link>
    </div>
  );
}
