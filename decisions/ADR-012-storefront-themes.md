# ADR-012: Per-restaurant Storefront Themes (theme editor pulled forward from V1)

Status: Accepted (implemented)
Date: 2026-10-06

## Context

The MVP storefront let a restaurant change one thing — its brand colour. Every other visual decision (surfaces,
text colours, corners, borders, shadows, type, layout of dish cards) was fixed for all tenants, so every
restaurant looked like the same template. `roadmap/V1.md` lists a "theme editor"; the owner asked for it now:
every visual token editable per organisation, plus 10–15 professionally designed one-click styles.

## Decision

1. **A theme is design tokens plus fixed component variants — never free CSS.** The format
   (`packages/domain/src/theme.ts`, `StoreTheme`, versioned) holds 12 colours, a heading/body font pair from a
   curated list of 17 Google fonts, text size, heading weight and case, button-label case, five corner radii
   (0–32 px or fully round), border thickness, shadow style, spacing density, light/dark mode and six component
   variants (main button, card, dish layout, category bar, home banner, photo shape). Every value is a validated
   hex colour, a bounded number or an enum, so generated CSS cannot be used for injection and any combination
   renders a working store.
2. **Tokens are runtime CSS variables.** `packages/ui/src/styles.css` defines every token as a `--ros-*`
   variable whose default reproduces the original look; Tailwind utilities reference the variables
   (`@theme inline`). The admin always uses the defaults. The storefront renders the restaurant's theme on
   `<html>` at request time (`themeVariables()` → style, `themeAttributes()` → `data-ros-*` for structural
   variants), so there is no flash of the old look and no client-side work.
3. **Per organisation.** The published theme and an unpublished draft live on the tenant's brand
   (`brands.theme`, `brands.theme_draft`); every publish is kept in `brand_theme_versions`. All reads and writes
   are scoped by the session tenant (ADR-002); restoring checks the version belongs to the tenant.
4. **Draft → publish, with a readability guardrail.** Edits autosave as a draft that only the merchant preview
   shows. Publishing (and restoring) is refused with `THEME_NOT_READABLE` while any WCAG 2.2 AA text-contrast rule
   fails (`checkTheme()`: text on background/cards, secondary text, button text, accent text, header text, and
   main-button labels for soft/outline styles). Problems come with a one-click fix that darkens/lightens the
   offending colour just enough. Derived colours (links, soft fills, borders, status colours per mode) are
   computed, never typed in, so they stay readable.
5. **Presets are data.** Twelve presets plus "Classic" (the original look, used by restaurants with no theme)
   ship in `packages/domain/src/theme-presets.ts`; the research behind them is in `ui/THEME_PRESETS.md`.
   Domain tests require every preset to pass `checkTheme()` with no errors and to be distinct; the E2E
   `themes.spec.ts` renders each preset on phone and desktop and checks layout and computed contrast.
6. **Live preview embeds the real storefront.** The admin "Appearance" page shows the storefront (merchant
   preview mode) in an iframe and posts the theme being edited (`postMessage`, origin-checked both ways,
   re-normalised by the storefront). The storefront allows framing only by itself and the admin origin
   (`Content-Security-Policy: frame-ancestors`, replacing `X-Frame-Options`); over HTTPS the preview cookie is
   `SameSite=None; Secure; Partitioned` so it works in the cross-site iframe.
7. **The brand colour follows the theme.** Publishing writes the theme's primary colour to the brand metadata
   (`primaryColor` stays in `StoreConfig` for share images and the browser theme colour). The Brand settings
   page links to Appearance instead of editing the colour itself.

## Consequences

- Restaurants without a theme are unaffected (Classic + their existing colour); no data migration is needed.
- Theme changes reach customers within the store-config cache window (~30 s); the merchant preview is instant.
- Fonts are self-hosted at build time (`next/font`), so builds need network access to Google Fonts; only the
  fonts a theme uses are downloaded by visitors.
- Adding a token or variant is a versioned change to `StoreTheme`, `normalizeTheme()` (defaults for old
  themes), the Zod schema, the CSS defaults and the editor.
- Out of scope (still V1/V2): custom CSS, uploading fonts, per-page layouts/section ordering, custom domains.
