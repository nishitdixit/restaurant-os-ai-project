-- Operational V1 foundations. All records remain tenant-owned.
CREATE TABLE customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
  rule_config jsonb NOT NULL DEFAULT '{}', status business_object_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,name)
);
CREATE TABLE customer_segment_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id), segment_id uuid NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE, computed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(segment_id,customer_id)
);
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), referrer_customer_id uuid NOT NULL REFERENCES customers(id),
  code text NOT NULL, referred_customer_id uuid REFERENCES customers(id), status text NOT NULL DEFAULT 'ACTIVE', reward_minor bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,code)
);
CREATE TABLE reorder_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), customer_id uuid NOT NULL REFERENCES customers(id), source_order_id uuid NOT NULL REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kitchen_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, status business_object_status NOT NULL DEFAULT 'ACTIVE', UNIQUE(tenant_id,name)
);
CREATE TABLE kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), order_id uuid NOT NULL REFERENCES orders(id), station_id uuid REFERENCES kitchen_stations(id),
  status text NOT NULL DEFAULT 'QUEUED', priority integer NOT NULL DEFAULT 0, acknowledged_at timestamptz, started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,station_id)
);
CREATE TABLE custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), hostname text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'PENDING', verification_token text NOT NULL,
  verified_at timestamptz
);
CREATE TABLE billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id), provider text NOT NULL, provider_customer_id text, status text NOT NULL DEFAULT 'TRIAL', plan_code text NOT NULL DEFAULT 'PILOT', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenant_usage_daily (
  tenant_id uuid NOT NULL REFERENCES tenants(id), usage_date date NOT NULL, orders_count integer NOT NULL DEFAULT 0, customers_count integer NOT NULL DEFAULT 0, api_requests integer NOT NULL DEFAULT 0, PRIMARY KEY(tenant_id,usage_date)
);
CREATE TABLE support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), subject text NOT NULL, status text NOT NULL DEFAULT 'OPEN', priority text NOT NULL DEFAULT 'NORMAL', metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), sku text NOT NULL, name text NOT NULL, unit text NOT NULL, on_hand_minor numeric NOT NULL DEFAULT 0, reorder_point numeric NOT NULL DEFAULT 0, status business_object_status NOT NULL DEFAULT 'ACTIVE', UNIQUE(tenant_id,sku)
);
CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), product_id uuid NOT NULL REFERENCES products(id), version integer NOT NULL DEFAULT 1, status business_object_status NOT NULL DEFAULT 'ACTIVE', UNIQUE(product_id,version)
);
CREATE TABLE recipe_components (
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, inventory_item_id uuid NOT NULL REFERENCES inventory_items(id), quantity numeric NOT NULL CHECK(quantity>0), PRIMARY KEY(recipe_id,inventory_item_id)
);
CREATE TABLE inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), inventory_item_id uuid NOT NULL REFERENCES inventory_items(id), delta numeric NOT NULL, reason text NOT NULL, reference_type text, reference_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE procurement_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), supplier_name text NOT NULL, status text NOT NULL DEFAULT 'DRAFT', expected_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE procurement_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_order_id uuid NOT NULL REFERENCES procurement_orders(id) ON DELETE CASCADE, inventory_item_id uuid NOT NULL REFERENCES inventory_items(id), quantity numeric NOT NULL CHECK(quantity>0), unit_cost_minor bigint NOT NULL CHECK(unit_cost_minor>=0)
);
CREATE INDEX customer_segments_tenant_idx ON customer_segments(tenant_id);
CREATE INDEX kitchen_tickets_tenant_status_idx ON kitchen_tickets(tenant_id,status,created_at);
CREATE INDEX custom_domains_tenant_idx ON custom_domains(tenant_id);
CREATE INDEX tenant_usage_date_idx ON tenant_usage_daily(tenant_id,usage_date);
CREATE INDEX inventory_tenant_idx ON inventory_items(tenant_id,status);
CREATE INDEX inventory_ledger_tenant_time_idx ON inventory_ledger(tenant_id,created_at);
CREATE INDEX procurement_tenant_idx ON procurement_orders(tenant_id,status,created_at);
