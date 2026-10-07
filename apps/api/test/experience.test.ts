// Storefront brand experience (ADR-013): homepage sections drafted and published together with the theme, signed
// merchant preview, media library with alt text and usage, honest bestsellers, dish badges and photos, Hindi copy,
// category photos, free delivery, FSSAI and policy pages — strictly per restaurant.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { defaultExperience, defaultSection, presetById } from "@restaurant-os/domain";
import { address, createMember, headers, openAllDay, orderBody, P, PILOT_TENANT, placeOrder, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let verifier: Awaited<ReturnType<typeof startApp>>["verifier"];
let owner: string;
let manager: string;
let ownerB: string;
let tenantB: string;

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
function multipart(content: Buffer) {
  const boundary = "----ros-experience-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(token: string, query = "", tenant = PILOT_TENANT): Promise<string> {
  const file = multipart(PNG);
  const res = await app.inject({ method: "POST", url: `/v1/admin/media${query}`, headers: { ...headers(token, tenant), "content-type": file.contentType }, payload: file.body });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().id;
}

async function previewQuery(slug = "pilot") {
  const { issuePreviewToken } = await import("../src/lib/preview.ts");
  return `?preview=${issuePreviewToken(slug).token}`;
}

const config = async (query = "") => (await app.inject(`/v1/storefront/pilot/config${query}`)).json();
const appearance = async (token = owner) => (await app.inject({ url: "/v1/admin/appearance", headers: headers(token) })).json();
const saveDraft = (payload: Record<string, unknown>, token = owner, tenant = PILOT_TENANT) => app.inject({ method: "PUT", url: "/v1/admin/appearance/draft", headers: headers(token, tenant), payload });
const publish = (payload: Record<string, unknown> = {}, token = owner, tenant = PILOT_TENANT) => app.inject({ method: "POST", url: "/v1/admin/appearance/publish", headers: headers(token, tenant), payload });

after(teardown);
before(async () => {
  await setupDatabase();
  ({ app, verifier } = await startApp());
  owner = (await createMember(PILOT_TENANT, "OWNER", "exp_owner")).token;
  manager = (await createMember(PILOT_TENANT, "MANAGER", "exp_manager")).token;
  verifier.emails.set("exp_founder_b", "exp-founder@b.example");
  const created = await app.inject({ method: "POST", url: "/v1/restaurants", headers: { authorization: "Bearer user:exp_founder_b" }, payload: { businessName: "B Foods", brandName: "Bee Bites", brandSlug: "bee-bites", phone: "9876500001", city: "Pune" } });
  assert.equal(created.statusCode, 201, created.body);
  tenantB = created.json().tenantId;
  ownerB = "user:exp_founder_b";
  await openAllDay();
});

test("a restaurant that never edited its layout gets the default composition, unchanged", async () => {
  const c = await config();
  assert.deepEqual(c.experience, defaultExperience());
  assert.deepEqual(c.media, {});
  assert.equal(c.stats.paidOrders, null, "an order count is only shown once there are enough real orders");
  assert.equal(c.preview, false);
  const state = await appearance();
  assert.equal(state.experience.draft, null);
  assert.deepEqual(state.experience.check.errors, []);
});

test("layout drafts are private to the signed preview, publish together with the theme, and are versioned", async () => {
  const story = { ...defaultSection("story", "our-story"), title: { en: "Our story", hi: "हमारी कहानी" }, body: { en: "Three generations of biryani.", hi: "" } };
  const experience = { ...defaultExperience(), sections: [defaultSection("hero"), story] };
  const saved = await saveDraft({ experience, theme: presetById("saffron-house")!.theme });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().experience.draft.sections.length, 2);
  assert.equal((await config()).experience.sections.length, defaultExperience().sections.length, "customers still see the live layout");
  assert.equal((await config("?preview=1")).experience.sections.length, defaultExperience().sections.length, "an unsigned preview sees only the live layout");
  const previewed = await config(await previewQuery());
  assert.equal(previewed.preview, true);
  assert.equal(previewed.experience.sections[1].title.hi, "हमारी कहानी");
  assert.equal(previewed.theme.presetId, "saffron-house");

  const published = await publish();
  assert.equal(published.statusCode, 200, published.body);
  assert.equal(published.json().experience.draft, null);
  const live = await config();
  assert.deepEqual(live.experience.sections.map((s: { id: string }) => s.id), ["hero", "our-story"]);
  assert.equal(live.theme.presetId, "saffron-house");

  // A layout-only change leaves the live theme alone, and both are recorded in history together.
  const again = await saveDraft({ experience: { ...experience, sections: [defaultSection("hero"), defaultSection("offers")] } });
  assert.equal(again.json().draft, null, "no theme draft was created");
  await publish();
  const state = await appearance();
  assert.equal(state.versions.length, 2);
  assert.equal(state.published.presetId, "saffron-house");
  const first = state.versions[1].id;
  const restored = await app.inject({ method: "POST", url: "/v1/admin/appearance/restore", headers: headers(owner), payload: { versionId: first } });
  assert.equal(restored.statusCode, 200, restored.body);
  assert.deepEqual(restored.json().experience.published.sections.map((s: { id: string }) => s.id), ["hero", "our-story"], "the layout comes back with its look");
});

