# Product Principles

## 1. The restaurant is the tenant

The pilot is never hard-coded. Every business object that is tenant-owned carries an explicit tenant boundary or is reachable through an invariant tenant ownership chain.

## 2. Direct channel first

Direct ordering is the strategic destination. External marketplaces are valuable acquisition/distribution channels and should be integrated where commercially and technically appropriate.

## 3. Operational truth beats presentation

Availability, price, delivery zone, order status and payment state must have one authoritative internal model. UI should derive from it rather than maintain competing copies.

## 4. Simple for owners

Most restaurant operators should be able to understand the admin product without reading documentation. Prefer progressive disclosure, sensible defaults and action-oriented screens.

## 5. Model before UI

Define domain concepts and business rules before creating screens or endpoints. Avoid adding concepts solely because they look convenient in one screen.

## 6. Integrate through adapters

Payments, delivery, messaging and marketplace channels are external dependencies. Core domain logic must not be tightly coupled to one vendor.

## 7. SEO is a product capability

Public pages should be crawlable, fast, structured, canonical, indexable where appropriate and automatically maintainable through configuration and content.

## 8. No silent architecture drift

An implementation may simplify an approved design but must not silently introduce new domain concepts, persistence models or cross-module dependencies.

## 9. Data ownership is explicit

Customer data, order data, business configuration and analytics must have clear ownership, retention and access rules.

## 10. AI assists; humans decide

AI can draft, implement, review, test and analyze. Product, architecture, security, financial and legal decisions require explicit human approval.

## 11. Build reversible decisions early

Prefer modular monolith + clear interfaces over premature microservices. Prefer provider abstractions where switching providers is plausible.

## 12. Measure business value

Every major feature should map to a business outcome such as direct order conversion, repeat rate, lower cancellations, lower stock-outs, faster prep, lower delivery friction or better contribution margin.
