# Restaurant OS walkthrough — 2026-10-06 1753

Code: not a git repository · Result: all chapters passed

Left: admin (desktop, 1280×800). Right: customer storefront (phone, 430×800). Both run at the same time against
the same API, so changes made in the admin can be watched arriving on the storefront.

How the two stay in sync: the storefront caches public pages briefly — store settings up to ~30 s, the menu up to
~15 s — so a refresh after that shows changes; checkout prices, stock and opening state are always checked live; the admin order board refreshes
every 10 s and the customer's order page every 15 s. Payments and customer messages run in test mode (ADR-010).

Full video: [restaurant-os-walkthrough.mp4](restaurant-os-walkthrough.mp4) (23:16)

| Starts at | Chapter | What it shows | Length | Result |
| --- | --- | --- | --- | --- |
| 0:00 | [01-onboarding](chapters/01-onboarding.mp4) | Owner onboarding | 1:19 | ✅ |
|  |  | A restaurant owner signs up, creates her restaurant and lands on the setup checklist. The storefront isn't public yet. |  |  |
| 1:19 | [02-brand-theme](chapters/02-brand-theme.mp4) | Business details, brand and theme | 1:11 | ✅ |
|  |  | Business details, then the brand: logo, colour, tagline, story, cuisines and order links — and the storefront re-themes. |  |  |
| 2:29 | [03-kitchen-hours](chapters/03-kitchen-hours.mp4) | Kitchen, ordering options and hours | 0:45 | ✅ |
|  |  | Kitchen address and map location, delivery/pickup switches, preparation time and the weekly opening-hours editor. |  |  |
| 3:14 | [04-delivery-areas](chapters/04-delivery-areas.mp4) | Delivery areas | 0:58 | ✅ |
|  |  | Pincode-based and distance-based delivery areas with fee, minimum order and delivery time; validation, edit, deactivate and remove. |  |  |
| 4:13 | [05-menu-building](chapters/05-menu-building.mp4) | Building the menu | 2:41 | ✅ |
|  |  | Categories, option groups (portion size, add-ons), items with photos, food type and spice; drafts vs published; duplicate, reorder and bulk publish. |  |  |
| 6:54 | [06-publish](chapters/06-publish.mp4) | Publishing the storefront | 0:23 | ✅ |
|  |  | With every setup step complete, the owner publishes; the storefront goes live for customers. |  |  |
| 7:17 | [07-offers](chapters/07-offers.mp4) | Offers and coupon codes | 1:25 | ✅ |
|  |  | Fixed and percentage coupons with minimums, caps, first-order-only and hidden codes; validation; pause and resume; the customer offers page. |  |  |
| 8:42 | [08-customer-browsing](chapters/08-customer-browsing.mp4) | A customer browsing the storefront | 1:01 | ✅ |
|  |  | Home, category chips, category and dish pages, search, options, cart drawer and sticky cart bar, delivery areas, contact and the not-found page. |  |  |
| 9:42 | [09-live-sync](chapters/09-live-sync.mp4) | Live changes from the admin to the storefront | 2:14 | ✅ |
|  |  | Price change, out of stock (with automatic return), bulk stock changes, pausing orders, and a price change in the middle of a customer's checkout. |  |  |
| 11:57 | [10-checkout-edge-cases](chapters/10-checkout-edge-cases.mp4) | Checkout edge cases | 1:29 | ✅ |
|  |  | Missing details, an address outside the delivery area, location-based delivery, minimum order, coupon rules, a failed payment and a retry. |  |  |
| 13:26 | [11-order-lifecycle](chapters/11-order-lifecycle.mp4) | From new order to delivered | 1:55 | ✅ |
|  |  | New-order alert on the board, accept → preparing → ready → dispatch with a rider; a failed delivery and reassignment; delivered — while the customer's order page updates by itself. Plus a pickup order through to collected. |  |  |
| 15:20 | [12-cancel-refund](chapters/12-cancel-refund.mp4) | Cancellations, refunds, notes and reordering | 1:25 | ✅ |
|  |  | Cancelling a paid order with a reason and refund, a partial refund, internal notes, and the customer reordering a past order. |  |  |
| 16:45 | [13-team-roles](chapters/13-team-roles.mp4) | Team and roles | 2:09 | ✅ |
|  |  | The owner invites kitchen staff; the cook signs up and sees only what the Kitchen role allows; the owner changes the role, removes and restores access. |  |  |
| 18:54 | [14-insight](chapters/14-insight.mp4) | Analytics, customers, messages and audit log | 0:60 | ✅ |
|  |  | Sales figures that reconcile with orders, the daily chart and its table view, customer history and consent, every customer message, and who changed what. |  |  |
| 19:53 | [15a-payment-expiry](chapters/15a-payment-expiry.mp4) | Unpaid orders expire (part 1) | 0:34 | ✅ |
|  |  | A customer places an order and leaves without paying. It waits under “Awaiting payment”, never on the kitchen board. |  |  |
| 20:28 | [15b-payment-expiry](chapters/15b-payment-expiry.mp4) | Unpaid orders expire (part 2) | 0:21 | ✅ |
|  |  | Six minutes later: the order was cancelled automatically, coupon usage released, and both sides show why. |  |  |
| 20:49 | [16-message-retry](chapters/16-message-retry.mp4) | When a message can't be delivered | 1:03 | ✅ |
|  |  | The messaging provider is down: sends are retried with back-off, then marked Failed and flagged; once it recovers, one click retries. |  |  |
| 21:52 | [17-unpublish](chapters/17-unpublish.mp4) | Taking the storefront offline and back | 1:24 | ✅ |
|  |  | Unpublishing shows customers “Coming soon”; publishing again restores the live store. |  |  |

Folders: `chapters/` side-by-side videos, `raw/` the original admin and storefront recordings,
`traces/` Playwright traces (`npx playwright show-trace <file>`), `logs/` server logs from this run.
