# Product Requirements Document

## 1. Product

Restaurant OS — a multi-tenant, delivery-first SaaS for food businesses.

## 2. Target customers

Primary: independent cloud kitchens and small delivery-first restaurants in India.

Secondary: cafes, bakeries, tiffin businesses, food trucks, small restaurant groups and multi-brand kitchens.

## 3. Primary personas

See `docs/PERSONAS.md`.

## 4. Core jobs to be done

### Owner

- Launch an online storefront without depending on a developer.
- Update products, prices and availability quickly.
- See what is selling and where money is being made/lost.
- Manage offers and repeat customers.
- Handle orders and delivery with minimal manual coordination.

### Customer

- Discover a nearby business or a specific item.
- Understand menu, price, availability and delivery eligibility quickly.
- Place a direct order with minimal friction.
- Know order status and expected timing.
- Return later and receive relevant offers without feeling spammed.

### Kitchen operator

- See incoming orders clearly.
- Know what must be prepared and by when.
- Prevent accepting orders for unavailable items.
- Mark orders through preparation and packing states.

### Admin / manager

- Maintain catalog, promotions, users, locations and integrations.
- Investigate operational and financial anomalies.

## 5. MVP functional requirements

### 5.1 Tenant onboarding

The system must allow creation of a tenant with:

- business name;
- legal/business metadata as needed;
- brand name;
- logo and brand assets;
- primary contact;
- address/service area;
- opening hours;
- delivery settings;
- order channels;
- currency and locale.

### 5.2 Public storefront

Must include:

- responsive home page;
- menu/category navigation;
- search;
- product detail;
- add-ons/modifiers;
- availability states;
- cart;
- checkout;
- order confirmation;
- order status page;
- contact/WhatsApp action;
- external marketplace links where configured.

### 5.3 Catalog administration

Owner can create/update/archive:

- categories;
- products;
- product images;
- variants where needed;
- modifiers/add-ons;
- prices;
- dietary/attribute metadata;
- sort order;
- active/inactive state;
- stock/availability override.

### 5.4 Order management

Admin must see orders from the internal order system with:

- channel;
- customer;
- line items;
- pricing breakdown;
- payment state;
- fulfillment method;
- delivery address;
- order status;
- timestamps;
- notes;
- audit history.

### 5.5 Checkout

Customer must be able to:

- identify delivery address;
- validate delivery zone;
- see fees and minimum order rules;
- review item/modifier quantities;
- apply eligible coupon;
- choose payment method;
- place order;
- receive confirmation.

### 5.6 Payments

Use provider abstraction. Initial India implementation may use Razorpay or another approved provider. Do not hard-code provider semantics into the order domain.

### 5.7 Offers

MVP supports simple rule types:

- fixed amount off;
- percentage off;
- minimum cart value;
- new-customer eligibility;
- one-time-per-customer eligibility;
- expiry;
- usage limits.

### 5.8 Delivery zones

Merchant can configure service areas using simple radius/zone rules in MVP. Checkout must fail early when address is outside service area.

### 5.9 Availability

Products can be manually switched on/off. Availability must be checked server-side during cart validation and order creation.

### 5.10 Customer records

Store first-party customer identity and order history generated through supported channels.

### 5.11 Analytics

MVP dashboard:

- gross sales;
- order count;
- average order value;
- completed/cancelled/refunded orders;
- channel mix for orders recorded by the platform;
- top products;
- repeat customer count;
- basic daily trend.

### 5.12 Notifications

MVP events:

- order confirmation;
- payment confirmation/failure;
- order accepted;
- order ready;
- order dispatched;
- order delivered/cancelled.

Notification providers must be abstracted.

### 5.13 SEO foundation

Storefront must support:

- metadata;
- canonical URLs;
- sitemap;
- robots rules;
- structured data for local business/restaurant and appropriate product/menu representations;
- clean URLs;
- fast rendering;
- indexable product/category pages where appropriate;
- share cards.

No ranking guarantee.

## 6. Quality requirements

### Performance

- public pages should render quickly on typical mobile networks;
- minimize JavaScript on public content pages;
- images optimized and responsive;
- API endpoints should have explicit latency budgets.

### Reliability

- order creation must be idempotent;
- payment webhooks must be idempotent;
- status transitions validated server-side;
- no double order creation on repeated customer actions.

### Security

- tenant isolation is mandatory;
- authorization must be server-side;
- secrets never reach client bundles;
- audit sensitive admin mutations;
- rate-limit public abuse-prone endpoints.

### Accessibility

Public customer flows target WCAG 2.2 AA principles where practical.

## 7. Success metrics

North-star: **monthly direct contribution value generated through the platform**.

Supporting metrics:

- storefront-to-checkout conversion;
- checkout-to-order conversion;
- direct orders per tenant;
- repeat order rate;
- average order value;
- order cancellation rate;
- stock-out frequency;
- average preparation time;
- active tenants;
- tenant retention;
- support tickets per tenant.

## 8. MVP acceptance bar

A real pilot restaurant can:

1. configure business profile;
2. publish menu;
3. toggle stock;
4. receive a real paid direct order;
5. manage the order through completion;
6. manually dispatch delivery;
7. see customer and basic sales analytics;
8. appear technically well-formed to search engines;
9. repeat the workflow without developer intervention.

## 9. Product risks

- scope explosion into ERP;
- third-party API availability/terms;
- weak merchant onboarding;
- poor direct-order conversion;
- inaccurate delivery pricing/ETA;
- multi-tenant data leakage;
- SEO expectations exceeding controllable inputs;
- excessive operational complexity for small businesses.

## 10. Future requirements

See `roadmap/ROADMAP.md` and `roadmap/FUTURE.md`.
