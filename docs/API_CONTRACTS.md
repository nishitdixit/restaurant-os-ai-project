# API Contracts

## General rules

- JSON over HTTPS for external-facing APIs.
- Version APIs when breaking changes are introduced.
- Errors use a consistent machine-readable shape.
- IDs are opaque strings/UUIDs; clients must not infer meaning.
- All monetary values use minor units plus currency.
- Timestamps are ISO-8601 UTC.
- List endpoints support pagination and stable ordering.
- Mutating endpoints support idempotency where a retry could duplicate a financial/operational effect.

## Error shape

```json
{
  "error": {
    "code": "ORDER_NOT_SERVICEABLE",
    "message": "The delivery address is outside the service area.",
    "details": {},
    "requestId": "..."
  }
}
```

## Public store endpoints (illustrative)

`GET /v1/storefront/{store}/config`

`GET /v1/storefront/{store}/categories`

`GET /v1/storefront/{store}/products`

`GET /v1/storefront/{store}/products/{slug}`

`POST /v1/storefront/{store}/cart/validate`

`POST /v1/storefront/{store}/checkout/quote`

`POST /v1/storefront/{store}/orders`

`GET /v1/storefront/{store}/orders/{publicToken}`

## Admin endpoints (illustrative)

`GET /v1/admin/dashboard`

`GET/POST/PATCH /v1/admin/products`

`POST /v1/admin/products/{id}/availability`

`GET /v1/admin/orders`

`POST /v1/admin/orders/{id}/transition`

`GET/POST/PATCH /v1/admin/promotions`

`GET /v1/admin/customers`

`GET/POST/PATCH /v1/admin/delivery-zones`

`GET /v1/admin/analytics/...`

`GET /v1/admin/appearance` · `PUT|DELETE /v1/admin/appearance/draft` · `POST /v1/admin/appearance/publish` ·
`POST /v1/admin/appearance/restore` — storefront theme **and experience** draft/publish/history (ADR-012, ADR-013).
Draft saves take `{ theme?, experience? }` (either or both); publish/restore make both live as one version. Errors:
`422 THEME_NOT_READABLE` (text contrast) or `422 EXPERIENCE_NOT_READY` (homepage photo without alt text), each
with `details.issues`. The state includes `experience.{published, draft, check}` and a `media` map.

`POST /v1/admin/preview-token` → `{ token, expiresAt, brandSlug }`: signed, expiring merchant preview link
(`tenant.read`). Public endpoints accept `?preview=<token>`; a valid token for the store shows the unpublished store,
draft dishes stay hidden, and `config` returns the draft theme and experience with `preview: true`. Anything else
(including the old `?preview=1`) gets the public view.

`GET /v1/admin/media?kind=` · `POST /v1/admin/media?kind=&alt=` (multipart upload) · `PATCH /v1/admin/media/:id`
(`altText`, `kind`) · `DELETE /v1/admin/media/:id` (`409 MEDIA_IN_USE` with `details.usedIn` while used) — media
library with alt text and usage.

`GET|PUT /v1/admin/settings/policies` — refund/terms/privacy/delivery policy text; public
`GET /v1/storefront/:store/policies/:key`. Business settings take `fssai` (14 digits).

Public `config` adds `experience`, `media`, `stats.paidOrders` (null below 50), `credentials`, `policies`,
`deliveryAreas[].freeDeliveryMinimumMinor`, `preview`. `menu` adds `bestsellerIds` and per dish `nameHi`,
`descriptionHi`, `badges`, `bestseller`, `gallery`; per category `nameHi`, `descriptionHi`, `imageUrl`. Quotes add
`delivery.freeDeliveryMinimumMinor`; offers add `minimumOrderMinor`. Products take `nameHi`, `descriptionHi`,
`badges`, `galleryAssetIds`; categories take `nameHi`, `descriptionHi`, `imageAssetId` (slugs can't be store page
names); delivery areas take `freeDeliveryMinimumMinor`.

## Webhooks

Incoming provider webhooks must:

1. authenticate/verify signature;
2. parse into provider adapter model;
3. check provider event idempotency;
4. map to internal event/domain transition;
5. persist processing result;
6. return provider-expected acknowledgement.

## API design guidance

Prefer domain-oriented endpoints where they express a real operation, for example `POST /products/{id}/availability` rather than exposing arbitrary state mutation from the client.

Avoid generic `PATCH` endpoints that let clients mutate unrelated fields without domain validation.

## OpenAPI

The actual implementation must generate/maintain OpenAPI documentation from typed contracts. This document describes invariants; generated docs become implementation detail.
