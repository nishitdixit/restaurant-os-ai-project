# Notifications

## Channels

- email;
- SMS;
- WhatsApp;
- in-app/admin notifications.

## Provider abstraction

Core code should depend on a `NotificationProvider` interface, not a vendor SDK.

## Notification types

### Customer

- order confirmation;
- payment result;
- order accepted;
- order ready/dispatched;
- delivery updates;
- cancellation/refund.

### Admin

- new order;
- payment issue;
- low stock later;
- delivery exception;
- integration error.

## Rules

- notification sending is not part of the critical database transaction where possible;
- every send has an idempotency key/event reference;
- retry only transient failures;
- cap repeated sends;
- preserve an audit trail of important outbound communications.

## Consent

Marketing messages require an explicit, compliant consent/eligibility mechanism appropriate to the channel and jurisdiction. Transactional notifications are modeled separately from marketing campaigns.
