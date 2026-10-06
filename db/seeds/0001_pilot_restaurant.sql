-- Deterministic pilot restaurant development data.
-- Every row has a fixed id and is upserted, so re-running converges to the same state
-- without touching rows the application created (orders, customers, extra products, ...).
-- Requires all migrations to be applied. Money is in INR minor units (paise).
-- Safe to re-run: it converges catalog/settings rows to these values but never touches orders or customers.
--
-- Fixed ids (referenced by docs and env examples):
--   tenant  10000000-0000-4000-8000-000000000001
--   brand   20000000-0000-4000-8000-000000000001  (slug: pilot)
--   outlet  30000000-0000-4000-8000-000000000001

-- 0003_pilot_mvp.sql inserts a 'Pilot Restaurant' tenant with a random id on an empty
-- database. Adopt that row under the fixed id while nothing references it yet, so the
-- database ends up with exactly one pilot tenant rather than two.
UPDATE tenants SET id = '10000000-0000-4000-8000-000000000001'
WHERE name = 'Pilot Restaurant'
  AND id <> '10000000-0000-4000-8000-000000000001'
  AND (SELECT count(*) FROM tenants) = 1
  AND NOT EXISTS (SELECT 1 FROM brands)
  AND NOT EXISTS (SELECT 1 FROM tenant_memberships)
  AND NOT EXISTS (SELECT 1 FROM audit_events);

INSERT INTO tenants (id, name, status, default_currency) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Pilot Restaurant', 'ACTIVE', 'INR')
ON CONFLICT (id) DO UPDATE SET name = excluded.name, status = excluded.status, default_currency = excluded.default_currency, updated_at = now();

INSERT INTO brands (id, tenant_id, name, slug, metadata, status) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Pilot Kitchen', 'pilot',
   '{"tagline":"Biryani and curries, cooked fresh for delivery","description":"A delivery-first kitchen in Indiranagar cooking dum biryani, North Indian curries and fresh tandoor breads.","cuisines":["Biryani","North Indian"],"primaryColor":"#b42318","links":{"whatsapp":"+919800000000","swiggy":"","zomato":"","instagram":"","website":""}}', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET name = excluded.name, slug = excluded.slug, metadata = excluded.metadata, status = excluded.status, published_at = coalesce(brands.published_at, now()), updated_at = now();

INSERT INTO outlets (id, tenant_id, brand_id, name, phone, timezone, status, address, hours) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Pilot Kitchen — Indiranagar', '+919800000000', 'Asia/Kolkata', 'ACTIVE',
   '{"line1":"12, 100 Feet Road","city":"Bengaluru","region":"Karnataka","postalCode":"560038","countryCode":"IN"}',
   '{"mon":[["11:00","23:00"]],"tue":[["11:00","23:00"]],"wed":[["11:00","23:00"]],"thu":[["11:00","23:00"]],"fri":[["11:00","23:30"]],"sat":[["11:00","23:30"]],"sun":[["11:00","23:00"]]}')
ON CONFLICT (id) DO UPDATE SET brand_id = excluded.brand_id, name = excluded.name, phone = excluded.phone, timezone = excluded.timezone,
  status = excluded.status, address = excluded.address, hours = excluded.hours, updated_at = now();

UPDATE outlets SET latitude = 12.978400, longitude = 77.640800, accepting_orders = true, delivery_enabled = true, pickup_enabled = true, default_prep_minutes = 20
WHERE id = '30000000-0000-4000-8000-000000000001';

INSERT INTO categories (id, tenant_id, outlet_id, name, slug, sort_order, status) VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Biryani',   'biryani',   10, 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Curries',   'curries',   20, 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Breads',    'breads',    30, 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Beverages', 'beverages', 40, 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET outlet_id = excluded.outlet_id, name = excluded.name, slug = excluded.slug, sort_order = excluded.sort_order, status = excluded.status, updated_at = now();

