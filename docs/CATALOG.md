# Catalog System

## Catalog hierarchy

`Brand/Outlet -> Categories -> Products -> Modifier Groups -> Modifiers`

## Product fields

Minimum:

- name;
- slug;
- short description;
- long description where useful;
- price;
- image;
- active/published state;
- availability state;
- category;
- sort order.

Optional attributes can include:

- vegetarian/non-vegetarian;
- spice level;
- allergens;
- nutritional metadata;
- tags.

## Product lifecycle

`DRAFT -> PUBLISHED -> ARCHIVED`

Availability is a separate state and does not replace publication status.

## Modifiers

Support required/optional selection constraints and price deltas.

## Catalog UX

Owner should be able to:

- duplicate a product;
- reorder products;
- bulk toggle availability;
- preview before publish;
- search/filter quickly.

Bulk operations are high leverage and should be considered early even if not all are MVP.
