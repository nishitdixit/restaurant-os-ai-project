-- Storefront brand experience (ADR-013): homepage composition and content, a media library, dish badges and extra
-- photos, Hindi copy, category images, free-delivery thresholds, FSSAI and policy pages.
-- Additive only: new tables, and new nullable/defaulted columns. A brand with no experience renders the default
-- composition (packages/domain defaultExperience()), so existing restaurants are unchanged until they edit.

-- Experience: published + draft, versioned together with the theme -------------------------------------------
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS experience jsonb,
  ADD COLUMN IF NOT EXISTS experience_draft jsonb,
  ADD COLUMN IF NOT EXISTS policies jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Each published version keeps the theme and the experience that were live together, so a restore never pairs a
-- theme with a layout it wasn't designed with. NULL = published before experiences existed (default layout).
ALTER TABLE brand_theme_versions
  ADD COLUMN IF NOT EXISTS experience jsonb;

-- Media library -------------------------------------------------------------------------------------------------
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general'
    CHECK (kind IN ('general','logo','hero','product','category','gallery','story','banner')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Catalog: category photos, Hindi names, dish badges, extra dish photos ----------------------------------------
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name_hi text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_hi text NOT NULL DEFAULT '';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS name_hi text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_hi text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS badges jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Extra photos after the main one (products.image_asset_id stays the main photo for backward compatibility).
CREATE TABLE IF NOT EXISTS product_media (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, media_id)
);
CREATE INDEX IF NOT EXISTS product_media_tenant_idx ON product_media (tenant_id, product_id, sort_order);

-- Delivery: free delivery above an order value (BUSINESS_RULES P16, pending owner sign-off) --------------------
ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS free_delivery_minimum_minor bigint CHECK (free_delivery_minimum_minor IS NULL OR free_delivery_minimum_minor > 0);

-- Bestsellers read paid orders by tenant and time; order_items by order already has an index.
CREATE INDEX IF NOT EXISTS orders_tenant_created_idx ON orders (tenant_id, created_at);
