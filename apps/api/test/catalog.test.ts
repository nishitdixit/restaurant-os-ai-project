// Journey B (owner launches menu) and Journey C (stock toggle): merchant edits without a developer.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createMember, db, headers, openAllDay, orderBody, P, PILOT_TENANT, placeOrder, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let verifier: Awaited<ReturnType<typeof startApp>>["verifier"];
let owner: string;

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app, verifier } = await startApp());
  await openAllDay();
  owner = (await createMember(PILOT_TENANT, "OWNER")).token;
});

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

function multipart(filename: string, content: Buffer, type: string) {
  const boundary = "----ros-test-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

test("create, draft, publish and edit a product with image and option groups", async () => {
  const upload = multipart("thali.png", PNG, "image/png");
  const media = await app.inject({ method: "POST", url: "/v1/admin/media", headers: { ...headers(owner), "content-type": upload.contentType }, payload: upload.body });
  assert.equal(media.statusCode, 201, media.body);
  const fake = multipart("evil.png", Buffer.from("<script>alert(1)</script>"), "image/png");
  const rejected = await app.inject({ method: "POST", url: "/v1/admin/media", headers: { ...headers(owner), "content-type": fake.contentType }, payload: fake.body });
  assert.equal(rejected.statusCode, 415, "type is sniffed from bytes, not trusted from the client");

  const cat = (await app.inject({ method: "POST", url: "/v1/admin/categories", headers: headers(owner), payload: { name: "Thalis" } })).json();
  const group = await app.inject({ method: "POST", url: "/v1/admin/modifier-groups", headers: headers(owner), payload: { name: "Bread", minSelections: 1, maxSelections: 1, modifiers: [{ name: "Roti", priceDeltaMinor: 0 }, { name: "Naan", priceDeltaMinor: 2000 }] } });
  assert.equal(group.statusCode, 201, group.body);
  const created = await app.inject({ method: "POST", url: "/v1/admin/products", headers: headers(owner), payload: {
    categoryId: cat.id, name: "Veg Thali", description: "Dal, sabzi, rice, bread", basePriceMinor: 24900, imageAssetId: media.json().id, dietary: "VEG", spiceLevel: 1,
    tags: ["thali", "lunch"], modifierGroupIds: [group.json().id], status: "DRAFT",
  } });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;

  const draftMenu = (await app.inject("/v1/storefront/pilot/menu")).json();
  assert.ok(!draftMenu.categories.some((c: { name: string }) => c.name === "Thalis"), "drafts are not public");
  await app.inject({ method: "POST", url: "/v1/admin/products/status", headers: headers(owner), payload: { productIds: [id], status: "ACTIVE" } });
  const product = (await app.inject("/v1/storefront/pilot/products/veg-thali")).json();
  assert.equal(product.name, "Veg Thali");
  assert.ok(product.imageUrl.includes("/media/"));
  assert.equal(product.modifierGroups[0].modifiers[1].priceDeltaMinor, 2000);
  assert.ok((await app.inject("/v1/storefront/pilot/search?q=thali")).json().items.length === 1);

  const dup = (await app.inject({ method: "POST", url: `/v1/admin/products/${id}/duplicate`, headers: headers(owner) })).json();
  const copy = (await app.inject({ url: `/v1/admin/products/${dup.id}`, headers: headers(owner) })).json();
  assert.equal(copy.status, "DRAFT");
  assert.equal(copy.slug, "veg-thali-copy");
});

test("price edits are audited and never change historical orders", async () => {
  const placed = (await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, lines: [{ productId: P.butterChicken, quantity: 1, modifierIds: [] }] }))).json();
  const before = (await app.inject({ url: `/v1/admin/products/${P.butterChicken}`, headers: headers(owner) })).json();
  const { id: _id, categoryName: _c, imageUrl: _i, available: _a, unavailableReason: _r, unavailableUntil: _u, currency: _cur, sortOrder: _s, updatedAt: _up, ...editable } = before;
  const put = await app.inject({ method: "PUT", url: `/v1/admin/products/${P.butterChicken}`, headers: headers(owner), payload: { ...editable, basePriceMinor: 35900 } });
  assert.equal(put.statusCode, 200, put.body);
  const order = (await app.inject(`/v1/storefront/pilot/orders/${placed.order.token}`)).json();
  assert.equal(order.items[0].unitPriceMinor, 31900, "snapshot keeps the price paid");
  const q = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { lines: [{ productId: P.butterChicken, quantity: 1 }], fulfillmentType: "PICKUP" } })).json();
  assert.equal(q.subtotalMinor, 35900);
  const audit = (await app.inject({ url: `/v1/admin/audit?entityType=Product&entityId=${P.butterChicken}`, headers: headers(owner) })).json().items;
  const change = audit.find((a: { eventName: string }) => a.eventName === "ProductPriceChanged");
  assert.deepEqual([change.metadata.fromMinor, change.metadata.toMinor], [31900, 35900]);
});

