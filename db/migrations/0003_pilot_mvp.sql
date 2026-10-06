-- Phase 1 Pilot MVP: tenant-owned commerce and operations data.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE business_object_status AS ENUM ('DRAFT','ACTIVE','ARCHIVED','INACTIVE');
CREATE TYPE order_status AS ENUM ('NEW','ACCEPTED','PREPARING','READY','PACKED','DISPATCHED','DELIVERED','CANCELLED');
CREATE TYPE payment_status AS ENUM ('INITIATED','REQUIRES_ACTION','AUTHORIZED','CAPTURED','FAILED','EXPIRED','REFUNDED');
CREATE TYPE fulfillment_type AS ENUM ('DELIVERY','PICKUP');
CREATE TYPE delivery_status AS ENUM ('PENDING','ASSIGNED','PICKED_UP','DELIVERED','FAILED','CANCELLED');
CREATE TYPE promotion_type AS ENUM ('FIXED','PERCENTAGE');
CREATE TYPE notification_status AS ENUM ('PENDING','SENT','FAILED','CANCELLED');

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL, slug text NOT NULL, logo_asset_id text, metadata jsonb NOT NULL DEFAULT '{}',
  status business_object_status NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TABLE outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), brand_id uuid NOT NULL REFERENCES brands(id),
  name text NOT NULL, phone text, timezone text NOT NULL DEFAULT 'Asia/Kolkata', status business_object_status NOT NULL DEFAULT 'DRAFT',
  address jsonb NOT NULL DEFAULT '{}', hours jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), outlet_id uuid REFERENCES outlets(id),
  name text NOT NULL, slug text NOT NULL, sort_order integer NOT NULL DEFAULT 0, status business_object_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, slug)
);
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), category_id uuid NOT NULL REFERENCES categories(id),
  name text NOT NULL, slug text NOT NULL, description text NOT NULL DEFAULT '', image_asset_id text,
  base_price_minor bigint NOT NULL CHECK (base_price_minor >= 0), currency char(3) NOT NULL DEFAULT 'INR',
  status business_object_status NOT NULL DEFAULT 'DRAFT', sort_order integer NOT NULL DEFAULT 0, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, slug)
);
CREATE TABLE modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
  min_selections integer NOT NULL DEFAULT 0 CHECK (min_selections >= 0), max_selections integer NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
  status business_object_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id),
  name text NOT NULL, price_delta_minor bigint NOT NULL DEFAULT 0, status business_object_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_modifier_groups (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0, PRIMARY KEY (product_id, modifier_group_id)
);
CREATE TABLE availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status business_object_status NOT NULL DEFAULT 'ACTIVE', starts_at timestamptz, ends_at timestamptz, reason text NOT NULL DEFAULT '',
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
  phone text, email text, marketing_consent_status text NOT NULL DEFAULT 'UNKNOWN', created_at timestamptz NOT NULL DEFAULT now(), last_order_at timestamptz,
  UNIQUE (tenant_id, phone), UNIQUE (tenant_id, email)
);
CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text, line1 text NOT NULL, line2 text, city text NOT NULL, region text, postal_code text NOT NULL, country_code char(2) NOT NULL DEFAULT 'IN',
  latitude numeric(9,6), longitude numeric(9,6), delivery_notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('POSTAL_CODE','RADIUS')), rule_config jsonb NOT NULL,
  fee_minor bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0), eta_min integer NOT NULL DEFAULT 30 CHECK (eta_min >= 0), eta_max integer NOT NULL DEFAULT 60 CHECK (eta_max >= eta_min),
  minimum_order_minor bigint NOT NULL DEFAULT 0 CHECK (minimum_order_minor >= 0), status business_object_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), code text NOT NULL,
  type promotion_type NOT NULL, value bigint NOT NULL CHECK (value > 0), status business_object_status NOT NULL DEFAULT 'ACTIVE',
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, minimum_order_minor bigint NOT NULL DEFAULT 0 CHECK (minimum_order_minor >= 0),
  new_customer_only boolean NOT NULL DEFAULT false, usage_cap integer CHECK (usage_cap IS NULL OR usage_cap > 0), usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, code), CHECK (ends_at > starts_at), CHECK (type <> 'PERCENTAGE' OR value <= 100)
);
CREATE TABLE promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), promotion_id uuid NOT NULL REFERENCES promotions(id),
  customer_id uuid REFERENCES customers(id), order_id uuid, redeemed_at timestamptz NOT NULL DEFAULT now(), UNIQUE (promotion_id, order_id)
);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), customer_id uuid REFERENCES customers(id), currency char(3) NOT NULL DEFAULT 'INR',
  promotion_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0), modifiers jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (cart_id, product_id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), outlet_id uuid NOT NULL REFERENCES outlets(id), customer_id uuid REFERENCES customers(id),
  channel text NOT NULL DEFAULT 'DIRECT', status order_status NOT NULL DEFAULT 'NEW', payment_status payment_status NOT NULL DEFAULT 'INITIATED',
  fulfillment_type fulfillment_type NOT NULL, currency char(3) NOT NULL, subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0), discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  fee_minor bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0), tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0), total_minor bigint NOT NULL CHECK (total_minor >= 0),
  customer_snapshot jsonb NOT NULL, address_snapshot jsonb, idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id uuid REFERENCES products(id),
  product_name_snapshot text NOT NULL, unit_price_minor bigint NOT NULL, quantity integer NOT NULL CHECK (quantity > 0), line_total_minor bigint NOT NULL, modifiers_snapshot jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status, to_status order_status NOT NULL, actor_user_id uuid REFERENCES users(id), note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL, provider_payment_id text, status payment_status NOT NULL DEFAULT 'INITIATED', amount_minor bigint NOT NULL CHECK (amount_minor >= 0), currency char(3) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (provider, provider_payment_id)
);
CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), provider text NOT NULL, provider_event_id text NOT NULL,
  event_type text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (provider, provider_event_id)
);
CREATE TABLE delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), order_id uuid NOT NULL REFERENCES orders(id), provider text NOT NULL DEFAULT 'MANUAL',
  provider_job_id text, status delivery_status NOT NULL DEFAULT 'PENDING', pickup_snapshot jsonb NOT NULL, dropoff_snapshot jsonb NOT NULL, fee_minor bigint NOT NULL DEFAULT 0,
  tracking_reference text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (order_id)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), order_id uuid REFERENCES orders(id), channel text NOT NULL, template text NOT NULL,
  recipient text NOT NULL, status notification_status NOT NULL DEFAULT 'PENDING', domain_event_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, domain_event_id, channel, recipient)
);
CREATE TABLE notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE, attempt_no integer NOT NULL, status notification_status NOT NULL,
  provider_reference text, error_code text, attempted_at timestamptz NOT NULL DEFAULT now(), UNIQUE (notification_id, attempt_no)
);
CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), event_name text NOT NULL, order_id uuid REFERENCES orders(id), customer_id uuid REFERENCES customers(id),
  properties jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX brands_tenant_idx ON brands(tenant_id);
