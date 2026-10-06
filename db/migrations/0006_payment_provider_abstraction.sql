-- Payment provider abstraction: explicit lifecycle, refunds, provider references and replay-safe idempotency.
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_message text,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_idempotency_idx
  ON payments(tenant_id, provider, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_idx
  ON payments(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  provider_refund_id text,
  status payment_status NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  idempotency_key text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, payment_id, idempotency_key),
  UNIQUE (provider_refund_id)
);

CREATE INDEX IF NOT EXISTS payment_refunds_tenant_idx ON payment_refunds(tenant_id, created_at);
