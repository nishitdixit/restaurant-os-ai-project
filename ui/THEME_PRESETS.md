# Storefront theme presets

One-click styles for the restaurant storefront (ADR-012). Each preset is designed as its own small design
system: palette, type pairing, shape language, depth and component variants chosen together for one kind of
restaurant, so the result is coherent before any customisation. Definitions live in
`packages/domain/src/theme-presets.ts`; this document records why each looks the way it does.

## How the set was designed

**Segments.** The PRD's primary and secondary customers (delivery-first restaurants, cafés, bakeries, tiffin
services, cloud kitchens, food trucks, small groups) were mapped to the cuisines and formats that dominate
direct ordering in Indian cities: biryani/North Indian, quick-service (burgers, rolls, pizza), cafés and
brunch, premium dining, healthy bowls and juices, bakeries and desserts, South Indian meals and tiffin, street
food and chaat, multi-brand cloud kitchens, Italian, chai-and-snacks counters, and Pan-Asian/grill.

**What customers in each segment expect.** Category leaders and well-reviewed independents in each segment share
recognisable visual conventions: quick-service brands use saturated red/yellow, heavy capitals and big buttons
built for speed; cafés lean on warm neutrals, serif or soft-serif headings and generous white space; premium
restaurants use dark surfaces, a single metallic accent and restrained type; healthy brands use greens, rounded
shapes and light, airy layouts; bakeries use pastels with friendly rounded display faces; South Indian brands
draw on banana-leaf green and turmeric; street-food brands are loud and playful; delivery-first operators favour
neutral, dense, list-driven menus for fast repeat ordering. Each preset follows its segment's conventions so it
feels familiar, while staying distinct from the others.

**Rules every preset meets.**
- WCAG 2.2 AA: 4.5:1 for all text pairs (body, secondary, button, accent and header text) — enforced by
  domain tests, which also require zero warnings for presets.
- Phone-first: tap targets stay 40–48 px, nothing scrolls sideways at 360–430 px (E2E `themes.spec.ts`).
- One accent role per palette (badges, highlights, the cart count), distinct from the brand colour.
- Type pairings use at most two families; display faces are used only for headings, never for prices or body.
- Food-type marks (veg/non-veg) and status colours are never themed — customers must read them the same
  way everywhere.

## The presets

| Preset | For | Palette | Type | Shape & depth | Components |
| --- | --- | --- | --- | --- | --- |
| **Classic** | Any | Neutral greys, brand colour | Inter | 10–14 px, soft shadows | List, pills, gradient banner |
| **Saffron House** | Biryani & North Indian | Ivory, maroon `#8e1b1b`, saffron | Playfair Display + DM Sans | 10–16 px, soft | Raised cards, list, gradient banner |
| **Rapid** | Quick service | Red `#d62300` header, yellow accent | Rubik 800, capitals | Pill buttons, strong shadows | Photo grid, solid banner, 4:3 photos |
| **Café Linen** | Cafés & brunch | Linen, charcoal-olive, latte | Fraunces 500 + Work Sans | 6–8 px, no shadows, airy | Outline buttons, tabs, minimal banner |
| **Noir** | Fine dining | Near-black, gold `#c9a45c` (dark mode) | Cormorant Garamond + Manrope | Square corners, airy | Outline buttons, photo grid (16:9), tabs |
| **Fresh Bowl** | Healthy, salads, juices | Leaf green, citrus | Outfit + Nunito | Fully round buttons, 18–20 px | Raised photo grid, solid banner |
| **Sugar Bloom** | Bakeries & desserts | Blush, raspberry `#c2185b`, peach | Baloo 2 + Nunito | 22–24 px, round buttons | Photo grid, gradient banner |
| **Banana Leaf** | South Indian & tiffin | Leaf green header, turmeric, rice cream | Lora + Poppins | 8–12 px, compact | List, solid banner |
| **Street Pop** | Street food & trucks | Sunny yellow, orange, ink outlines | Bricolage Grotesque 800 + Space Grotesk | 2 px borders, offset block shadows | Photo grid, solid banner |
| **Cloud Kitchen Pro** | Delivery-first, multi-brand | Cool greys, blue `#1d4ed8`, amber | Manrope + Inter, small | 8–10 px, compact | List, tabs, minimal banner |
| **Trattoria** | Pizza & Italian | Cream, tomato `#b3261e`, basil | Roboto Slab + Work Sans | 6–10 px, soft | Photo grid (4:3), gradient banner |
| **Chai Adda** | Tea & snacks | Kraft browns, chai `#7a4a2a`, ginger | DM Serif Display + DM Sans | 10–14 px, raised | List, dark header, solid banner |
| **Wok & Ember** | Pan-Asian, grill, late night | Charcoal, chilli `#d32f2f`, amber (dark) | Space Grotesk capitals + Inter | 4–6 px, flat, compact | Flat photo grid (16:9), tabs |

## Using presets

- Applying a preset replaces the draft with the preset; "Keep my brand colour" swaps in the restaurant's own
  colour and recalculates the colours that depend on it (button text, a brand-coloured header).
- Anything can then be fine-tuned under Customise; the gallery marks which preset a theme started from.
- Adding a preset: add it to `THEME_PRESETS`, run the domain tests (contrast, uniqueness) and the E2E
  `themes.spec.ts` (layout and computed contrast on phone and desktop), and add a row here.
