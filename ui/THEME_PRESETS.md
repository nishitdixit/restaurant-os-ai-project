# Storefront presets

A preset is a **professionally designed starting point for a restaurant's whole website**, not a colour theme
(ADR-012 for the visual tokens, ADR-013 for composition). One click — "Use this style" — gives a restaurant:

```text
Theme tokens (colour, type, shape, depth, motion, badge style)          packages/domain/src/theme-presets.ts
+ Homepage composition (sections, order, variants, tones, titles)       packages/domain/src/experience-presets.ts
+ Navigation, footer and content width
+ Menu presentation (dish layout, board/photo toggle, category bar)
+ Merchandising presentation (badge treatment)
```

The restaurant can then refine any of it. Customisation comes after the preset, not before it.

## How the set was designed

**Segments.** The PRD's primary and secondary customers (delivery-first restaurants, cafés, bakeries, tiffin
services, cloud kitchens, food trucks, small groups) were mapped to the cuisines and formats that dominate direct
ordering in Indian cities: biryani/North Indian, quick-service (burgers, rolls, pizza), cafés and brunch, premium
dining, healthy bowls and juices, bakeries and desserts, South Indian meals and tiffin, street food and chaat,
multi-brand cloud kitchens, Italian, chai-and-snacks counters, and Pan-Asian/grill.

**What customers in each segment expect.** Category leaders and well-reviewed independents in each segment share
recognisable conventions — quick-service brands use saturated red/yellow, heavy capitals and big buttons built for
speed; cafés lean on warm neutrals, serif headings, photography and white space; premium restaurants use dark
surfaces, a single metallic accent, restrained type and never shout about discounts; healthy brands use greens and
rounded, airy layouts; bakeries are photo-first, pastel and gift-oriented; South Indian brands draw on banana-leaf
green and turmeric and organise long menus for fast repeat orders; street food is loud and playful; delivery-first
operators favour neutral, dense, list-driven menus. Each preset follows its segment's conventions so it feels
familiar, while staying unmistakably different from the others.

## Rules every preset meets

- **Readable.** WCAG 2.2 AA: 4.5:1 for every text pair (body, secondary, button, accent and header text), with
  zero warnings; every section tone (page, soft, brand, inverted) is readable for every preset
  (`theme.test.ts`, `experience.test.ts`). Text on photos always sits on a readable overlay.
- **Distinct, not recoloured.** Every pair of presets differs on at least six of eleven visible dimensions —
  palette, typography, shape, depth, dish layout, hero, homepage composition, navigation, footer, badge treatment,
  motion — and every preset has its own homepage composition (`experience-presets.test.ts`).
- **Coherent.** Type, shape, depth, motion, badge style and composition all serve the same archetype (a premium
  preset never gets sticker badges or bouncy motion; a delivery-first preset never gets a full-screen photo).
- **Phone-first.** Tap targets 40–48 px; nothing scrolls sideways at 360–430 px; on phones food is above the fold
  and text-only banners stay compact (E2E `themes.spec.ts`).
- **At most two type families**, display faces only for headings — never for prices or body text.
- **Food-type marks and status colours are never themed** — customers must read them the same way everywhere.
- **Commerce stays common.** Presets choose how dishes, buttons, badges and the category bar look; the cart,
  checkout and order-status structure is the same everywhere, so usability and accessibility never depend on a
  style choice.
- **Neutral default copy.** A preset's default titles are generic ("House favourites", "Family feasts"); they
  never claim anything about the restaurant's food, ovens, history or opening hours, because any restaurant can
  pick any preset. Highlights in presets are only the automatic, data-backed kinds (delivery time and fee, rating,
  order count) until the restaurant writes its own.
- **Honest merchandising.** Presets change how badges look, never what they claim: "Bestseller" only appears on
  dishes that really sold (ADR-013), and there is no dish-level "Offer" badge because offers are order-level codes.

## Applying a preset

- **Use this style** (default): theme + layout. Sections follow the preset's order, variants and tones. Each one
  takes over the restaurant's existing content of the same kind — banner photo, story text and photo, gallery,
  reviews, highlights, picked dishes, button targets, and any title the restaurant wrote (otherwise the preset's
  title is used). Sections the preset doesn't use are switched off, not deleted, so nothing is ever lost; switching
  to another preset brings them back if that preset uses them. Language, SEO text, bestseller rules, menu search and
  the veg filter stay as the restaurant set them.
