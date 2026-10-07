import type { Metadata } from "next";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { WEEKDAYS, WEEKDAY_LABELS } from "@restaurant-os/domain";
import { Card, buttonClass } from "@restaurant-os/ui";
import { JsonLd } from "@/components/basics";
import { restaurantJsonLd } from "@/lib/seo";
import { getConfig, mapsUrl, whatsappUrl } from "@/lib/store";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  const o = config.outlet;
  return {
    title: "Contact & opening hours",
    description: `${config.name}${o ? `, ${[o.address.line1, o.address.city].filter(Boolean).join(", ")}` : ""}. Opening hours, phone and directions.`,
    alternates: { canonical: "/contact" },
  };
}

export default async function ContactPage() {
  const config = await getConfig();
  const o = config.outlet;
  const wa = whatsappUrl(config.links.whatsapp, `Hi ${config.name}!`);
  const maps = mapsUrl(config);
  return (
    <div className="mx-auto max-w-3xl">
      <JsonLd data={restaurantJsonLd(config)} />
      <h1 className="text-2xl ros-heading">Contact &amp; hours</h1>
      {config.description && <p className="mt-2 leading-relaxed text-muted">{config.description}</p>}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="ros-heading">Find us</h2>
          {o && <address className="mt-2 text-sm not-italic text-muted">{[o.address.line1, o.address.line2, o.address.city, o.address.region, o.address.postalCode].filter(Boolean).join(", ")}</address>}
          <div className="mt-4 flex flex-col gap-2">
            {o?.phone && <a href={`tel:${o.phone}`} className={buttonClass("outline", "md", "justify-start")}><Phone className="size-4" aria-hidden />{o.phone}</a>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "md", "justify-start")}><MessageCircle className="size-4" aria-hidden />WhatsApp</a>}
            {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "md", "justify-start")}><MapPin className="size-4" aria-hidden />Directions</a>}
          </div>
        </Card>
        <Card>
          <h2 className="ros-heading">Opening hours</h2>
          {o ? (
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">Opening hours ({o.timezone})</caption>
              <tbody>
                {WEEKDAYS.map((d) => {
                  const ranges = o.hours[d] ?? [];
                  return (
                    <tr key={d} className="border-b border-border last:border-0">
                      <th scope="row" className="py-1.5 text-left font-normal text-muted">{WEEKDAY_LABELS[d]}</th>
                      <td className="py-1.5 text-right">{ranges.length ? ranges.map(([a, b]) => `${a}–${b}`).join(", ") : "Closed"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="mt-2 text-sm text-muted">Hours will be published soon.</p>}
          {o && <p className="mt-3 text-sm font-medium">{o.openNow ? "Open now" : o.nextOpening ? `Closed · opens ${o.nextOpening}` : "Closed"}</p>}
        </Card>
      </div>
    </div>
  );
}
