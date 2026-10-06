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
`POST /v1/admin/appearance/restore` — storefront theme draft/publish/history (ADR-012). Publish/restore return
`422 THEME_NOT_READABLE` with `details.issues` when text contrast fails. The public config endpoint returns the
normalised `theme`; `?theme=draft` (merchant preview) returns the saved draft instead.

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
