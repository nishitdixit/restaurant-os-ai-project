-- Storefront themes (ADR-012): per-restaurant look and feel edited in the admin "Appearance" page.
-- Additive only. A brand with no theme renders the classic look with its existing brand colour.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS theme jsonb,
  ADD COLUMN IF NOT EXISTS theme_draft jsonb,
  ADD COLUMN IF NOT EXISTS theme_draft_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS theme_published_at timestamptz;

-- Every published theme is kept so a restaurant can restore an earlier look in one click.
CREATE TABLE IF NOT EXISTS brand_theme_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  brand_id uuid NOT NULL REFERENCES brands(id),
  theme jsonb NOT NULL,
  published_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_theme_versions_brand_idx ON brand_theme_versions (tenant_id, brand_id, created_at DESC);
