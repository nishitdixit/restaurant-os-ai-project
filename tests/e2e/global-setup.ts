// Puts the seeded pilot store into a known state: open all day, accepting orders, seed stock levels.
import pg from "pg";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set E2E_DATABASE_URL to the database the API under test uses.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["00:00", "23:59"], ["23:59", "00:00"]]]));
  await client.query(`UPDATE outlets SET hours = $1, accepting_orders = true, delivery_enabled = true, pickup_enabled = true WHERE id = '30000000-0000-4000-8000-000000000001'`, [JSON.stringify(hours)]);
  await client.query(`UPDATE brands SET status = 'ACTIVE' WHERE slug = 'pilot'`);
  // Restore stock for the items the specs order; the seeded out-of-stock Mutton Biryani stays out.
  await client.query(`UPDATE availability_overrides SET ends_at = now() WHERE product_id <> '50000000-0000-4000-8000-000000000003' AND (ends_at IS NULL OR ends_at > now())`);
  await client.end();
}