INSERT INTO products (id, tenant_id, category_id, name, slug, description, base_price_minor, currency, status, sort_order, metadata) VALUES
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Chicken Dum Biryani',   'chicken-dum-biryani',   'Slow-cooked basmati and chicken, served with raita and salan.', 32900, 'INR', 'ACTIVE', 10, '{"veg":false,"spice":2}'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Veg Dum Biryani',       'veg-dum-biryani',       'Seasonal vegetables and basmati, dum-cooked with whole spices.', 26900, 'INR', 'ACTIVE', 20, '{"veg":true,"spice":1}'),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Mutton Biryani',        'mutton-biryani',        'Tender mutton layered with saffron rice.',                      42900, 'INR', 'ACTIVE', 30, '{"veg":false,"spice":2}'),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Butter Chicken',        'butter-chicken',        'Tandoori chicken in a tomato, butter and cream gravy.',         31900, 'INR', 'ACTIVE', 10, '{"veg":false,"spice":1}'),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Paneer Butter Masala',  'paneer-butter-masala',  'Cottage cheese in a rich tomato gravy.',                         27900, 'INR', 'ACTIVE', 20, '{"veg":true,"spice":1}'),
  ('50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Dal Makhani',           'dal-makhani',           'Black lentils simmered overnight with butter.',                  21900, 'INR', 'ACTIVE', 30, '{"veg":true,"spice":0}'),
  ('50000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'Butter Naan',           'butter-naan',           'Tandoor-baked leavened bread brushed with butter.',               5900, 'INR', 'ACTIVE', 10, '{"veg":true}'),
  ('50000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'Tandoori Roti',         'tandoori-roti',         'Whole-wheat bread from the tandoor.',                             3900, 'INR', 'ACTIVE', 20, '{"veg":true}'),
  ('50000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 'Sweet Lassi',           'sweet-lassi',           'Chilled yoghurt drink.',                                          8900, 'INR', 'ACTIVE', 10, '{"veg":true}'),
  ('50000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 'Masala Chaas',          'masala-chaas',          'Spiced buttermilk.',                                              6900, 'INR', 'ACTIVE', 20, '{"veg":true}')
ON CONFLICT (id) DO UPDATE SET category_id = excluded.category_id, name = excluded.name, slug = excluded.slug, description = excluded.description,
  base_price_minor = excluded.base_price_minor, currency = excluded.currency, status = excluded.status, sort_order = excluded.sort_order,
  metadata = excluded.metadata, updated_at = now();

UPDATE products SET dietary = CASE WHEN (metadata->>'veg')::boolean THEN 'VEG' ELSE 'NON_VEG' END,
  spice_level = nullif(metadata->>'spice', '')::smallint, published_at = coalesce(published_at, now())
WHERE tenant_id = '10000000-0000-4000-8000-000000000001' AND id::text LIKE '50000000-%';

-- Option groups: biryani portion size (required) and add-ons (optional, up to 2).
INSERT INTO modifier_groups (id, tenant_id, name, description, min_selections, max_selections, status) VALUES
  ('52000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Portion', 'Choose your portion size', 1, 1, 'ACTIVE'),
  ('52000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Add-ons', 'Extras on the side', 0, 2, 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description, min_selections = excluded.min_selections, max_selections = excluded.max_selections, status = excluded.status, updated_at = now();

INSERT INTO modifiers (id, tenant_id, modifier_group_id, name, price_delta_minor, status, sort_order) VALUES
  ('53000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Regular', 0, 'ACTIVE', 0),
  ('53000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Family pack (serves 3)', 42000, 'ACTIVE', 1),
  ('53000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Extra raita', 3000, 'ACTIVE', 0),
  ('53000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Boiled egg', 2500, 'ACTIVE', 1),
  ('53000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Mirchi ka salan', 4000, 'ACTIVE', 2)
ON CONFLICT (id) DO UPDATE SET modifier_group_id = excluded.modifier_group_id, name = excluded.name, price_delta_minor = excluded.price_delta_minor, status = excluded.status, sort_order = excluded.sort_order, updated_at = now();

INSERT INTO product_modifier_groups (product_id, modifier_group_id, sort_order) VALUES
  ('50000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 0),
  ('50000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 1),
  ('50000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', 0),
  ('50000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 1),
  ('50000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000001', 0)
ON CONFLICT (product_id, modifier_group_id) DO UPDATE SET sort_order = excluded.sort_order;

-- One item marked out of stock so the storefront's "Unavailable" state is visible.
INSERT INTO availability_overrides (id, tenant_id, product_id, status, starts_at, ends_at, reason) VALUES
  ('51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'INACTIVE', NULL, NULL, 'Sold out for today')
ON CONFLICT (id) DO UPDATE SET product_id = excluded.product_id, status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, reason = excluded.reason;

INSERT INTO delivery_zones (id, tenant_id, name, rule_type, rule_config, fee_minor, eta_min, eta_max, minimum_order_minor, status) VALUES
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Indiranagar and nearby', 'POSTAL_CODE',
   '{"postalCodes":["560038","560008","560071","560075"]}', 3000, 30, 45, 19900, 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET name = excluded.name, rule_type = excluded.rule_type, rule_config = excluded.rule_config, fee_minor = excluded.fee_minor,
  eta_min = excluded.eta_min, eta_max = excluded.eta_max, minimum_order_minor = excluded.minimum_order_minor, status = excluded.status;

-- Fixed validity window (not now()-relative) so the seed is deterministic.
INSERT INTO promotions (id, tenant_id, code, title, description, type, value, status, starts_at, ends_at, minimum_order_minor, new_customer_only, once_per_customer, usage_cap) VALUES
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'WELCOME50', '₹50 off your first order', 'For new customers ordering direct.', 'FIXED', 5000, 'ACTIVE',
   '2026-01-01T00:00:00+05:30', '2030-12-31T23:59:59+05:30', 29900, true, true, NULL)
ON CONFLICT (id) DO UPDATE SET code = excluded.code, title = excluded.title, description = excluded.description, type = excluded.type, value = excluded.value,
  status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, minimum_order_minor = excluded.minimum_order_minor,
  new_customer_only = excluded.new_customer_only, once_per_customer = excluded.once_per_customer, usage_cap = excluded.usage_cap, updated_at = now();
