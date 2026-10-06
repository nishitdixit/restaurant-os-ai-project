# API Error Conventions

All API errors use the documented envelope:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable message",
    "details": {},
    "requestId": "opaque-request-id"
  }
}
```

Every response receives an `x-request-id`. Clients may supply one for correlation; the server generates one when absent.
