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

## Status colors

Semantic statuses must be consistent across order, payment, delivery and availability.

## Accessibility

Keyboard focus, labels, readable contrast, touch targets and semantic elements are required.

## Responsive behavior

Components must define mobile behavior explicitly rather than rely on accidental wrapping.
