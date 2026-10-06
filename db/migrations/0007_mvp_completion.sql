-- MVP completion: merchant profile, catalog media/attributes, checkout rules, order operations,
-- delivery tracking, promotion redemption accounting, notification delivery and a transactional outbox.
-- Additive only: every change is a new table, a new nullable/defaulted column, or a new index.

-- Tenant / brand / outlet profile -------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-IN',
  ADD COLUMN IF NOT EXISTS primary_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_active_uq ON brands (slug) WHERE status = 'ACTIVE';

ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS accepting_orders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_prep_minutes integer NOT NULL DEFAULT 20 CHECK (default_prep_minutes >= 0);

-- Media -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  alt_text text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_tenant_idx ON media_assets (tenant_id, created_at);

-- Catalog ---------------------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS long_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dietary text CHECK (dietary IN ('VEG','NON_VEG','EGG','VEGAN')),
  ADD COLUMN IF NOT EXISTS spice_level smallint CHECK (spice_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS products_tenant_name_idx ON products (tenant_id, lower(name));

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE modifier_groups
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE modifiers
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS product_modifier_groups_group_idx ON product_modifier_groups (modifier_group_id);

-- Customers -------------------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx ON customer_addresses (tenant_id, customer_id, last_used_at);

-- Promotions ------------------------------------------------------------------------------------
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS once_per_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_discount_minor bigint CHECK (max_discount_minor IS NULL OR max_discount_minor > 0),
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE promotion_redemptions
  ADD COLUMN IF NOT EXISTS discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0);
CREATE INDEX IF NOT EXISTS promotion_redemptions_customer_idx ON promotion_redemptions (promotion_id, customer_id);

-- Orders ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_order_counters (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  last_number integer NOT NULL DEFAULT 1000
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number integer,
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS customer_note text,
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES promotions(id),
  ADD COLUMN IF NOT EXISTS promotion_code text,
  ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES delivery_zones(id),
  ADD COLUMN IF NOT EXISTS eta_min integer,
  ADD COLUMN IF NOT EXISTS eta_max integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason_code text,
  ADD COLUMN IF NOT EXISTS cancel_note text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_public_token_uq ON orders (public_token) WHERE public_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_number_uq ON orders (tenant_id, order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_tenant_customer_idx ON orders (tenant_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS orders_tenant_payment_idx ON orders (tenant_id, payment_status, created_at);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS base_price_minor bigint,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

ALTER TABLE order_status_events
  ADD COLUMN IF NOT EXISTS reason_code text;

CREATE TABLE IF NOT EXISTS order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_notes_order_idx ON order_notes (tenant_id, order_id, created_at);

-- Delivery --------------------------------------------------------------------------------------
ALTER TABLE delivery_orders
  ADD COLUMN IF NOT EXISTS rider_name text,
  ADD COLUMN IF NOT EXISTS rider_phone text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE TABLE IF NOT EXISTS delivery_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  delivery_order_id uuid NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  from_status delivery_status,
  to_status delivery_status NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_status_events_idx ON delivery_status_events (delivery_order_id, created_at);

ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Notifications ---------------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'CUSTOMER' CHECK (audience IN ('CUSTOMER','MERCHANT')),
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Transactional outbox: domain events are written in the same transaction as the state change
-- and relayed to the job queue by the worker, so no side effect is lost when Redis is unavailable.
CREATE TABLE IF NOT EXISTS domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  publish_attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS domain_events_unpublished_idx ON domain_events (created_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS domain_events_aggregate_idx ON domain_events (tenant_id, aggregate_type, aggregate_id, created_at);

-- Audit -----------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS audit_events_tenant_entity_idx ON audit_events (tenant_id, entity_type, entity_id, created_at);