test("homepage photos need alt text before publishing; the media library records it", async () => {
  const photo = await upload(owner, "?kind=hero");
  const experience = { ...defaultExperience(), sections: [{ ...defaultSection("hero"), imageId: photo }] };
  await saveDraft({ experience });
  const blocked = await publish();
  assert.equal(blocked.statusCode, 422);
  assert.equal(blocked.json().error.code, "EXPERIENCE_NOT_READY");
  const described = await app.inject({ method: "PATCH", url: `/v1/admin/media/${photo}`, headers: headers(owner), payload: { altText: "Chicken biryani in a copper handi" } });
  assert.equal(described.statusCode, 200, described.body);
  assert.equal(described.json().altText, "Chicken biryani in a copper handi");
  assert.equal((await publish()).statusCode, 200);
  const live = await config();
  assert.equal(live.experience.sections[0].imageId, photo);
  assert.equal(live.media[photo].alt, "Chicken biryani in a copper handi");
  assert.match(live.media[photo].url, /\/media\//);

  // In use: can't be deleted, and the library says where it's used.
  const library = (await app.inject({ url: "/v1/admin/media?kind=hero", headers: headers(owner) })).json().items;
  assert.deepEqual(library.find((m: { id: string }) => m.id === photo).usedIn, ["Hero banner"]);
  const del = await app.inject({ method: "DELETE", url: `/v1/admin/media/${photo}`, headers: headers(owner) });
  assert.equal(del.statusCode, 409);
  assert.equal(del.json().error.code, "MEDIA_IN_USE");
  const unused = await upload(owner);
  assert.equal((await app.inject({ method: "DELETE", url: `/v1/admin/media/${unused}`, headers: headers(owner) })).statusCode, 204);
});

test("another restaurant's photos, dishes and categories can't be placed on your homepage", async () => {
  const theirPhoto = await upload(ownerB, "", tenantB);
  const experience = {
    ...defaultExperience(),
    sections: [
      { ...defaultSection("hero"), imageId: theirPhoto },
      { ...defaultSection("featured"), source: "picked", productIds: [P.chickenBiryani] },
      { ...defaultSection("gallery"), images: [{ imageId: theirPhoto, caption: "x" }] },
    ],
  };
  // Tenant B tries to feature tenant A's dish; tenant A tries to use B's photo.
  const fromB = await saveDraft({ experience }, ownerB, tenantB);
  assert.equal(fromB.statusCode, 200, fromB.body);
  const bDraft = fromB.json().experience.draft;
  assert.deepEqual(bDraft.sections[1].productIds, [], "B can't feature A's dish");
  assert.equal(bDraft.sections[0].imageId, theirPhoto, "B's own photo is fine");
  const fromA = await saveDraft({ experience });
  const aDraft = fromA.json().experience.draft;
  assert.equal(aDraft.sections[0].imageId, null);
  assert.deepEqual(aDraft.sections[2].images, []);
  assert.deepEqual(aDraft.sections[1].productIds, [P.chickenBiryani]);
  assert.equal((await app.inject({ method: "PATCH", url: `/v1/admin/media/${theirPhoto}`, headers: headers(owner), payload: { altText: "x" } })).statusCode, 404);
  assert.equal((await app.inject({ method: "DELETE", url: `/v1/admin/media/${theirPhoto}`, headers: headers(owner) })).statusCode, 404);
  await app.inject({ method: "DELETE", url: "/v1/admin/appearance/draft", headers: headers(owner) });
});

test("only staff can mint preview links, and managers can't change the layout", async () => {
  const minted = await app.inject({ method: "POST", url: "/v1/admin/preview-token", headers: headers(owner) });
  assert.equal(minted.statusCode, 200);
  assert.equal(minted.json().brandSlug, "pilot");
  assert.equal((await config(`?preview=${minted.json().token}`)).preview, true);
  assert.equal((await config(`?preview=${minted.json().token}x`)).preview, false, "a tampered token is ignored");
  assert.equal((await app.inject({ method: "POST", url: "/v1/admin/preview-token" })).statusCode, 401);
  assert.equal((await saveDraft({ experience: defaultExperience() }, manager)).statusCode, 403);
});

test("bestsellers come only from paid orders, and dishes carry the merchant's badges", async () => {
  // Rules: a single paid order is enough in this test.
  await saveDraft({ experience: { ...defaultExperience(), menu: { ...defaultExperience().menu, bestseller: { enabled: true, windowDays: 30, minOrders: 1, limit: 3 } } } });
  await publish();
  let menu = (await app.inject("/v1/storefront/pilot/menu")).json();
  assert.deepEqual(menu.bestsellerIds, [], "no sales, no bestsellers");

  // An unpaid order doesn't count; a paid one does.
  const unpaid = await placeOrder(app, orderBody({ lines: [{ productId: P.dalMakhani, quantity: 3, modifierIds: [] }] }));
  assert.equal(unpaid.statusCode, 201, unpaid.body);
  const paid = await placeOrder(app, orderBody({ lines: [{ productId: P.butterChicken, quantity: 2, modifierIds: [] }] }));
  const pay = await app.inject({ method: "POST", url: `/v1/storefront/pilot/orders/${paid.json().order.token}/payments/mock-complete`, payload: { outcome: "success" } });
  assert.equal(pay.statusCode, 200, pay.body);
  menu = (await app.inject("/v1/storefront/pilot/menu")).json();
  assert.deepEqual(menu.bestsellerIds, [P.butterChicken]);
  const dish = menu.categories.flatMap((c: { products: { id: string }[] }) => c.products).find((p: { id: string }) => p.id === P.butterChicken);
  assert.equal(dish.bestseller, true);
  assert.equal(dish.badges[0].label, "Bestseller");

  // Merchant badges, Hindi name and extra photos on a dish.
  const product = (await app.inject({ url: `/v1/admin/products/${P.dalMakhani}`, headers: headers(owner) })).json();
  const extra = await upload(owner, "?kind=product&alt=Dal%20makhani%20close-up");
  const body = {
    categoryId: product.categoryId, name: product.name, description: product.description, longDescription: product.longDescription, basePriceMinor: product.basePriceMinor,
    imageAssetId: product.imageAssetId, dietary: product.dietary, spiceLevel: product.spiceLevel, allergens: product.allergens, tags: product.tags,
    modifierGroupIds: product.modifierGroupIds, status: product.status, nameHi: "दाल मखनी", descriptionHi: "",
    badges: [{ kind: "signature" }, { kind: "custom", label: "Slow-cooked 12h" }], galleryAssetIds: [extra],
  };
  const updated = await app.inject({ method: "PUT", url: `/v1/admin/products/${P.dalMakhani}`, headers: headers(owner), payload: body });
  assert.equal(updated.statusCode, 200, updated.body);
  const live = (await app.inject(`/v1/storefront/pilot/products/${product.slug}`)).json();
  assert.equal(live.nameHi, "दाल मखनी");
  assert.deepEqual(live.badges.map((b: { label: string }) => b.label), ["Signature", "Slow-cooked 12h"]);
  assert.deepEqual(live.gallery, [{ url: live.gallery[0].url, alt: "Dal makhani close-up" }]);
  const hindiSearch = (await app.inject(`/v1/storefront/pilot/search?q=${encodeURIComponent("मखनी")}`)).json().items;
  assert.deepEqual(hindiSearch.map((p: { id: string }) => p.id), [P.dalMakhani]);
  // Another restaurant's photo can't be attached to a dish.
  const theirs = await upload(ownerB, "", tenantB);
  const cross = await app.inject({ method: "PUT", url: `/v1/admin/products/${P.dalMakhani}`, headers: headers(owner), payload: { ...body, galleryAssetIds: [theirs] } });
  assert.equal(cross.statusCode, 422);
});

test("categories have photos and Hindi names; store pages can't be shadowed by a category", async () => {
  const photo = await upload(owner, "?kind=category&alt=Biryani");
  const created = await app.inject({ method: "POST", url: "/v1/admin/categories", headers: headers(owner), payload: { name: "Thalis", nameHi: "थाली", imageAssetId: photo } });
  assert.equal(created.statusCode, 201, created.body);
  const list = (await app.inject({ url: "/v1/admin/categories", headers: headers(owner) })).json().items;
  const thalis = list.find((c: { id: string }) => c.id === created.json().id);
  assert.equal(thalis.nameHi, "थाली");
  assert.match(thalis.imageUrl, /\/media\//);
  const reserved = await app.inject({ method: "POST", url: "/v1/admin/categories", headers: headers(owner), payload: { name: "Offers", slug: "offers" } });
  assert.equal(reserved.statusCode, 400);
  const auto = await app.inject({ method: "POST", url: "/v1/admin/categories", headers: headers(owner), payload: { name: "Offers" } });
  assert.equal(auto.statusCode, 201);
  const slug = (await app.inject({ url: "/v1/admin/categories", headers: headers(owner) })).json().items.find((c: { id: string }) => c.id === auto.json().id).slug;
  assert.notEqual(slug, "offers");
});

test("free delivery above an area's threshold is applied by the server", async () => {
  const zones = (await app.inject({ url: "/v1/admin/delivery-zones", headers: headers(owner) })).json().items;
  const zone = zones.find((z: { postalCodes: string[] }) => z.postalCodes.includes(address.postalCode));
  const put = await app.inject({ method: "PUT", url: `/v1/admin/delivery-zones/${zone.id}`, headers: headers(owner), payload: { ...zone, freeDeliveryMinimumMinor: 60000 } });
  assert.equal(put.statusCode, 200, put.body);
  const small = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { ...orderBody({ lines: [{ productId: P.naan, quantity: 1, modifierIds: [] }] }), customerPhone: "" } })).json();
  assert.equal(small.feeMinor, zone.feeMinor);
  assert.equal(small.delivery.freeDeliveryMinimumMinor, 60000);
  const big = (await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { ...orderBody({ lines: [{ productId: P.butterChicken, quantity: 3, modifierIds: [] }] }), customerPhone: "" } })).json();
  assert.ok(big.subtotalMinor >= 60000);
  assert.equal(big.feeMinor, 0);
  assert.equal(big.totalMinor, big.subtotalMinor - big.discountMinor);
  assert.equal((await config()).deliveryAreas.find((a: { name: string }) => a.name === zone.name).freeDeliveryMinimumMinor, 60000);
});

