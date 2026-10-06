# Pilot UAT Checklist

Run with the restaurant owner before go-live (`roadmap/RELEASE_GATES.md` Gate 2/3). Each line is a
pass/fail check; note the order number where relevant. Payments and messages are in test mode (ADR-010).

## Owner setup (Journey B)

- [ ] Sign up, create the restaurant, land on the setup checklist.
- [ ] Business details saved (Settings → Business).
- [ ] Brand: logo, tagline, about text, brand colour, WhatsApp/Swiggy/Zomato links (Settings → Brand).
- [ ] Kitchen address, phone, opening hours (including a split shift if they have one), prep time (Settings → Kitchen & hours).
- [ ] Delivery areas: pincodes, fee, minimum order and delivery time (Delivery areas).
- [ ] Menu: categories created and ordered; 3+ items with photo, price, food type; one item with a required option group and an optional add-on group.
- [ ] *Preview storefront* shows the unpublished store with a preview banner.
- [ ] Publish is blocked with a clear list until every step is done; then publishes.
- [ ] Invite a kitchen staff member; they sign in and see only the order board and stock toggles.

## Customer ordering (Journey A) — on a phone

- [ ] Home shows open/closed state, delivery time and the *Order direct* button.
- [ ] Menu category chips scroll to sections; search finds a dish.
- [ ] Item with options requires a choice before adding; price updates with options.
- [ ] Cart survives closing and reopening the browser.
- [ ] Checkout: unserviceable pincode is explained before payment, with *Switch to pickup*.
- [ ] Below the area minimum, checkout says how much more to add.
- [ ] Coupon applies; an invalid or used coupon explains why.
- [ ] Place order → test payment → confirmation page with order number and timeline.
- [ ] Payment failure → *Try again* works; no duplicate order appears in admin.
- [ ] Double-tapping *Place order* or refreshing creates only one order.

## Operations (Journeys C, D, F)

- [ ] New paid order appears on the board within 10 s with a sound (after *Turn on sound*).
- [ ] Unpaid orders appear only under *Awaiting payment* and cannot be accepted.
- [ ] Accept → Preparing → Ready → Dispatch (rider name/phone) → Picked up → Delivered; the customer's order page follows along.
- [ ] Pickup order: Ready → Collected.
- [ ] Failed delivery requires a note; *Reassign rider* works.
- [ ] Cancel a paid order with a reason → refunded; customer page shows the reason and refund.
- [ ] Kitchen staff cannot cancel once preparing; a manager can.
- [ ] Partial refund from the order screen; refund appears in the order activity and the audit log.
- [ ] Mark an item out of stock (with "back tomorrow"); storefront shows it unavailable immediately; checkout refuses it.
- [ ] Pause ordering from the top bar; storefront says ordering is paused; resume.
- [ ] Messages screen shows each customer update (confirmed, accepted, ready, on the way, delivered/cancelled).

## Insight

- [ ] Analytics today/7d/30d: paid orders and gross sales match the order list for the same period.
- [ ] Customers list shows repeat customers; customer page shows order history and favourites.
- [ ] Audit log shows price, stock, refund, cancellation and team changes with who and when.

## Search engines (PRD 5.13)

- [ ] `/sitemap.xml` lists the menu, categories and every published item; drafts are absent.
- [ ] `/robots.txt` disallows checkout and order pages.
- [ ] Sharing the storefront link shows the brand share card.
- [ ] Google Rich Results test on a product page shows a valid MenuItem/Restaurant.

Sign-off: owner ____________  date ________   engineer ____________  date ________
