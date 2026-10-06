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

## Permission principle

Do not hard-code role checks across the application. Map roles to permissions centrally so roles can evolve.