test("FSSAI number and policy pages are shown on the storefront", async () => {
  const settings = (await app.inject({ url: "/v1/admin/settings", headers: headers(owner) })).json().business;
  const saved = await app.inject({ method: "PUT", url: "/v1/admin/settings/business", headers: headers(owner), payload: { ...settings, fssai: "12345678901234" } });
  assert.equal(saved.statusCode, 200, saved.body);
  const bad = await app.inject({ method: "PUT", url: "/v1/admin/settings/business", headers: headers(owner), payload: { ...settings, fssai: "123" } });
  assert.equal(bad.statusCode, 400);
  assert.equal((await app.inject("/v1/storefront/pilot/policies/refund")).statusCode, 404, "no policy written yet");
  const policies = await app.inject({ method: "PUT", url: "/v1/admin/settings/policies", headers: headers(owner), payload: { policies: { refund: { body: { en: "Cancel before we accept for a full refund.", hi: "" } } } } });
  assert.equal(policies.statusCode, 200, policies.body);
  const c = await config();
  assert.equal(c.credentials.fssai, "12345678901234");
  assert.deepEqual(c.policies, [{ key: "refund", title: "Cancellation & refund policy" }]);
  const page = (await app.inject("/v1/storefront/pilot/policies/refund")).json();
  assert.equal(page.body.en, "Cancel before we accept for a full refund.");
  assert.ok(page.updatedAt);
  assert.equal((await app.inject(`/v1/storefront/bee-bites/policies/refund${await previewQuery("bee-bites")}`)).statusCode, 404, "policies are per restaurant");
});
