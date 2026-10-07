# Data Model

## Core tables/entities

### Tenant
- id
- name
- status
- default_currency
- created_at
- updated_at

### Brand
- id
- tenant_id
- name
- slug
- logo_asset_id
- metadata

### Outlet
- id
- tenant_id
- brand_id
- name
- address_id
- phone
- timezone
- status

### User
- id
- email/phone identity
- status
- timestamps

### TenantMembership
- id
- tenant_id
- user_id
- role_id
- status

### Role / Permission / RolePermission

### Category
- id
- tenant_id
- outlet/brand applicability
- name
- slug
- sort_order
- status

### Product
- id
- tenant_id
- category_id
- name
- slug
- description
- image_asset_id
- base_price_minor
- currency
- status
- sort_order
- metadata

### ModifierGroup
- id
- tenant_id
- name
- min_selections
- max_selections

### Modifier
- id
- tenant_id
- modifier_group_id
- name
- price_delta_minor
- status

### ProductModifierGroup
- product_id
- modifier_group_id
- sort_order

### AvailabilityOverride
- id
- tenant_id
- product_id
- status
- starts_at
- ends_at
- reason

### Customer
- id
- tenant_id
- name
- phone
- email
- marketing_consent_status
- created_at
- last_order_at

### CustomerAddress
- id
- tenant_id
- customer_id
- address fields
- latitude/longitude if available and appropriate
- delivery_notes

### Cart / CartItem

Carts are mutable and ephemeral. Do not use them as the source of historical order records.

### Order
- id
- tenant_id
- outlet_id
- customer_id
- channel
- status
- payment_status
- fulfillment_type
- currency
- subtotal_minor
- discount_minor
- fee_minor
- tax_minor where applicable
- total_minor
- customer/address snapshots
- created_at
- updated_at

### OrderItem
- id
- order_id
- product_id nullable if product removed later
- product_name_snapshot
- unit_price_minor
- quantity
- line_total_minor
- modifiers snapshot

### Payment
- id
- tenant_id
- order_id
- provider
- provider_payment_id
- status
- amount_minor
- currency
- metadata
- timestamps

### Promotion
- id
- tenant_id
- code
- type
- status
- rules JSON/structured fields
- starts_at
- ends_at
- usage limits

### PromotionRedemption
- id
- tenant_id
- promotion_id
- customer_id
- order_id
- redeemed_at

### DeliveryZone
- id
- tenant_id
- name
- rule type
- rule configuration
- fee_minor
- eta_min/eta_max
- minimum_order_minor
- status

### DeliveryOrder
- id
- tenant_id
- order_id
- provider
- provider_job_id
- status
- pickup/dropoff snapshots
- fees
- tracking URL/reference

### Notification / NotificationAttempt

### AuditEvent

### AnalyticsEvent

## Indexing principles

Index every tenant-owned table on `tenant_id` plus common lookup keys. Examples:

- product: `(tenant_id, slug)`
- customer: `(tenant_id, phone)`
- order: `(tenant_id, created_at)`
- order: `(tenant_id, status, created_at)`
- promotion: `(tenant_id, code)`

## Data immutability

Historical financial/fulfillment snapshots are append-oriented. Corrections are represented through explicit corrective records, not silent mutation of history.

## Soft deletion

Use explicit status/archival for business objects where historical references matter. Avoid generic soft delete everywhere without a retrieval policy.

## Migration 0007 additions (MVP completion)

All additive (`db/migrations/0007_mvp_completion.sql`).

