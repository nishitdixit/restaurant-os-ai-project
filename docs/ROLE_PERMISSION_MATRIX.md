# Role / Permission Matrix

## Suggested roles

### OWNER

All tenant permissions except destructive platform-level actions.

### MANAGER

Orders, catalog, availability, promotions, customers, delivery, analytics.

### KITCHEN

Orders and availability relevant to kitchen work. No customer export, billing or integration secrets.

### STAFF

Limited operational permissions defined by merchant configuration.

### PLATFORM_ADMIN

Platform tenant/support operations. Must be strongly audited and protected.

## Entering orders (ADR-014)

`order.create` — enter WhatsApp / phone / walk-in orders from the dashboard, apply any live offer (including
staff-only offers) and look up a customer by exact phone number: OWNER, MANAGER, KITCHEN, STAFF.
Creating and editing offers (including staff-only ones) stays `promotion.manage`: OWNER, MANAGER.
Marking a "pay later" order paid is `order.manage` (everyone who handles orders).

## Permission principle

Do not hard-code role checks across the application. Map roles to permissions centrally so roles can evolve.
