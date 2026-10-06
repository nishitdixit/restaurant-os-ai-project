-- V1 growth capabilities: campaigns, domains, billing, provider jobs and richer tenant controls.
CREATE TABLE messaging_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, channel text NOT NULL,
  segment_id uuid REFERENCES customer_segments(id), message_template text NOT NULL, status text NOT NULL DEFAULT 'DRAFT', scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE messaging_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), campaign_id uuid NOT NULL REFERENCES messaging_campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id), status notification_status NOT NULL DEFAULT 'PENDING', provider_reference text, sent_at timestamptz, UNIQUE(campaign_id,customer_id)
);
CREATE TABLE delivery_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), provider text NOT NULL, encrypted_credentials_ref text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,provider)
);
CREATE TABLE delivery_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), provider text NOT NULL, provider_event_id text NOT NULL,
  event_type text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,provider_event_id)
);
CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), provider text NOT NULL, provider_event_id text NOT NULL,
  event_type text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,provider_event_id)
);
CREATE TABLE tenant_entitlements (
  tenant_id uuid NOT NULL REFERENCES tenants(id), feature_code text NOT NULL, enabled boolean NOT NULL DEFAULT true, limit_value bigint,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,feature_code)
);
CREATE TABLE platform_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), actor_user_id uuid REFERENCES users(id), note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messaging_campaigns_tenant_status_idx ON messaging_campaigns(tenant_id,status,created_at);
CREATE INDEX delivery_provider_events_tenant_time_idx ON delivery_provider_events(tenant_id,created_at);
CREATE INDEX billing_events_tenant_time_idx ON billing_events(tenant_id,created_at);