- **tenants**: `legal_name`, `locale`, `primary_contact`, `metadata` (e.g. GSTIN).
- **brands**: `published_at`; unique slug among published brands. Brand profile (tagline, description, cuisines, colour, links) lives in `brands.metadata`.
- **outlets**: `latitude`, `longitude`, `accepting_orders`, `delivery_enabled`, `pickup_enabled`, `default_prep_minutes`.
- **media_assets**: `tenant_id`, `storage_key`, `content_type`, `byte_size`, `alt_text`, `created_by`.
- **products**: `long_description`, `dietary` (VEG/NON_VEG/EGG/VEGAN), `spice_level` (0–3), `allergens[]`, `tags[]`, `published_at`, `archived_at`. Lifecycle: `DRAFT → ACTIVE (published) → ARCHIVED`; availability stays in `availability_overrides` (`INACTIVE` row with optional `ends_at`).
- **categories**: `description`. **modifier_groups**: `description`. **modifiers**: `sort_order`; removed options are `ARCHIVED`, temporarily unavailable ones `INACTIVE`.
- **customers**: `updated_at`, `marketing_consent_at`, `notes`. **customer_addresses**: `last_used_at`.
- **promotions**: `title`, `description`, `once_per_customer`, `max_discount_minor`, `is_public`, `updated_at`. **promotion_redemptions**: `discount_minor`.
- **orders**: `order_number`, `public_token`, `customer_note`, `promotion_id`, `promotion_code`, `delivery_zone_id`, `eta_min`, `eta_max`, `paid_at`, `accepted_at`, `ready_at`, `dispatched_at`, `completed_at`, `cancelled_at`, `cancel_reason_code`, `cancel_note`, `cancelled_by`. **tenant_order_counters** for `order_number`.
- **order_items**: `base_price_minor`, `position`; `modifiers_snapshot` holds group, option id, name and price delta.
- **order_status_events**: `reason_code`. **order_notes**: staff notes.
- **delivery_orders**: `rider_name`, `rider_phone`, `notes`, `assigned_at`, `picked_up_at`, `delivered_at`, `failed_at`, `failure_reason`. **delivery_status_events**: history.
- **delivery_zones**: `sort_order`, `updated_at`; `rule_config` is `{postalCodes: [...]}` or `{radiusKm}`.
- **notifications**: `audience` (CUSTOMER/MERCHANT), `subject`, `body`, `attempt_count`, `last_error`, `sent_at`, `updated_at`.
- **domain_events**: transactional outbox (`event_type`, `aggregate_type`, `aggregate_id`, `payload`, `published_at`, `publish_attempts`).
- **schema_migrations**: applied versions with checksums (`db/scripts/migrate.mjs`).

## Migration 0008 additions (storefront themes, ADR-012)

All additive (`db/migrations/0008_storefront_theme.sql`).

- **brands**: `theme` (published theme, jsonb; NULL = Classic look in the brand colour), `theme_draft`
  (unpublished edits), `theme_draft_updated_at`, `theme_published_at`. Themes are always read through
  `normalizeTheme()` (packages/domain), so older or partial values get safe defaults.
- **brand_theme_versions**: every published theme (`tenant_id`, `brand_id`, `theme`, `published_by`, `created_at`)
  for one-click restore.


## Migration 0009 additions (storefront brand experience, ADR-013)

All additive (`db/migrations/0009_brand_experience.sql`).

- **brands**: `experience` (published homepage composition, site/menu settings and SEO, jsonb; NULL = the default
  composition), `experience_draft`, `policies` (jsonb: refund/terms/privacy/delivery text with `updatedAt`).
  Experiences are always read through `normalizeExperience()` (packages/domain).
- **brand_theme_versions**: `experience` — published together with the theme (NULL for versions published before
  experiences; restoring those keeps the current layout).
- **media_assets**: `kind` (general, logo, hero, product, category, gallery, story, banner), `updated_at`; `alt_text`
  is now edited in the media library and required for homepage photos.
- **categories**: `image_asset_id` (→ media_assets, set null on delete), `name_hi`, `description_hi`.
- **products**: `name_hi`, `description_hi`, `badges` (jsonb, normalised by `normalizeBadges()`; Bestseller is
  computed, never stored).
- **product_media**: extra dish photos after the main one (`tenant_id`, `product_id`, `media_id`, `sort_order`).
- **delivery_zones**: `free_delivery_minimum_minor` (nullable; BUSINESS_RULES P16).
- **tenants.metadata**: `fssai` alongside `gstin`.
- Index `orders (tenant_id, created_at)` for the bestseller query.
