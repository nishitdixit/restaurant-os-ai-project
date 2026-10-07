import type { ReactNode } from "react";

/** Inner pages share the store's content width; the homepage composes its own full-width sections. */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return <div className="ros-container pb-16 pt-6">{children}</div>;
}
