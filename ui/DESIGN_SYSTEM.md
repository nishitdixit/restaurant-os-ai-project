# Design System

## Design direction

Modern, trustworthy, clean commerce UI. The restaurant's own brand should be prominent on the storefront; admin should prioritize clarity over decoration.

## Tokens

Define design tokens for:

- typography scale;
- spacing scale;
- radii;
- elevation;
- borders;
- semantic colors;
- focus/interaction states;
- motion duration.

## Components

Minimum shared component library:

- Button
- Input
- Select
- Checkbox/Switch
- Modal/Drawer
- Toast
- Badge/StatusPill
- Table/List
- Card
- Tabs
- EmptyState
- ErrorState
- Loading/Skeleton
- Pagination
- Date/Time display
- Currency display
- ProductCard
- CartLine
- OrderTimeline

## Storefront themes (ADR-012)

Each restaurant can restyle its storefront from the admin **Appearance** page; the admin itself always uses the
default tokens.

- Every token is a runtime CSS variable (`--ros-*`, `packages/ui/src/styles.css`); defaults reproduce the
  original look. Components must use semantic tokens and the themed building blocks (`ros-card`,
  `ros-btn-primary`, `ros-btn-outline`, `ros-heading`, `ros-button-text`, `rounded-button|card|input|chip|image`)
  — never hard-coded colours, radii or shadows — so every theme applies everywhere.
- Text that uses the brand colour must use `text-link` (the engine falls back to the text colour when the brand
  colour isn't readable), and anything placed on a brand-coloured surface uses `primary-contrast`.
- Structural variants are `data-ros-*` attributes on `<html>` with custom Tailwind variants in the storefront
  (`cards-grid:`, `cards-compact:`, `nav-underline:`, `hero-solid:`, `hero-minimal:`, `theme-dark:`); dish cards
  use the `.ros-product` grid so one markup serves list, photo-grid and compact layouts.
- Status colours and food-type marks are not themeable (they switch only between light and dark mode).
- Presets and their rationale: `ui/THEME_PRESETS.md`.
- Badge treatment (`data-ros-badge`: pill · quiet · sticker) and motion level (`data-ros-motion`: none · subtle ·
  expressive) are theme tokens too. Faint text (`--ros-faint`) is computed to stay ≥ 4.5:1 on cards.

## Storefront experience (ADR-013)

The homepage is a list of **sections** rendered by `apps/storefront/components/sections/*` from the restaurant's
experience (`packages/domain/src/experience.ts`). Rules for section components:

- Wrap every section in `SectionShell` (id, `data-section-id/type/variant`, tone variables, `ros-reveal`) and use
  `SectionHeading` for eyebrow/title/subtitle so Hindi lines, tones and alignment behave the same everywhere.
- Text placed directly on a section background uses `ros-section-text`, `ros-section-muted`, `ros-section-link`
  (from `sectionToneVariables()`, readable by construction for page, soft, brand and contrast tones). Cards inside a
  section keep the theme's own surface colours.
- Text on a photo always sits on an overlay (dark 55%/70% with white text, or light 80% with near-black text).
- A section with nothing to show renders nothing for customers and a `Placeholder` in merchant preview.
- Calls to action resolve only to store pages or the restaurant's own channels (`resolveCta`); never free URLs.
- Dish collections use `ProductCollection` (`data-layout` overrides the theme's dish layout locally: grid, list,
  compact, board; rails use `ros-rail`). The customer's menu view toggle uses the same mechanism.
- Inner pages share `ros-container` (content width from the experience: narrow 64rem · standard 72rem · wide 80rem)
  via the `app/(shop)` layout; the homepage composes its own full-width sections.
- Phones: one header row (pages in the menu sheet), food above the fold, one sticky action at a time (cart bar on
  browsing pages, "Place order" on checkout), no sideways scroll at 360–430 px.
- Motion is CSS only (`ros-reveal`, `ros-press`, `ros-bump`, `ros-fade-up`); never hide content without JavaScript
  and always respect `prefers-reduced-motion`.
- Absolutely positioned children of scroll containers need a positioned container (`ros-rail` is `relative`), or
  they widen the page.

## Status colors

Semantic statuses must be consistent across order, payment, delivery and availability.

## Accessibility

Keyboard focus, labels, readable contrast, touch targets and semantic elements are required. Customer pages are
checked with axe (WCAG 2.x A/AA, `tests/e2e/specs/a11y.spec.ts`); serious and critical violations fail the build.
Each accessible name is unique on a page (e.g. the header's "Find a dish" link vs the menu's "Search the menu" box).

## Responsive behavior

Components must define mobile behavior explicitly rather than rely on accidental wrapping.
