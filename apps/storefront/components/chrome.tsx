// Site header and footer (server components).
import Link from "next/link";
import Image from "next/image";
import type { StoreConfig } from "@restaurant-os/types";
import { MapPin, Phone } from "lucide-react";
import { buttonClass } from "@restaurant-os/ui";
import { mapsUrl, whatsappUrl } from "@/lib/store";
import { CartButton } from "./cart-ui";

const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/offers", label: "Offers" },
  { href: "/delivery-areas", label: "Delivery areas" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ config }: { config: StoreConfig }) {
  return (
    <header className="sticky top-0 z-30 border-b border-header-border bg-header/95 text-header-fg backdrop-blur supports-[backdrop-filter]:bg-header/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${config.name} home`}>
          {config.logoUrl
            ? <Image src={config.logoUrl} alt="" width={36} height={36} className="size-9 rounded-chip object-cover" priority />
            : <span aria-hidden className="flex size-9 items-center justify-center rounded-chip bg-accent text-sm font-bold text-accent-contrast">{config.name.slice(0, 1)}</span>}
          <span className="ros-heading truncate text-lg">{config.name}</span>
        </Link>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => <Link key={item.href} href={item.href} className="rounded-button px-3 py-2 text-sm font-medium text-header-muted hover:bg-header-chip hover:text-header-fg">{item.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <Link href="/search" className="rounded-button px-3 py-2 text-sm font-medium text-header-muted hover:bg-header-chip hover:text-header-fg md:hidden">Search</Link>
          <CartButton />
        </div>
      </div>
      <nav aria-label="Sections" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {NAV.map((item) => <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-chip bg-header-chip px-3 py-1.5 text-sm font-medium text-header-fg">{item.label}</Link>)}
      </nav>
    </header>
  );
}

export function SiteFooter({ config }: { config: StoreConfig }) {
  const o = config.outlet;
  const wa = whatsappUrl(config.links.whatsapp);
  const maps = mapsUrl(config);
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="ros-heading text-lg">{config.name}</p>
          {config.tagline && <p className="mt-1 text-sm text-muted">{config.tagline}</p>}
          <Link href="/menu" className={buttonClass("primary", "md", "mt-4")}>Order direct</Link>
        </div>
        <div className="text-sm">
          <p className="font-semibold">Visit or call</p>
          {o && (
            <address className="mt-2 not-italic text-muted">
              {[o.address.line1, o.address.line2, o.address.city, o.address.postalCode].filter(Boolean).join(", ")}
            </address>
          )}
          <ul className="mt-3 space-y-2">
            {o?.phone && <li><a href={`tel:${o.phone}`} className="inline-flex items-center gap-2 hover:underline"><Phone className="size-4" aria-hidden />{o.phone}</a></li>}
            {maps && <li><a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:underline"><MapPin className="size-4" aria-hidden />Get directions</a></li>}
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:underline">Chat on WhatsApp</a></li>}
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-semibold">Explore</p>
          <ul className="mt-2 space-y-2 text-muted">
            <li><Link href="/menu" className="hover:text-text">Full menu</Link></li>
            <li><Link href="/offers" className="hover:text-text">Offers</Link></li>
            <li><Link href="/delivery-areas" className="hover:text-text">Where we deliver</Link></li>
            <li><Link href="/contact" className="hover:text-text">Contact &amp; hours</Link></li>
            {config.links.swiggy && <li><a href={config.links.swiggy} target="_blank" rel="noopener noreferrer" className="hover:text-text">Also on Swiggy</a></li>}
            {config.links.zomato && <li><a href={config.links.zomato} target="_blank" rel="noopener noreferrer" className="hover:text-text">Also on Zomato</a></li>}
            {config.links.instagram && <li><a href={config.links.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-text">Instagram</a></li>}
          </ul>
        </div>
      </div>
      <p className="border-t border-border py-4 text-center text-xs text-faint">© {new Date().getFullYear()} {config.name}. Ordering powered by Restaurant OS.</p>
    </footer>
  );
}
