-- Staff-created orders and staff-only offers (ADR-014).
-- Additive only: new nullable/defaulted columns. Existing orders are website orders (created_by_user_id NULL, paid
-- online) and existing offers keep their visibility (staff_only false).

-- Offers: "Who can use it" = shown to everyone (is_public), code only (NOT is_public), or staff only (staff_only).
-- A staff-only offer is never listed on the storefront and its code is rejected at website checkout.
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS staff_only boolean NOT NULL DEFAULT false;

-- Orders entered by staff from the dashboard (WhatsApp, phone, walk-in, other).
--   created_by_user_id: the staff member who entered it (NULL = placed by the customer on the website).
--   payment_method: how a staff-entered order was or will be paid. NULL = paid online at website checkout.
--     PAY_LATER becomes CASH / UPI / CARD when staff mark it paid.
--   notify_customer: send order updates to the customer (staff can switch it off, e.g. walk-ins).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IS NULL OR payment_method IN ('CASH','UPI','CARD','PAY_LATER')),
  ADD COLUMN IF NOT EXISTS notify_customer boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS orders_tenant_channel_idx ON orders (tenant_id, channel, created_at);

-- Who applied an offer: NULL = the customer at website checkout, else the staff member on a staff-entered order.
ALTER TABLE promotion_redemptions
  ADD COLUMN IF NOT EXISTS applied_by_user_id uuid REFERENCES users(id);

-- Permission to enter orders from the dashboard: every restaurant role (Owner, Manager, Kitchen, Staff) and platform
-- admins. Mirrors apps/api/src/auth/permissions.ts.
INSERT INTO permissions (code, description) VALUES
  ('order.create', 'Enter orders that reached the restaurant directly (WhatsApp, phone, walk-in).')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'order.create'
WHERE r.name IN ('OWNER', 'MANAGER', 'KITCHEN', 'STAFF', 'PLATFORM_ADMIN')
ON CONFLICT DO NOTHING;