test("bulk stock toggle takes effect on the next storefront request and checkout", async () => {
  const off = await app.inject({ method: "POST", url: "/v1/admin/products/availability", headers: headers(owner), payload: { productIds: [P.dalMakhani, P.naan], available: false, reason: "Sold out today" } });
  assert.deepEqual(off.json(), { updated: 2 });
  const menu = (await app.inject("/v1/storefront/pilot/menu")).json().categories.flatMap((c: { products: unknown[] }) => c.products);
  const dal = menu.find((p: { id: string }) => p.id === P.dalMakhani);
  assert.equal(dal.available, false);
  assert.equal(dal.unavailableReason, "Sold out today");
  const order = await placeOrder(app, orderBody({ fulfillmentType: "PICKUP", address: null, lines: [{ productId: P.dalMakhani, quantity: 1, modifierIds: [] }] }));
  assert.equal(order.json().error.code, "ITEM_UNAVAILABLE");
  await app.inject({ method: "POST", url: "/v1/admin/products/availability", headers: headers(owner), payload: { productIds: [P.dalMakhani, P.naan], available: true, reason: "" } });
  const back = (await app.inject("/v1/storefront/pilot/products/dal-makhani")).json();
  assert.equal(back.available, true);
  const timed = await app.inject({ method: "POST", url: "/v1/admin/products/availability", headers: headers(owner), payload: { productIds: [P.naan], available: false, reason: "", until: new Date(Date.now() - 1000).toISOString() } });
  assert.equal(timed.statusCode, 422);
});

test("archived products and option changes keep validation strict", async () => {
  await app.inject({ method: "POST", url: "/v1/admin/products/status", headers: headers(owner), payload: { productIds: [P.vegBiryani], status: "ARCHIVED" } });
  assert.equal((await app.inject("/v1/storefront/pilot/products/veg-dum-biryani")).statusCode, 404);
  const q = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { lines: [{ productId: P.vegBiryani, quantity: 1 }], fulfillmentType: "PICKUP" } })).json();
  assert.match(q.lines[0].problem, /no longer on the menu/);
  const bad = await app.inject({ method: "POST", url: "/v1/admin/modifier-groups", headers: headers(owner), payload: { name: "X", minSelections: 3, maxSelections: 1, modifiers: [{ name: "A", priceDeltaMinor: 0 }] } });
  assert.equal(bad.statusCode, 400);
  const nonEmpty = (await app.inject({ url: "/v1/admin/categories", headers: headers(owner) })).json().items[0];
  assert.equal((await app.inject({ method: "DELETE", url: `/v1/admin/categories/${nonEmpty.id}`, headers: headers(owner) })).statusCode, 409);
});

test("onboarding: checklist blocks publishing until setup is complete", async () => {
  verifier.emails.set("newbie", "newbie@example.com");
  const created = (await app.inject({ method: "POST", url: "/v1/restaurants", headers: { authorization: "Bearer user:newbie" }, payload: { businessName: "Dosa Co", brandName: "Dosa Co", brandSlug: "dosa-co", phone: "9123456780", city: "Chennai" } })).json();
  const h = headers("user:newbie", created.tenantId);
  const setup = (await app.inject({ url: "/v1/admin/setup", headers: h })).json();
  assert.equal(setup.published, false);
  assert.ok(setup.progress < 100);
  const publish = await app.inject({ method: "POST", url: "/v1/admin/publish", headers: h, payload: { published: true } });
  assert.equal(publish.json().error.code, "SETUP_INCOMPLETE");
  const blockers = publish.json().error.details.blockers.map((b: { key: string }) => b.key);
  assert.deepEqual(blockers.sort(), ["catalog", "delivery", "outlet"]);

  const settings = (await app.inject({ url: "/v1/admin/settings", headers: h })).json();
  await app.inject({ method: "PUT", url: "/v1/admin/settings/outlet", headers: h, payload: { ...settings.outlet, address: { line1: "12 Main Rd", line2: "", city: "Chennai", region: "TN", postalCode: "600001" }, deliveryEnabled: false } });
  const cat = (await app.inject({ method: "POST", url: "/v1/admin/categories", headers: h, payload: { name: "Dosas" } })).json();
  await app.inject({ method: "POST", url: "/v1/admin/products", headers: h, payload: { categoryId: cat.id, name: "Masala Dosa", basePriceMinor: 12000, status: "ACTIVE" } });
  const ok = await app.inject({ method: "POST", url: "/v1/admin/publish", headers: h, payload: { published: true } });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().published, true);
  assert.equal((await app.inject("/v1/storefront/dosa-co/menu")).json().categories[0].products[0].name, "Masala Dosa");
  const config = (await app.inject("/v1/storefront/dosa-co/config")).json();
  assert.equal(config.outlet.deliveryEnabled, false);
});

test("brand settings validate slugs and links; business settings round-trip", async () => {
  const settings = (await app.inject({ url: "/v1/admin/settings", headers: headers(owner) })).json();
  const clash = await app.inject({ method: "PUT", url: "/v1/admin/settings/brand", headers: headers(owner), payload: { ...settings.brand, slug: "dosa-co" } });
  assert.equal(clash.json().error.code, "SLUG_TAKEN");
  const badLink = await app.inject({ method: "PUT", url: "/v1/admin/settings/brand", headers: headers(owner), payload: { ...settings.brand, links: { ...settings.brand.links, swiggy: "not a url" } } });
  assert.equal(badLink.statusCode, 400);
  const ok = await app.inject({ method: "PUT", url: "/v1/admin/settings/business", headers: headers(owner), payload: { ...settings.business, gstin: "29ABCDE1234F1Z5" } });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal((await app.inject({ url: "/v1/admin/settings", headers: headers(owner) })).json().business.gstin, "29ABCDE1234F1Z5");
  const pause = await app.inject({ method: "POST", url: "/v1/admin/settings/accepting-orders", headers: headers(owner), payload: { acceptingOrders: false } });
  assert.equal(pause.statusCode, 200);
  assert.equal((await app.inject("/v1/storefront/pilot/config")).json().outlet.acceptingOrders, false);
  await app.inject({ method: "POST", url: "/v1/admin/settings/accepting-orders", headers: headers(owner), payload: { acceptingOrders: true } });
  const d = await db();
  assert.ok((await d.query(`SELECT 1 FROM audit_events WHERE event_name = 'OrderingPaused'`)).rowCount);
});
