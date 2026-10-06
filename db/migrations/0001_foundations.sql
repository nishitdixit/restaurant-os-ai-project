-- Restaurant OS Phase 0 foundation schema.
-- Tenant-owned records carry tenant_id explicitly. Monetary values are integer minor units.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'DEACTIVATED');
CREATE TYPE membership_status AS ENUM ('ACTIVE', 'DEACTIVATED');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status tenant_status NOT NULL DEFAULT 'ACTIVE',
  default_currency char(3) NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_identity_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE phone IS NOT NULL;

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  status membership_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX tenant_memberships_tenant_user_idx ON tenant_memberships (tenant_id, user_id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  actor_user_id uuid REFERENCES users(id),
  event_name text NOT NULL,
  entity_type text,
  entity_id uuid,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_created_idx ON audit_events (tenant_id, created_at);

INSERT INTO roles (name, description) VALUES
  ('OWNER', 'All tenant permissions except platform-level destructive actions.'),
  ('MANAGER', 'Operational management permissions.'),
  ('KITCHEN', 'Kitchen operations permissions.'),
  ('STAFF', 'Limited operational permissions.'),
  ('PLATFORM_ADMIN', 'Platform support and administration permissions.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (code, description) VALUES
  ('tenant.read', 'Read tenant configuration'),
  ('tenant.manage', 'Manage tenant configuration'),
  ('catalog.read', 'Read catalog'),
  ('catalog.manage', 'Manage catalog'),
  ('availability.manage', 'Manage product availability'),
  ('order.read', 'Read orders'),
  ('order.manage', 'Manage orders'),
  ('customer.read', 'Read customers'),
  ('customer.manage', 'Manage customers'),
  ('promotion.manage', 'Manage promotions'),
  ('delivery.manage', 'Manage delivery'),
  ('analytics.read', 'Read analytics'),
  ('integration.manage', 'Manage integrations'),
  ('billing.manage', 'Manage billing'),
  ('audit.read', 'Read audit events')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'OWNER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code IN (
  'tenant.read','catalog.read','catalog.manage','availability.manage','order.read','order.manage',
  'customer.read','customer.manage','promotion.manage','delivery.manage','analytics.read'
)
WHERE r.name = 'MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('catalog.read','availability.manage','order.read','order.manage') WHERE r.name='KITCHEN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('catalog.read','order.read','order.manage') WHERE r.name='STAFF'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='PLATFORM_ADMIN'
ON CONFLICT DO NOTHING;
