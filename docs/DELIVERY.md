# Delivery System

## MVP

Manual dispatch workflow with provider-agnostic model.

## Core concepts

`Order -> DeliveryOrder -> DeliveryProvider`

## Delivery provider interface (conceptual)

```text
quote(request)
create_job(request)
cancel_job(job_id)
get_status(job_id)
get_tracking(job_id)
```

Not every provider will support every operation. Capability discovery must be explicit.

## Delivery lifecycle

`PENDING -> QUOTED -> REQUESTED -> ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED`

Failure/cancellation states are modeled explicitly.

## MVP manual flow

1. order becomes ready;
2. admin opens delivery panel;
3. sees address, phone, package notes and internal ETA;
4. selects manual/provider method;
5. records reference/driver details;
6. updates status;
7. customer receives relevant status updates.

## Delivery pricing

MVP uses merchant-configured delivery zones/fees. Later, provider quote can override or supplement this when configured.

## Future automation

- Porter integration if official and commercially permitted;
- other local delivery providers;
- automatic provider selection based on price/ETA/capability;
- delivery SLA analytics.

## Safety

Do not create a fake integration against a vendor that has not provided a supported API/partner mechanism.
