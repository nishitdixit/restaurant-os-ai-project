# MVP Release Plan

## MVP objective

Enable one real pilot restaurant to accept and fulfil direct orders end-to-end.

## Epic sequence

1. Foundations
2. Tenant/auth
3. Restaurant onboarding
4. Catalog admin
5. Storefront
6. Cart/checkout
7. Payments
8. Orders/admin
9. Delivery zones + manual dispatch
10. Notifications
11. Customers
12. Promotions
13. Analytics
14. SEO hardening
15. Pilot hardening

## Exit criteria

- real paid test order succeeds;
- duplicate submission cannot duplicate order;
- payment webhook retries are safe;
- tenant isolation tests pass;
- merchant can edit product without developer;
- unavailable product cannot be purchased;
- delivery area is enforced;
- customer receives order confirmation;
- admin can track status;
- analytics reconciles with orders;
- public pages have metadata/sitemap/structured data;
- critical flows have automated tests;
- rollback procedure documented.

## Demo scenario

A customer discovers the restaurant, browses a category, selects product + modifier, enters address, sees delivery fee, applies a valid offer, pays, receives confirmation, and the merchant prepares, dispatches and completes the order from admin.
