# ADR-013: Storefront Brand Experience — page composition, content, media, merchandising and complete presets

Status: Accepted (in implementation)
Date: 2026-10-07
Extends: ADR-012 (storefront themes)

## Context

ADR-012 made every visual token editable per restaurant, but every store still had the same page: one text-only
banner, the same sections in the same order, no photos beyond dishes, "Popular right now" that was simply the first
six dishes, and no way to tell the restaurant's story or show social proof. The product direction (owner, after
analysing a strong single-restaurant reference site) is a **restaurant-native brand experience builder attached to
the commerce platform**: each owner should be able to make a store that feels like their own restaurant, starting
from a professionally designed preset, without a developer and without arbitrary HTML/CSS.

## Decision

1. **An experience sits next to the theme** (`packages/domain/src/experience.ts`, `StoreExperience`, versioned):
   site settings (language English/Hindi/bilingual, content width, header and footer style, "more ways to order"),
   menu presentation (customer view toggle, inline search, veg filter, badges, bestseller rules), SEO overrides, and
   the homepage as an ordered list of **sections**. Like the theme it is never free-form: every value is an enum, a
   bounded number, a length-capped plain string (rendered as text, never HTML) or a reference id; restaurant copy is
   a `LocalizedText` (English + Hindi) from the start.
2. **Twelve restaurant-native section types** with controlled variants: hero (split, centered, image-left,
   image-right, full-bleed, editorial, minimal), highlights, categories, featured dishes, bestsellers, combos &
   specials, story, gallery, offers, reviews, delivery, call-to-action. Each has `id, type, enabled, variant, tone,
   eyebrow/title/subtitle` plus its own settings and content; per-type limits and a 20-section cap are enforced by
   normalisation. Section **tones** (page, soft, brand, inverted) are computed from the theme so text is readable by
   construction (tested for every preset).
3. **One document, one version.** The published experience and its draft live on the brand
   (`brands.experience`, `brands.experience_draft`, migration 0009); publishing makes the theme and the experience
   live together and stores both in the same `brand_theme_versions` row, so a restore never pairs a look with a
   layout it wasn't designed with. Versions published before experiences restore only the look. A brand with no
   experience renders `defaultExperience()`, the original homepage made section-driven, so existing restaurants are
   unchanged until they edit.
4. **Publishing guardrail.** `checkExperience()` blocks publishing (`EXPERIENCE_NOT_READY`) while a homepage photo has
   no alt text; empty sections, missing translations and removed photos are warnings. On the live store a section
   with nothing to show renders nothing; in merchant preview it shows a placeholder explaining what to add.
5. **References are tenant-checked.** On every save the API drops media, dish and category ids that aren't the
   restaurant's own (`filterExperienceReferences`); media URLs are resolved per tenant.
6. **Media library.** `media_assets` gains a kind and alt text; photos can be listed, described and deleted only
   when nothing uses them (logo, dishes, extra dish photos, categories, live or draft homepage). Dishes keep their
   main photo (`products.image_asset_id`, backward compatible) and gain up to 8 extra photos (`product_media`);
   categories gain a photo.
7. **Honest merchandising.** Dishes carry up to three merchant badges (New, Signature, Chef's choice, Recommended,
   Limited, Combo, or a custom label). **Bestseller is computed, never set**: dishes with at least N paid,
   uncancelled orders in a window, ranked by units sold (rules per restaurant, default 5 orders in 30 days, top 6).
   No dish-level "Offer" badge exists because offers are order-level codes. Order counts are shown only from real
   paid orders above 50. A rating is shown only with its source link and "as of" month; reviews are labelled with
   their source and never called "verified".
8. **Complete presets.** Each theme preset is paired with a page design (`experience-presets.ts`): archetype,
   personality, traits, homepage composition (sections, order, variants, tones, default titles), header, footer,
   width and menu presentation. The theme adds a **badge treatment** token (pill, quiet, sticker) and a motion
   level. "Use this style" applies theme + layout in one click; applying a layout carries the restaurant's content
   into the matching sections and switches off — never deletes — sections the preset doesn't use; language, SEO and
   business rules are kept. Tests require every preset to be readable, valid and to differ from every other preset
   on at least six visible dimensions. Rationale per preset: `ui/THEME_PRESETS.md`.
9. **Commerce stays common.** Presets and sections change presentation only. Pricing, serviceability, checkout,
   payment and order status are the same code for every store. Free delivery above an amount is a delivery-area
   setting applied by the server (BUSINESS_RULES P16).
10. **Signed merchant preview.** Drafts now hold unpublished copy and photos, so the open `?preview=1` is replaced by
    a short-lived HMAC token (`lib/preview.ts`, `PREVIEW_SECRET`) issued to signed-in staff; the API decides access,
    the storefront only stores the token. Live preview: theme edits still apply instantly as CSS variables; layout
    and content edits autosave and the preview re-renders from the server; the builder can focus a section.
11. **Motion** is CSS only (no animation library): reveals, press feedback, cart bump and fades, at the theme's
    None/Subtle/Expressive level, always off for reduced-motion users and never hiding content without JavaScript.

## Consequences

- The homepage is now data; new section types need a domain definition, normalisation, a renderer and builder
  controls — but no change to commerce code.
- The storefront's inner pages share a content container (`app/(shop)` route group) while the homepage composes
  full-width sections.
- Category slugs can no longer shadow store pages (`RESERVED_SLUGS`).
- Hindi copy is supported for restaurant content (dish and category names, section text); storefront interface labels
  remain English for now.
- Draft experiences can reference photos that are later deleted only through the usage check; a removed photo in an
  old version is dropped on restore.

## Alternatives considered

- **Free-form page builder / custom CSS** — rejected: breaks accessibility and contrast guarantees, makes tenant
  stores unmaintainable, and invites injection.
- **Separate versioning for theme and layout** — rejected: restores could pair a look with a layout it wasn't
  designed for.
- **Static preview screenshots for presets** — rejected in favour of a live miniature using the restaurant's own
  name and dishes.
