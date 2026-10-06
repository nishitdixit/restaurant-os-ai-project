# Observability

## Logs

Structured JSON logs with:

- timestamp;
- service/module;
- level;
- request ID;
- tenant ID where appropriate;
- user ID where appropriate;
- event name;
- duration;
- error code.

Do not log secrets or unnecessary PII.

## Metrics

System:

- request latency;
- error rate;
- queue depth;
- job failures;
- DB latency;
- cache hit/miss where used.

Business:

- orders created;
- payment success/failure;
- order cancellation;
- checkout conversion;
- delivery failures;
- stock-out toggles.

## Alerts

Critical alerts:

- elevated API 5xx;
- payment webhook failures;
- order creation errors;
- queue backlog;
- DB health issue;
- storage failure.

## Correlation

An order-related support case should be traceable from order ID to request logs, payment/provider events and notification attempts.
