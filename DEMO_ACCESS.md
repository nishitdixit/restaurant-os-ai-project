# Restaurant OS Demo

Welcome! This is a working demo of Restaurant OS, set up as a sample restaurant called **Saffron Street Kitchen**: a
pure-vegetarian North and South Indian cloud kitchen in Koramangala, Bengaluru. It already has a full menu, customers
and about two months of orders, so every screen has real-looking data to explore.

**Storefront** (what your customers see; works well on a mobile phone)
https://restaurant-os-ai-project.vercel.app

**Admin** (where you run the restaurant; best on a laptop or tablet)
https://restaurant-os-ai-project-admin.vercel.app

> **This is a demonstration environment.**
> - All payments are **test payments**. No real money moves, and you never need a card or UPI.
> - **No WhatsApp, SMS or email is ever sent.** Messaging is simulated. Admin → Messages shows a sample history of the
>   updates customers would receive, so you can see what they look like.
> - **Don't enter real customer or payment details.** Use made-up names and a phone number like `9000000000`.
> - **Demo data may be reset at any time**, which undoes your changes. Feel free to experiment.

---

## Demo accounts

Every account uses the same password. Sign in on the **Admin** link above.

If the sign-in page asks for a **verification code**, enter **`424242`**. (These are demo accounts, so no email is sent.)

| Role | Email | Password | Use it to explore |
| --- | --- | --- | --- |
| **Owner** | `demo-owner+clerk_test@example.com` | `SaffronDemo#2026` | Everything: orders, menu, offers, delivery areas, customers, analytics, messages, website design (Appearance), team and audit log. **Start here.** |
| **Manager** | `demo-manager+clerk_test@example.com` | `SaffronDemo#2026` | Day-to-day running: orders, menu, offers, delivery areas, customers and analytics. Can see, but not change, the website design, business settings and team, and has no audit log. |
| **Kitchen** | `demo-kitchen+clerk_test@example.com` | `SaffronDemo#2026` | The kitchen's view: the order board (accept, prepare, mark ready), marking dishes in or out of stock, and entering phone/WhatsApp orders. |
| **Staff** | `demo-staff+clerk_test@example.com` | `SaffronDemo#2026` | Counter or front-desk staff: the order board and entering walk-in, phone and WhatsApp orders. No access to sales figures or settings. |

To switch roles, click your profile picture at the top right, choose **Sign out**, then sign in with another account.

---

## Try this first (about 10 minutes)

1. **Open the Storefront.** This is the restaurant's own website, where customers order without Swiggy or Zomato.
2. **Browse the menu.** Try the category tabs, search for "paneer", and switch on **Veg only**. Open **Veg Dum Biryani**
   and pick a portion, a spice level and an add-on.
3. **Place a test order.** Add it to your cart and open checkout. You can choose either:
   - **Delivery**: use pincode **560095** (Koramangala). Other pincodes that work are listed below.
   - **Pickup**: no address needed.

   Apply the coupon **`SAFFRON20`**, place the order, and tap **Pay** on the test payment page. You'll see your order
   confirmation and a live tracking page.
4. **Open the Admin.**
5. **Log in as the Owner** (see the table above).
6. **Open Orders.** Your order is waiting in the **New** column, next to orders at every other stage.
7. **Manage the order.** Click **Accept**, then **Start preparing** and **Mark ready**. For a delivery order, click
   **Dispatch…**, enter any rider name, then **Delivered**. Watch the tracking page from step 3 update.
8. **Open Appearance and change the design.** Try another style, change the colours, or edit the homepage sections in
   **Homepage**. The preview on the right updates as you go. Nothing changes on the live website until you click **Publish**.
9. **Explore Menu, Customers, Analytics and Offers.** Mark a dish out of stock and see it greyed out on the website,
   open a regular customer's order history, check the last 30 days of sales, or create your own coupon.

---

## What's in the demo

| Screen | What you'll find |
| --- | --- |
| **Home** | Today's sales and the orders that still need work |
| **Orders** | A live board with orders at every stage (new, accepted, preparing, ready, out for delivery), orders waiting for payment, and two months of completed and cancelled orders. **New order** enters a phone, WhatsApp or walk-in order. |
| **Menu** | 39 vegetarian dishes in 9 categories, with photos, prices, spice levels, allergens, tags and badges. Option groups include portion size, spice level and add-ons. Two dishes are out of stock, and one is an unpublished draft. |
| **Offers** | Live coupons, a staff-only discount, an expired offer and a paused offer |
| **Delivery areas** | Three areas with different fees, minimum orders and free-delivery limits |
| **Customers** | About 25 regular and new customers, with saved addresses, notes and order history |
| **Analytics** | Sales, orders, average order value, new and repeat customers, best-selling dishes, sales by channel, and offer usage for today, 7, 30 or 90 days |
| **Messages** | A sample history of the order updates customers would receive on WhatsApp and email, plus alerts for the restaurant. Nothing here was really sent. A couple of entries show what a failed message looks like. |
| **Appearance** | The website's style, colours, fonts, homepage sections, photos and live preview, with a version history you can restore |
| **Settings** | Business details, opening hours, policies, **Team** (roles and invitations) and **Audit log** (who changed what) |

**Coupons to try:** `SAFFRON20` (20% off orders over ₹499, up to ₹120), `FEAST100` (₹100 off orders over ₹999),
`WELCOME50` (₹50 off a first order over ₹299; use a phone number that hasn't ordered before).

**Pincodes that get delivery:**

| Area | Pincodes |
| --- | --- |
| Koramangala and Ejipura | 560095, 560034, 560047 |
| HSR Layout, BTM and Madiwala | 560102, 560076, 560068 |
| Indiranagar and Domlur | 560038, 560008, 560071 |

Any other pincode shows "we don't deliver here", which is also worth seeing.

The restaurant is set to be open around the clock so you can try ordering at any time. You can change the hours in
Settings → Kitchen & hours.

The dish pictures are simple illustrations made for this demo. A real restaurant uploads its own food photos, which you
can try under Menu (edit a dish) or Appearance → Photos.

---

## Which device to use

- **Storefront:** made for phones. Open it on your mobile to see what your customers see. It also works on a laptop.
- **Admin:** best on a **laptop or tablet** (landscape). It also opens on a phone, which is handy for a quick look at
  orders, but the order board and the Appearance editor need a wider screen to be comfortable.

## Known demo limitations

To keep this showcase free to run, it has no background processing service. Everything you try in the steps above works
without it: browsing, cart, coupons, checkout, test payment, order tracking, the order board, menu and stock changes,
offers, delivery areas, customers, analytics, Appearance and team settings.

These parts depend on that background service, so they don't run in this demo:

- **Messages for new orders.** Orders you place don't add new entries to Admin → Messages. The sample history is there to
  explore. The checkout page mentions order updates on WhatsApp/SMS, but none are sent; follow your order on its tracking
  page instead.
- **Retry on failed messages.** **Retry** marks the message as pending again, but it is never re-sent.
- **Automatic expiry of unpaid orders.** In a live restaurant, an order that isn't paid within 30 minutes is cancelled
  automatically. Here, unpaid orders stay under **Awaiting payment** until the demo is reset.

A real restaurant's setup includes the background service, so all of the above works there.
