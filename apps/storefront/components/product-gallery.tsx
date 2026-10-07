"use client";
// Dish photos: the main photo plus any extra ones, with thumbnails to switch between them.
import { useState } from "react";
import Image from "next/image";
import type { MediaRef } from "@restaurant-os/types";
import { cx } from "@restaurant-os/ui";

export function ProductGallery({ name, images }: { name: string; images: MediaRef[] }) {
  const [index, setIndex] = useState(0);
  const current = images[index];
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-[var(--ros-radius-xl)] bg-subtle">
        {current
          ? <Image key={current.url} src={current.url} alt={current.alt || name} fill sizes="(min-width: 768px) 50vw, 100vw" className="ros-fade-up object-cover" priority={index === 0} />
          : <div className="flex h-full items-center justify-center text-6xl font-bold text-faint" aria-hidden>{name.slice(0, 1)}</div>}
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="More photos">
          {images.map((img, i) => (
            <li key={img.url}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Photo ${i + 1} of ${images.length}${img.alt ? `: ${img.alt}` : ""}`} aria-pressed={i === index}
                className={cx("relative block size-16 overflow-hidden rounded-image bg-subtle ring-offset-2 ring-offset-bg", i === index ? "ring-2 ring-primary" : "opacity-75 hover:opacity-100")}>
                <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
