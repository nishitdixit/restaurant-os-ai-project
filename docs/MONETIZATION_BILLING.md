# SaaS Billing Strategy

## Deferred from pilot

The pilot can be provisioned manually.

## V1 billing model

A subscription should be attached to the tenant and have:

- plan;
- status;
- billing period;
- limits;
- current usage;
- provider/customer/subscription references.

## Possible limits

- outlets;
- brands;
- admin users;
- orders/month;
- messaging volume;
- storage;
- advanced analytics/AI access.

## Billing architecture

Provider-specific billing objects must remain at the integration boundary. Core tenant billing status should be provider-neutral.

## Important

Do not add monetization fees to customer checkout unless the business model explicitly requires them and they are transparent to the customer.