- **Look only**: just the theme tokens (the previous behaviour).
- **Keep my brand colour**: swaps in the restaurant's own colour and recalculates the colours that depend on it.
- Everything goes to the draft; the live store changes only on Publish.

## Badge treatments

| Treatment | Looks like | Used by |
| --- | --- | --- |
| **Pill** | Solid rounded label in the brand/accent colour | Classic, Saffron House, Rapid, Fresh Bowl, Banana Leaf, Cloud Kitchen Pro, Wok & Ember |
| **Quiet** | Small spaced capitals with an underline, no fill (a backing on photos) | Café Linen, Noir, Trattoria |
| **Sticker** | Tilted, thick outline, offset shadow | Sugar Bloom, Street Pop, Chai Adda |

---

## The presets

Each entry: archetype → design hypothesis → typography → colour → shape → photography → motion → homepage →
merchandising and commerce UX. Values are the exact tokens in code.

### Classic
- **Archetype.** Any restaurant that wants a clean, familiar store. Customers expect a fast, no-surprise ordering
  flow. **Perception:** trustworthy, neutral.
- **Hypothesis.** The original Restaurant OS look: neutral greys let the restaurant's brand colour and food lead.
- **Type.** Inter 600 headings + Inter body; regular case.
- **Colour.** background `#f7f7f8` · surface `#ffffff` · subtle `#f2f3f5` · border `#e3e5e8` · text `#15181d` ·
  muted `#5b6370` · primary `#b42318` (or the restaurant's own) · accent = primary · header white.
- **Shape.** Buttons/inputs 10 px, cards 14 px, images 10 px, pill chips; 1 px borders, soft shadows.
- **Photography.** Square dish photos; split banner with the photo on the right; photo category cards.
- **Motion.** Subtle — gentle reveals, button press, cart bump.
- **Homepage.** Hero (split) → Offers strip → Categories (photo cards) → Bestsellers rail → Combos rail → From the
  menu (grid) → Story (stacked) → Delivery banner. Standard width, standard header, detailed footer.
- **Merchandising & commerce.** Pill badges; list dish cards; pill category bar.

### Saffron House
- **Archetype.** Biryani & North Indian; family dinners, weekend feasts, celebrations. Customers order big and
  expect generosity and heritage. **Perception:** rich, proud, celebratory.
- **Hypothesis.** Ivory and maroon with saffron like a wedding feast; an elegant serif signals tradition.
- **Type.** Playfair Display 700 headings + DM Sans body.
- **Colour.** background `#fbf6ee` · surface `#ffffff` · subtle `#f5ebdd` · border `#ead9c2` · text `#2b1a12` ·
  muted `#6b5446` · primary `#8e1b1b` / white · accent `#e8a33d` / `#2b1a12` · header `#fffdf8` / `#2b1a12`.
- **Shape.** Buttons 10 px, cards 16 px, images 12 px, pill chips; raised cards, soft shadows.
- **Photography.** Warm, close, steam-and-texture shots of handis and platters; photo framed beside the headline;
  square category tiles; one large spotlight dish.
- **Motion.** Subtle.
- **Homepage.** Hero (photo right) → Highlights (stats, soft band) → House favourites (spotlight) → Family feasts
  (combo cards) → Categories (square) → Story (photo left) → Reviews → "Dinner sorted?" brand band → Delivery
  checker. Centered header, brand footer.
- **Merchandising & commerce.** Pill badges; list dishes with a menu-board toggle for long menus.

### Rapid
- **Archetype.** Quick service — burgers, rolls, pizza. Impulse and deal-driven; customers want the deal and the
  button, fast. **Perception:** loud, energetic, fast.
- **Hypothesis.** Saturated red and yellow, heavy capitals and big round buttons — the visual language of QSR.
- **Type.** Rubik 800 capitals + Rubik body; large scale; capital button labels.
- **Colour.** background `#fff8ec` · surface `#ffffff` · subtle `#fff1cc` · border `#f2e2bd` · text `#1a1a1a` ·
  muted `#575757` · primary `#d62300` / white · accent `#ffc72c` / `#1a1a1a` · header `#d62300` / white.
- **Shape.** Pill buttons, cards 18 px, images 14 px; raised cards, strong shadows.
- **Photography.** Bright, saturated, top-down product shots; full-bleed banner; 4:3 photos; category circles.
- **Motion.** Expressive — bigger reveals, bouncier press and cart bump.
- **Homepage.** Full-bleed hero (compact) → Deal banner → Meal deals rail → Category circles → Bestsellers grid →
  "Hot picks" rail → Delivery (brand band). Wide width, simple footer.
- **Merchandising & commerce.** Bold pill badges (capitals); photo-grid dishes; pill category bar.

### Café Linen
- **Archetype.** Cafés & brunch; slow mornings, coffee, pickup. Customers come for atmosphere and craft.
  **Perception:** calm, considered, photographic.
- **Hypothesis.** Linen whites, charcoal and latte with a soft serif and fine lines — a café's printed menu.
- **Type.** Fraunces 500 headings + Work Sans body.
- **Colour.** background `#f7f4ef` · surface `#ffffff` · subtle `#efeae2` · border `#dcd5ca` · text `#1f1d1a` ·
  muted `#625c53` · primary `#2f3a2f` / white · accent `#c8a27a` / `#1f1d1a` · header = background.
- **Shape.** 6 px buttons, inputs, chips and images; 8 px cards; fine borders, no shadows; airy spacing.
- **Photography.** Natural light, generous negative space, 4:3 crops; an editorial captioned photo card; mosaic
  gallery.
- **Motion.** Subtle.
- **Homepage.** Editorial hero → Story (photo right) → "On the menu today" (list) → Mosaic gallery → Highlights
  (icons) → Reviews wall (soft band) → "Order ahead, skip the queue" minimal CTA. Narrow width, centered header, simple footer, no
  "more ways to order" (direct pickup first).
- **Merchandising & commerce.** Quiet labels; outline buttons; list dishes with a menu-board toggle; tab category bar.

### Noir
- **Archetype.** Fine dining & premium; special occasions, chef-led menus. Customers expect restraint and quality,
  not deals. **Perception:** cinematic, restrained, premium.
- **Hypothesis.** Near-black and gold with an elegant serif and sharp corners — understated luxury.
- **Type.** Cormorant Garamond 600 headings + Manrope body; capital button labels.
- **Colour.** background `#0e0e10` · surface `#17171a` · subtle `#222226` · border `#2e2e33` · text `#f2efe8` ·
  muted `#aaa59c` · primary `#c9a45c` / `#141414` · accent `#e8d9b5` / `#141414` · header = background (dark mode).
- **Shape.** Square everything (0 px); fine borders, no shadows; airy.
- **Photography.** Low-key, dramatic lighting; wide 16:9 crops; a tall full-screen banner; story over a darkened
  photo; carousel gallery.
- **Motion.** Subtle.
- **Homepage.** Full-screen hero (centered, no status line) → Story over photo → Signatures (spotlight) → Gallery
  carousel → Reviews carousel → Minimal CTA. No offers section (premium brands don't lead with discounts). Narrow
  width, centered header, brand footer.
- **Merchandising & commerce.** Quiet labels; outline buttons; photo-grid dishes with a menu-board toggle; tab bar.

### Fresh Bowl
- **Archetype.** Healthy food, salads, juices; weekday lunches and repeat orders. Customers check freshness, price
  and delivery time. **Perception:** light, friendly, fresh.
- **Hypothesis.** Leafy greens, citrus and soft rounded shapes; airy layouts that feel clean.
- **Type.** Outfit 600 headings + Nunito body.
- **Colour.** background `#f4f8f1` · surface `#ffffff` · subtle `#e8f1e2` · border `#d3e3c8` · text `#16261a` ·
  muted `#4c5d4b` · primary `#2e7d32` / white · accent `#f4a261` / `#1f1a14` · header white.
- **Shape.** Pill buttons and chips, cards 20 px, images 18 px; raised cards, soft shadows; airy.
- **Photography.** Bright daylight, overhead bowls, 4:3; landscape category cards.
- **Motion.** Subtle.
- **Homepage.** Split hero → Highlights (icons: delivery time, delivery fee, rating, orders) → Categories
  (landscape) → Most-ordered bowls (grid) → Offer cards → Story (soft band) → Delivery checker.
- **Merchandising & commerce.** Pill badges; photo-grid dishes; veg filter prominent.

### Sugar Bloom
- **Archetype.** Bakeries, cakes, desserts; gifting, birthdays, occasions. Customers browse photos and choose by
  look. **Perception:** sweet, joyful, giftable.
- **Hypothesis.** Blush, raspberry and cream with a playful rounded display face — sweet without being childish.
- **Type.** Baloo 2 700 headings + Nunito body.
- **Colour.** background `#fff7f8` · surface `#ffffff` · subtle `#fdecef` · border `#f6d5dc` · text `#3a2230` ·
  muted `#755664` · primary `#c2185b` / white · accent `#f7c9a9` / `#3a2230` · header = background.
- **Shape.** Pill buttons and chips, cards 24 px, images 22 px; soft shadows.
- **Photography.** Soft, bright, pastel backdrops; square crops; a centered photo banner on a light overlay; photo
  grid gallery.
- **Motion.** Expressive.
- **Homepage.** Centered photo hero → Categories (square) → Most loved (rail) → Celebration boxes (combo cards) →
  Gallery grid → Reviews carousel (soft band) → "Celebrating something? Order ahead." brand band. Centered header, brand footer.
- **Merchandising & commerce.** Sticker badges; photo-grid dishes.

### Banana Leaf
- **Archetype.** South Indian, tiffin and meals; breakfast rush, long menus, regulars who know what they want.
  **Perception:** traditional warmth, cleanly organised, quick.
- **Hypothesis.** Leaf green, turmeric and rice-paper cream; a tidy serif; built for scanning long menus fast.
- **Type.** Lora 700 headings + Poppins body.
- **Colour.** background `#faf7ec` · surface `#ffffff` · subtle `#f0f0dc` · border `#dcddbf` · text `#1e2a14` ·
  muted `#555d44` · primary `#2f6b2f` / white · accent `#e3a21a` / `#1e2a14` · header `#2f6b2f` / white.
- **Shape.** Buttons 8 px, cards 12 px, images 10 px, pill chips; compact spacing.
- **Photography.** Overhead plates on leaf, square crops; a compact framed banner; category circles.
- **Motion.** None — speed first for the breakfast rush.
- **Homepage.** Compact hero (photo left) → Highlights strip (soft band) → Category circles → Meals & combos (list)
  → Everyday favourites (list) → Offers strip → Delivery areas. Brand footer.
- **Merchandising & commerce.** Pill badges; list dishes with a menu-board toggle; tab category bar for long menus.

### Street Pop
- **Archetype.** Street food, chaat, food trucks; playful, quick, shareable. **Perception:** loud, fun, impossible
  to miss.
- **Hypothesis.** Sunny yellow, ink outlines and offset shadows — a sticker-covered food cart.
- **Type.** Bricolage Grotesque 800 capitals + Space Grotesk body; capital button labels.
- **Colour.** background `#fff3c4` · surface `#ffffff` · subtle `#ffe89a` · border `#111111` · text `#111111` ·
  muted `#3d3d3d` · primary `#ff5a1f` / `#111111` · accent `#2ec4b6` / `#111111` · header `#111111` / `#fff3c4`.
- **Shape.** 8 px everything; 2 px borders; offset block shadows.
- **Photography.** Punchy, high-contrast, close-up; full-bleed compact banner; swipeable photo rail.
- **Motion.** Expressive.
- **Homepage.** Full-bleed hero (compact) → Deal banner → Crowd favourites (rail) → Category circles → Highlights
  strip (inverted band) → photo rail → "Hungry?" brand band. Wide width, brand footer.
- **Merchandising & commerce.** Sticker badges; photo-grid dishes.

### Cloud Kitchen Pro
- **Archetype.** Delivery-first and multi-brand kitchens; customers reorder the same things quickly.
  **Perception:** efficient, neutral, menu-first.
- **Hypothesis.** Cool greys, one confident blue, small type and a dense list — get to the menu immediately.
- **Type.** Manrope 700 headings + Inter body; small scale.
- **Colour.** background `#f5f7fa` · surface `#ffffff` · subtle `#eef1f6` · border `#dde2ea` · text `#101828` ·
  muted `#475467` · primary `#1d4ed8` / white · accent `#f79009` / `#101828` · header white.
- **Shape.** 8–10 px; pill chips; soft shadows; compact.
- **Photography.** Consistent square product shots; small; no hero photo.
- **Motion.** None.
- **Homepage.** Minimal hero strip → Offers strip → Category circles → Reorder favourites (rail) → Full menu (list,
  12 dishes) → Delivery banner. Wide width, minimal header (no nav row), simple footer.
- **Merchandising & commerce.** Pill badges; list dishes; tab category bar.

### Trattoria
- **Archetype.** Pizza, pasta, Italian; family dinners and sharing. **Perception:** warm neighbourhood trattoria.
- **Hypothesis.** Tomato red, basil and warm cream with slab-serif headings, like a printed trattoria menu.
- **Type.** Roboto Slab 700 headings + Work Sans body.
- **Colour.** background `#fbf5ea` · surface `#fffdf8` · subtle `#f3e8d5` · border `#e5d6bc` · text `#2a1d14` ·
  muted `#6a5646` · primary `#b3261e` / white · accent `#3e7b3e` / white · header = background.
- **Shape.** Buttons 6 px, cards 10 px, images 10 px, pill chips; soft shadows.
- **Photography.** Warm evening light, rustic tables; 4:3; a tall framed photo banner; landscape categories.
- **Motion.** Subtle.
- **Homepage.** Hero (framed photo left, tall) → From our kitchen (grid) → Story (photo left) → Categories
  (landscape) → Family deals (combo cards) → Reviews (soft band) → Delivery banner. Brand footer.
- **Merchandising & commerce.** Quiet labels; photo-grid dishes with a menu-board toggle.

### Chai Adda
- **Archetype.** Tea, snacks, quick bites; regulars and evening cravings. **Perception:** cosy, chatty, a corner
  chai stall.
- **Hypothesis.** Kraft-paper browns with ginger orange and a characterful serif; the menu reads like a chalk board.
- **Type.** DM Serif Display headings + DM Sans body.
- **Colour.** background `#f3eadf` · surface `#fbf7f1` · subtle `#eadcc9` · border `#d7c4ab` · text `#2e1f14` ·
  muted `#655041` · primary `#7a4a2a` / white · accent `#d9822b` / `#2e1f14` · header `#2e1f14` / `#f3eadf`.
- **Shape.** Buttons 12 px, cards 14 px, images 12 px, pill chips; raised cards.
- **Photography.** Warm, close, steam rising from glasses; square; a compact framed banner.
- **Motion.** Subtle.
- **Homepage.** Compact hero (photo left) → Highlights strip → Perfect pairings (combos rail) → Regulars' favourites
  (list) → Story (soft band) → Offer cards → Delivery checker.
- **Merchandising & commerce.** Sticker badges; **menu-board dishes** by default (photo toggle available).

### Wok & Ember
- **Archetype.** Pan-Asian, grills, late night; bold flavours ordered at night. **Perception:** dark, sharp,
  appetising.
- **Hypothesis.** Charcoal, chilli red and amber with crisp geometry and capitals.
- **Type.** Space Grotesk 700 capitals + Inter body; capital button labels.
- **Colour.** background `#121212` · surface `#1b1b1b` · subtle `#262626` · border `#333333` · text `#f5f5f5` ·
  muted `#a6a6a6` · primary `#d32f2f` / white · accent `#ffb300` / `#121212` · header = background (dark mode).
- **Shape.** 4–6 px; flat cards, no shadows; compact.
- **Photography.** Fire, smoke, glossy sauces on dark backgrounds; wide 16:9; full-bleed banner; photo-overlay
  category cards; mosaic gallery.
- **Motion.** Expressive.
- **Homepage.** Full-bleed hero → Categories (photo cards) → "Fired up tonight" (spotlight) → Combos rail → Mosaic
  gallery → Deal banner → "Late-night cravings?" inverted band. Wide width, brand footer.
- **Merchandising & commerce.** Pill badges; photo-grid dishes; tab category bar.

## Adding or changing a preset

1. Add the theme to `THEME_PRESETS` and the page design to `PRESET_DESIGNS` (archetype, personality, 3–5 traits,
   site, menu, sections).
2. Run the domain tests: contrast (all text pairs and section tones), normalisation, the six-dimension
   distinctness check against every other preset, and a valid, publishable experience.
3. Run the E2E `themes.spec.ts` (layout, overflow and computed contrast on phone and desktop, and the composition
   check).
4. Document it here with the same headings.