CREATE INDEX outlets_tenant_idx ON outlets(tenant_id);
CREATE INDEX categories_tenant_idx ON categories(tenant_id, sort_order);
CREATE INDEX products_tenant_idx ON products(tenant_id, category_id, status, sort_order);
CREATE INDEX modifiers_tenant_idx ON modifiers(tenant_id, modifier_group_id);
CREATE INDEX availability_tenant_product_idx ON availability_overrides(tenant_id, product_id, starts_at, ends_at);
CREATE INDEX customers_tenant_idx ON customers(tenant_id, last_order_at);
CREATE INDEX orders_tenant_created_idx ON orders(tenant_id, created_at);
CREATE INDEX orders_tenant_status_idx ON orders(tenant_id, status, created_at);
CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE INDEX status_events_order_idx ON order_status_events(order_id, created_at);
CREATE INDEX payments_tenant_order_idx ON payments(tenant_id, order_id, created_at);
CREATE INDEX delivery_tenant_status_idx ON delivery_orders(tenant_id, status, created_at);
CREATE INDEX notifications_tenant_status_idx ON notifications(tenant_id, status, created_at);
CREATE INDEX analytics_tenant_time_idx ON analytics_events(tenant_id, occurred_at);

-- Seed one canonical pilot tenant only when the database is empty. This is development bootstrap data, not application hardcoding.
INSERT INTO tenants (name, status, default_currency)
SELECT 'Pilot Restaurant', 'ACTIVE', 'INR'
WHERE NOT EXISTS (SELECT 1 FROM tenants);
