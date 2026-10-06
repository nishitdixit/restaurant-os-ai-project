# Core User Journeys

## Journey A — Local discovery to direct order

Search/social/referral -> storefront landing page -> menu/product -> cart -> address -> delivery eligibility -> coupon -> payment -> order confirmation -> status tracking -> delivery -> repeat order.

Key metrics:

- landing-to-menu;
- menu-to-cart;
- cart-to-checkout;
- checkout-to-paid-order;
- repeat order within 30/60 days.

## Journey B — Owner launches menu

Sign in -> setup wizard -> business profile -> delivery area -> categories -> products -> modifiers -> prices -> availability -> preview -> publish -> storefront live.

The wizard should expose completeness and blockers rather than present a large blank dashboard.

## Journey C — Owner updates stock

Open catalog -> select product -> toggle unavailable -> system validates open carts and future orders -> storefront reflects state -> customer cannot place a new order containing unavailable item.

## Journey D — Order operations

New -> accepted -> preparing -> ready -> packed -> dispatched -> delivered OR cancelled/refunded.

Each transition is timestamped and authorized.

## Journey E — Offer creation

Marketing -> create offer -> define eligibility -> define benefit -> preview -> publish -> monitor -> pause/expire.

## Journey F — Manual delivery dispatch

Order ready -> create delivery job -> choose provider/manual rider -> record booking/reference -> update pickup -> update in-transit -> delivered -> capture proof/reference if available.

## Journey G — Customer retention

Customer orders -> event captured -> customer profile updated -> segment membership -> eligible campaign -> message -> return order -> campaign attribution.

Advanced automation is V2+.
