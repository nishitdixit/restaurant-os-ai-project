# Working Assumptions

These assumptions are deliberately explicit so an AI agent does not invent hidden product decisions.

1. Initial geography: India.
2. Initial business type: cloud kitchen / delivery-first restaurant.
3. Initial currency: INR, but schema/API are currency-aware.
4. MVP has one outlet per tenant operationally, but model supports more.
5. MVP has one brand per tenant operationally, but model supports more.
6. Customer app is web-first; native customer app is deferred.
7. Admin is web-first.
8. Backend is a TypeScript modular monolith.
9. Public storefront uses Next.js for SEO/performance.
10. PostgreSQL is the system of record.
11. Redis is used for async/background work where appropriate.
12. Payment, messaging and delivery providers are abstracted.
13. Swiggy/Zomato/other marketplace connectivity depends on supported partner/API access.
14. Google ranking cannot be guaranteed.
15. Advanced inventory starts after the direct-order workflow is stable.
16. The platform should be deployable for multiple tenants before paid commercialization.

17. Menu prices are tax-inclusive; the MVP does not compute or display GST (pending sign-off, BUSINESS_RULES.md P1).
18. Payments and customer messaging run on development providers until a Razorpay sandbox run and a messaging provider are approved (ADR-010).
19. A customer is identified by mobile number within a restaurant (BUSINESS_RULES.md P7).
20. Each storefront deployment serves one configured brand; custom-domain mapping waits for DNS-verified domains (backlog P1).
21. The pilot tenant is provisioned by an operator (seed/invite); self-service restaurant sign-up is a Gate 4 capability and is disabled by default.

When evidence changes an assumption, update this file and the relevant ADR/spec.
