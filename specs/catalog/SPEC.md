# Catalog Spec

## Goal

Merchant can manage categories, products, modifiers, images, prices and availability.

## Key flows

Create product -> validate required fields -> save draft -> preview -> publish.

Update price -> requires confirmation when impact is material -> audit event.

Toggle availability -> immediate server-side state change -> storefront updates.

## Acceptance

Historical orders remain unchanged after catalog edits.
