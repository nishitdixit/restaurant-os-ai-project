// Site header and footer (server components). One header row on every screen size (the old second row of section
// links on phones is now the menu sheet), in three styles from the experience: standard · centered · minimal.
import Link from "next/link";
import Image from "next/image";
import type { StoreConfig } from "@restaurant-os/types";
import { MapPin, Phone, Search } from "lucide-react";
import { buttonClass, cx } from "@restaurant-os/ui";
import { hasOtherChannels, whatsappLink } from "@/lib/experience";
import { mapsUrl } from "@/lib/store";
import { CartButton } from "./cart-ui";
import { MobileNav } from "./mobile-nav";
import { OrderChannelsButton, type Channel } from "./order-channels";

const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/offers", label: "Offers" },
  { href: "/delivery-areas", label: "Delivery areas" },
  { href: "/contact", label: "Contact" },
];

/** The restaurant's other ordering channels, for the "More ways to order" sheet. */
export function orderChannels(config: StoreConfig): Channel[] {
  const wa = whatsappLink(config.links.whatsapp, `Hi ${config.name}, I'd like to place an order.`);
  const out: Channel[] = [];
  if (wa) out.push({ kind: "whatsapp", href: wa, detail: "Chat with the restaurant to order" });
  if (config.links.swiggy) out.push({ kind: "swiggy", href: config.links.swiggy, detail: "Order on Swiggy" });
  if (config.links.zomato) out.push({ kind: "zomato", href: config.links.zomato, detail: "Order on Zomato" });
  if (config.outlet?.phone) out.push({ kind: "call", href: `tel:${config.outlet.phone}`, detail: config.outlet.phone });
  return out;
}

function Brand({ config, centered = false }: { config: StoreConfig; centered?: boolean }) {
  return (
    <Link href="/" className={cx("flex min-w-0 items-center gap-2.5", centered && "justify-center")} aria-label={`${config.name} home`}>
      {config.logoUrl
        ? <Image src={config.logoUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-chip object-cover" priority />
        : <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-accent text-sm font-bold text-accent-contrast">{config.name.slice(0, 1)}</span>}
      <span className="ros-heading truncate text-lg">{config.name}</span>
    </Link>
  );
}

export function SiteHeader({ config }: { config: StoreConfig }) {
  const variant = config.experience.site.header;
  const policyLinks = config.policies.map((p) => ({ href: `/policies/${p.key}`, label: p.title }));
  const actions = (
    <div className="flex shrink-0 items-center gap-1.5">
      <Link href="/menu?search=1" aria-label="Find a dish" className="inline-flex size-10 items-center justify-center rounded-button text-header-muted hover:bg-header-chip hover:text-header-fg">
        <Search className="size-5" aria-hidden />
      </Link>
      <CartButton />
      <MobileNav items={NAV} extra={policyLinks} storeName={config.name} channels={config.experience.site.orderChannels ? orderChannels(config) : []} />
    </div>
  );
  const nav = (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV.map((item) => <Link key={item.href} href={item.href} className="rounded-button px-3 py-2 text-sm font-medium text-header-muted hover:bg-header-chip hover:text-header-fg">{item.label}</Link>)}
    </nav>
  );
  return (
    <header data-variant={variant} className="sticky top-0 z-30 border-b border-header-border bg-header/95 text-header-fg backdrop-blur supports-[backdrop-filter]:bg-header/90">
      {variant === "centered" ? (
        <div className="ros-container grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0">{nav}</div>
          <Brand config={config} centered />
          <div className="flex justify-end">{actions}</div>
        </div>
      ) : (
        <div className="ros-container flex h-16 items-center gap-4">
          <Brand config={config} />
          {variant === "standard" && <div className="ml-auto">{nav}</div>}
          <div className={cx(variant === "standard" ? "ml-1" : "ml-auto")}>{actions}</div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter({ config }: { config: StoreConfig }) {
  const variant = config.experience.site.footer;
  const o = config.outlet;
  const wa = whatsappLink(config.links.whatsapp);
  const maps = mapsUrl(config);
  const { fssai, gstin, legalName } = config.credentials;
  const credentials = (fssai || gstin || legalName) && (
    <p className="text-xs text-muted">
      {[legalName, fssai && `FSSAI Lic. No. ${fssai}`, gstin && `GSTIN ${gstin}`].filter(Boolean).join(" · ")}
    </p>
  );
  const policies = config.policies.length > 0 && (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {config.policies.map((p) => <li key={p.key}><Link href={`/policies/${p.key}`} className="hover:text-text hover:underline">{p.title}</Link></li>)}
    </ul>
  );
  const legal = (
    <div className="border-t border-border">
      <div className="ros-container flex flex-col items-center gap-2 pb-24 pt-4 text-center md:pb-4">
        {policies}
        {credentials}
        <p className="text-xs text-faint">© {new Date().getFullYear()} {config.name}. Ordering powered by Restaurant OS.</p>
      </div>
    </div>
  );
  const channels = config.experience.site.orderChannels && hasOtherChannels(config) ? orderChannels(config) : [];

  if (variant === "simple") {
    return (
      <footer data-variant={variant} className="border-t border-border bg-surface">
        <div className="ros-container flex flex-col items-center gap-3 py-8 text-center text-sm">
          <p className="ros-heading text-lg">{config.name}</p>
          {o && <address className="not-italic text-muted">{[o.address.line1, o.address.city].filter(Boolean).join(", ")}</address>}
          <div className="flex flex-wrap justify-center gap-4">
            {o?.phone && <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="size-4" aria-hidden />{o.phone}</a>}
            {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline"><MapPin className="size-4" aria-hidden />Directions</a>}
          </div>
        </div>
        {legal}
      </footer>
    );
  }

  if (variant === "brand") {
    return (
      <footer data-variant={variant} className="bg-primary text-primary-contrast">
        <div className="ros-container grid gap-8 py-12 md:grid-cols-[2fr_1fr]">
          <div>
            <p className="ros-heading text-3xl">{config.name}</p>
            {config.tagline && <p className="mt-2 max-w-md opacity-90">{config.tagline}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/menu" className="ros-button-text ros-press inline-flex h-12 items-center rounded-button bg-surface px-6 font-semibold text-text">Order direct</Link>
              {channels.length > 0 && <OrderChannelsButton channels={channels} storeName={config.name} className="ros-button-text inline-flex h-12 items-center rounded-button border border-current/40 px-5 text-sm font-medium hover:bg-current/10" />}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {o && <address className="not-italic opacity-90">{[o.address.line1, o.address.line2, o.address.city, o.address.postalCode].filter(Boolean).join(", ")}</address>}
            {o?.phone && <a href={`tel:${o.phone}`} className="flex items-center gap-2 hover:underline"><Phone className="size-4" aria-hidden />{o.phone}</a>}
            {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline"><MapPin className="size-4" aria-hidden />Get directions</a>}
          </div>
        </div>
        <div className="bg-surface text-text">{legal}</div>
      </footer>
    );
  }

  return (
    <footer data-variant={variant} className="border-t border-border bg-surface">
      <div className="ros-container grid gap-8 py-10 sm:grid-cols-3">
        <div>
          <p className="ros-heading text-lg">{config.name}</p>
          {config.tagline && <p className="mt-1 text-sm text-muted">{config.tagline}</p>}
          <Link href="/menu" className={buttonClass("primary", "md", "ros-press mt-4")}>Order direct</Link>
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
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:underline" data-wa-cart="">Chat on WhatsApp</a></li>}
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
      {legal}
    </footer>
  );
}
